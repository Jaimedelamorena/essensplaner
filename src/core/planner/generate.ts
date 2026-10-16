import { pantryAvailable, pantryExpiringSoon } from '../pantry';
import { groupByIngredient } from '../pricing';
import { SLOTS_PER_WEEK } from '../plan';
import type { Ingredient, MealType, PantryItem, Product, Recipe, Settings, Slot, WeekPlan } from '../types';
import { createUnitPrices, evaluate, type Evaluation, type PlannerContext } from './evaluate';
import { baseCandidates, fitsSlot } from './filter';
import { createRng, pickTop } from './random';

export interface PlannerInput {
  recipes: Recipe[];
  ingredients: Ingredient[];
  products: Product[];
  pantry: PantryItem[];
  settings: Settings;
  favorites: string[];
  blocked: string[];
  /** Rezepte der Vorwoche – werden möglichst nicht wiederholt. */
  lastWeek: string[];
  weekStart: string;
  alreadySpent?: number;
  seed?: number;
}

export interface GenerateResult {
  plan: WeekPlan;
  total: number;
  /** true, wenn selbst der günstigste gefundene Plan über dem Budget liegt. */
  overBudget: boolean;
  violations: number;
}

export interface Alternative {
  recipe: Recipe;
  total: number;
  delta: number;
  withinBudget: boolean;
}

type Slots = (Slot | null)[];

const IMPROVE_STEPS = 250;
const MAX_REPAIR_STEPS = 40;
/** Kostengewichte der Durchgänge: zuerst Abwechslung, bei knappem Budget immer mehr Kosten. */
const COST_WEIGHTS = [1, 2.5, 6];
/** Mindestens so viele Rezepte müssen übrig bleiben, damit die Vorwoche ganz ausgeschlossen wird. */
const MIN_POOL_WITHOUT_LAST_WEEK = 24;

export function buildContext(input: PlannerInput, seed = input.seed ?? Date.now()): PlannerContext {
  const rng = createRng(seed ^ 0x9e3779b9);
  const byIngredient = groupByIngredient(input.products);
  return {
    recipesById: new Map(input.recipes.map((r) => [r.id, r])),
    ingredientsById: new Map(input.ingredients.map((i) => [i.id, i])),
    byIngredient,
    pantryAvail: pantryAvailable(input.pantry, input.weekStart),
    pantryExpiring: pantryExpiringSoon(input.pantry, input.weekStart, 3),
    persons: input.settings.persons,
    budget: input.settings.budget,
    splitThreshold: input.settings.splitThreshold,
    alreadySpent: input.alreadySpent ?? 0,
    favorites: new Set(input.favorites),
    lastWeek: new Set(input.lastWeek),
    jitter: new Map(input.recipes.map((r) => [r.id, rng() * 1.5])),
    unitPrice: createUnitPrices(byIngredient),
    packMemo: new Map(),
    costWeight: 1,
  };
}

/** Tage, an denen das Abendessen doppelt gekocht wird – gleichmässig über die Woche verteilt. */
export function doubleDinnerDays(count: number): number[] {
  const k = Math.max(0, Math.min(6, Math.round(count)));
  return Array.from({ length: k }, (_, i) => Math.floor((i * 6) / k));
}

const mealOf = (index: number): MealType => (index % 2 === 0 ? 'mittag' : 'abend');

/** Setzt ein Rezept in einen Slot; doppelte Abendessen füllen den nächsten Mittag mit Resten. */
export function place(slots: Slots, index: number, recipeId: string, double: boolean): Slots {
  const next = [...slots];
  const day = Math.floor(index / 2);
  const old = slots[index];
  if (old?.double && next[index + 1]?.leftoverOf === index) next[index + 1] = null;
  next[index] = { day, meal: mealOf(index), recipeId, cooked: false, ...(double ? { double: true } : {}) };
  if (double && index + 1 < SLOTS_PER_WEEK) {
    next[index + 1] = { day: day + 1, meal: 'mittag', recipeId, leftoverOf: index, cooked: false };
  }
  return next;
}

const usedElsewhere = (slots: Slots, recipeId: string, except: number) =>
  slots.some((s, i) => s && i !== except && s.leftoverOf === undefined && s.recipeId === recipeId);

function candidatesFor(pool: Recipe[], slots: Slots, index: number, double: boolean, settings: Settings): Recipe[] {
  const meal = mealOf(index);
  const strict = pool.filter((r) => fitsSlot(r, { meal, double }, settings) && !usedElsewhere(slots, r.id, index));
  if (strict.length > 0) return strict;
  // Notfall: Einschränkungen lockern, damit der Plan immer vollständig wird.
  const relaxed = pool.filter((r) => !usedElsewhere(slots, r.id, index));
  return relaxed.length > 0 ? relaxed : pool;
}

class Search {
  slots: Slots;
  current: Evaluation;
  private readonly isFixed: boolean[];

  constructor(
    private readonly ctx: PlannerContext,
    private readonly pool: Recipe[],
    private readonly settings: Settings,
    private readonly rng: () => number,
    fixed: Slots,
  ) {
    this.slots = Array.from({ length: SLOTS_PER_WEEK }, (_, i) => fixed[i] ?? null);
    this.isFixed = this.slots.map((s) => s !== null);
    this.current = evaluate(this.slots, ctx);
  }

  private freeIndices(slots = this.slots): number[] {
    return slots.map((s, i) => (s && !this.isFixed[i] && s.leftoverOf === undefined ? i : -1)).filter((i) => i >= 0);
  }

  private replace(slots: Slots, index: number, recipe: Recipe): Slots | null {
    const slot = slots[index]!;
    const double = !!slot.double && recipe.tags.includes('meal-prep');
    if (slot.double && !double) return null;
    return place(slots, index, recipe.id, double);
  }

  /** Slot für Slot das am besten bewertete Rezept (mit etwas Zufall). */
  construct(): void {
    const doubles = new Set(
      doubleDinnerDays(this.settings.leftoverLunches).filter(
        (d) => !this.slots[d * 2 + 1] && !this.slots[d * 2 + 2],
      ),
    );
    for (let index = 0; index < SLOTS_PER_WEEK; index++) {
      if (this.slots[index]) continue;
      const double = mealOf(index) === 'abend' && doubles.has(Math.floor(index / 2));
      const scored = candidatesFor(this.pool, this.slots, index, double, this.settings)
        .map((recipe) => {
          const fitsDouble = double && recipe.tags.includes('meal-prep');
          return { recipe, double: fitsDouble, e: evaluate(place(this.slots, index, recipe.id, fitsDouble), this.ctx) };
        })
        .sort((a, b) => b.e.objective - a.e.objective);
      const pick = pickTop(scored, this.rng);
      this.slots = place(this.slots, index, pick.recipe.id, pick.double);
    }
    this.current = evaluate(this.slots, this.ctx);
  }

  /** Ersetzt den Slot, der am meisten spart. */
  private bestSingleSwap(): boolean {
    let best: { slots: Slots; e: Evaluation; metric: number } | null = null;
    for (const index of this.freeIndices()) {
      const slot = this.slots[index]!;
      for (const recipe of candidatesFor(this.pool, this.slots, index, !!slot.double, this.settings)) {
        if (recipe.id === slot.recipeId) continue;
        const trial = this.replace(this.slots, index, recipe);
        if (!trial) continue;
        const e = evaluate(trial, this.ctx);
        if (e.violations > this.current.violations) continue;
        const saving = this.current.total - e.total;
        if (saving <= 0.01) continue;
        const metric = saving + 0.1 * (e.objective - this.current.objective);
        if (!best || metric > best.metric) best = { slots: trial, e, metric };
      }
    }
    if (!best) return false;
    this.slots = best.slots;
    this.current = best.e;
    return true;
  }

  /**
   * Teure Zutat ganz streichen: alle Rezepte, die sie brauchen, gleichzeitig ersetzen.
   * Hilft bei Packungen, die mehrere Rezepte teilen (z. B. ein Gewürzglas).
   */
  private eliminateIngredient(): boolean {
    const costs = new Map<string, number>();
    evaluate(this.slots, this.ctx, costs);
    const ranked = [...costs].sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const [ingredientId] of ranked) {
      let trial: Slots = this.slots;
      let ok = true;
      for (const index of this.freeIndices(trial)) {
        const slot = trial[index]!;
        const recipe = this.ctx.recipesById.get(slot.recipeId)!;
        if (!recipe.ingredients.some((i) => i.id === ingredientId)) continue;
        const options = candidatesFor(this.pool, trial, index, !!slot.double, this.settings).filter(
          (r) => r.id !== slot.recipeId && !r.ingredients.some((i) => i.id === ingredientId),
        );
        let bestTrial: { slots: Slots; objective: number } | null = null;
        for (const option of options) {
          const t = this.replace(trial, index, option);
          if (!t) continue;
          const objective = evaluate(t, this.ctx).objective;
          if (!bestTrial || objective > bestTrial.objective) bestTrial = { slots: t, objective };
        }
        if (!bestTrial) {
          ok = false;
          break;
        }
        trial = bestTrial.slots;
      }
      if (!ok || trial === this.slots) continue;
      const e = evaluate(trial, this.ctx);
      if (e.violations <= this.current.violations && e.total < this.current.total - 0.01) {
        this.slots = trial;
        this.current = e;
        return true;
      }
    }
    return false;
  }

  /** Solange zu teuer: Einzeltausch, sonst Zutat streichen. */
  repair(budget: number): void {
    for (let step = 0; step < MAX_REPAIR_STEPS && this.current.total > budget + 1e-9; step++) {
      if (!this.bestSingleSwap() && !this.eliminateIngredient()) break;
    }
  }

  /** Zufällige Tauschversuche, die die Bewertung verbessern, ohne das Limit zu überschreiten. */
  improve(limit: number): void {
    this.current = evaluate(this.slots, this.ctx);
    for (let step = 0; step < IMPROVE_STEPS; step++) {
      const free = this.freeIndices();
      if (free.length === 0) break;
      const index = free[Math.floor(this.rng() * free.length)];
      const slot = this.slots[index]!;
      const options = candidatesFor(this.pool, this.slots, index, !!slot.double, this.settings);
      const recipe = options[Math.floor(this.rng() * options.length)];
      if (!recipe || recipe.id === slot.recipeId) continue;
      const trial = this.replace(this.slots, index, recipe);
      if (!trial) continue;
      const e = evaluate(trial, this.ctx);
      if (e.violations <= this.current.violations && e.total <= limit + 1e-9 && e.objective > this.current.objective) {
        this.slots = trial;
        this.current = e;
      }
    }
  }
}

/**
 * Erstellt einen Wochenplan:
 * 1. Rezepte filtern (Zeit, No-Gos, «nie wieder», möglichst nicht aus der Vorwoche)
 * 2. Slot für Slot das am besten bewertete Rezept wählen (mit etwas Zufall)
 * 3. Ist der Plan zu teuer: Slots mit der grössten Ersparnis tauschen bzw. teure Zutaten streichen
 * 4. Einige hundert Tauschversuche, die die Bewertung verbessern, ohne das Budget zu sprengen
 * Reicht das nicht, folgen weitere Durchgänge, in denen die Kosten stärker zählen.
 *
 * `fixed` enthält Slots, die erhalten bleiben (gekocht oder von Hand gewählt).
 */
export function generatePlan(input: PlannerInput, fixed: Slots = []): GenerateResult {
  const seed = input.seed ?? Date.now();
  const rng = createRng(seed);
  const ctx = buildContext(input, seed);
  const base = baseCandidates(input.recipes, input.settings, new Set(input.blocked), ctx.ingredientsById);
  const withoutLastWeek = base.filter((r) => !ctx.lastWeek.has(r.id));
  const pool = withoutLastWeek.length >= MIN_POOL_WITHOUT_LAST_WEEK ? withoutLastWeek : base;
  const budget = input.settings.budget;

  let best: Search | null = null;
  for (const costWeight of COST_WEIGHTS) {
    ctx.costWeight = costWeight;
    const search = new Search(ctx, pool, input.settings, rng, fixed);
    search.construct();
    search.repair(budget);
    if (!best || search.current.total < best.current.total) best = search;
    if (search.current.total <= budget + 1e-9) break;
  }

  const search = best!;
  // Im Budget zählen Abwechslung, Favoriten und Vorräte etwas mehr als die letzten Rappen.
  ctx.costWeight = 0.7;
  search.improve(Math.max(budget, search.current.total));
  const total = search.current.total;

  const plan: WeekPlan = {
    weekStart: input.weekStart,
    persons: input.settings.persons,
    slots: search.slots as Slot[],
  };
  return { plan, total, overBudget: total > budget + 1e-9, violations: search.current.violations };
}

function contextFor(plan: WeekPlan, input: PlannerInput): PlannerContext {
  const ctx = buildContext({ ...input, settings: { ...input.settings, persons: plan.persons } }, 1);
  ctx.jitter = new Map();
  return ctx;
}

/** Bewertung eines bestehenden Plans (z. B. nach Personen- oder Vorratsänderung). */
export function evaluatePlan(plan: WeekPlan, input: PlannerInput): Evaluation {
  return evaluate(plan.slots, contextFor(plan, input));
}

/** Alternativen für eine einzelne Mahlzeit, mit Kostenänderung. */
export function alternativesForSlot(plan: WeekPlan, index: number, input: PlannerInput): Alternative[] {
  const ctx = contextFor(plan, input);
  const base = baseCandidates(input.recipes, input.settings, new Set(input.blocked), ctx.ingredientsById);
  const slots: Slots = [...plan.slots];
  const slot = slots[index];
  if (!slot) return [];

  // Reste-Mittag austauschen → das zugehörige Abendessen wird wieder einfach gekocht.
  if (slot.leftoverOf !== undefined) {
    const source = slots[slot.leftoverOf];
    if (source) slots[slot.leftoverOf] = { ...source, double: undefined };
    slots[index] = { ...slot, leftoverOf: undefined };
  }
  const current = evaluate(plan.slots, ctx);
  const double = !!slots[index]!.double;

  return candidatesFor(base, slots, index, double, input.settings)
    .filter((r) => r.id !== slot.recipeId || slot.leftoverOf !== undefined)
    .map((recipe) => ({
      recipe,
      e: evaluate(place(slots, index, recipe.id, double && recipe.tags.includes('meal-prep')), ctx),
    }))
    .filter(({ e }) => e.violations <= current.violations)
    .sort((a, b) => b.e.objective - a.e.objective)
    .map(({ recipe, e }) => ({
      recipe,
      total: e.total,
      delta: Math.round((e.total - current.total) * 100) / 100,
      withinBudget: e.total <= input.settings.budget + 1e-9,
    }));
}

/** Tauscht eine Mahlzeit aus und markiert sie als von Hand gewählt. */
export function swapSlot(plan: WeekPlan, index: number, recipe: Recipe): WeekPlan {
  let slots: Slots = [...plan.slots];
  const slot = slots[index];
  if (!slot) return plan;
  if (slot.leftoverOf !== undefined) {
    const source = slots[slot.leftoverOf];
    if (source) slots[slot.leftoverOf] = { ...source, double: undefined };
  }
  slots = place(slots, index, recipe.id, !!slot.double && recipe.tags.includes('meal-prep'));
  slots[index] = { ...slots[index]!, locked: true };
  return { ...plan, slots: slots as Slot[] };
}

/** Slots, die beim Neuberechnen erhalten bleiben: gekocht oder von Hand gewählt (inkl. Reste-Partner). */
export function keptSlots(plan: WeekPlan, keepLocked: boolean): Slots {
  const kept: Slots = plan.slots.map((s) => (s.cooked || (keepLocked && s.locked) ? s : null));
  plan.slots.forEach((s, i) => {
    if (!kept[i]) return;
    if (s.leftoverOf !== undefined) kept[s.leftoverOf] = plan.slots[s.leftoverOf];
    if (s.double && plan.slots[i + 1]?.leftoverOf === i) kept[i + 1] = plan.slots[i + 1];
  });
  return kept;
}
