import { bestPacks, cheapestUnitPrice, productsFor, round2 } from '../pricing';
import { cooksFresh, portionsAt } from '../plan';
import { effectiveIngredients, isMeatMeal, nutritionFor } from '../recipes';
import type { Ingredient, NutritionGoal, Persons, Product, Recipe, Slot, Store } from '../types';

export interface PlannerContext {
  recipesById: Map<string, Recipe>;
  ingredientsById: Map<string, Ingredient>;
  byIngredient: Map<string, Product[]>;
  pantryAvail: Map<string, number>;
  /** Vorräte, die in den ersten Tagen der Woche ablaufen. */
  pantryExpiring: Map<string, number>;
  persons: Persons;
  budget: number;
  splitThreshold: number;
  /** Bereits bezahlter Einkauf dieser Woche (nach «Einkauf erledigt»). */
  alreadySpent: number;
  favorites: Set<string>;
  /** Bonus pro Lieblingsrezept – höher, je länger es nicht mehr im Plan war. */
  favoriteBonus: Map<string, number>;
  /** So viele Lieblingsrezepte sollen mindestens in der Woche vorkommen. */
  favoriteTarget: number;
  lastWeek: Set<string>;
  minMeatMeals: number;
  nutritionGoal: NutritionGoal;
  /** Kleiner Zufallsbonus pro Rezept → jede generierte Woche sieht anders aus. */
  jitter: Map<string, number>;
  unitPrice: Map<string, number>;
  packMemo: Map<string, { cost: number; qty: number }>;
  slotMemo: Map<string, { meat: boolean; kcal: number; protein: number }>;
  /** Wie stark Kosten gegenüber Abwechslung zählen (wird erhöht, wenn das Budget knapp ist). */
  costWeight: number;
}

export interface Evaluation {
  /** Einkaufskosten der Woche (empfohlener Laden bzw. Kombination) inkl. bereits Bezahltem. */
  total: number;
  /** Je höher, desto besser (Kosten, Vorräte, Abwechslung, Favoriten …). */
  objective: number;
  /** Harte Verstösse: Rezept doppelt, Zutat verdorben bevor sie gebraucht wird. */
  violations: number;
  /** Fleisch-Mahlzeiten (Reste-Mittag zählt mit). */
  meatMeals: number;
  /** Lieblingsrezepte im Plan. */
  favorites: number;
}

/** Gewichte der Bewertung (CHF-äquivalent). */
export const WEIGHTS = {
  sameBaseInARow: 1.2,
  sameCuisineInARow: 0.4,
  lastWeek: 3,
  meatPerDay: 0.25,
  /** pro Fleisch-Mahlzeit, bis das Minimum erreicht ist */
  meatMeal: 3,
  /** pro fehlender Fleisch-Mahlzeit, wenn das Minimum nicht mehr erreichbar ist */
  meatMissing: 6,
  favoriteMissing: 8,
  /** Protein-Ziel: pro Gramm Protein über 30 g … */
  proteinGram: 0.25,
  /** … und pro kcal unter 600 */
  kcal: 0.012,
  openedTooLong: 1,
  waste: 0.6,
  pantryExpiring: 4,
  pantryExpiringFlat: 3,
  pantryOther: 0.3,
  violation: 50,
};

export function createUnitPrices(byIngredient: Map<string, Product[]>): Map<string, number> {
  const map = new Map<string, number>();
  for (const [id, products] of byIngredient) map.set(id, cheapestUnitPrice(products));
  return map;
}

function packFor(ctx: PlannerContext, ingredientId: string, store: Store, need: number) {
  const key = `${ingredientId}|${store}|${need.toFixed(2)}`;
  let hit = ctx.packMemo.get(key);
  if (!hit) {
    const choice = bestPacks(productsFor(ctx.byIngredient, ingredientId, store), need);
    hit = choice ? { cost: choice.cost, qty: choice.qty } : { cost: Infinity, qty: 0 };
    ctx.packMemo.set(key, hit);
  }
  return hit;
}

/** Fleisch? kcal? Protein? – für Rezept + Pasta-Tausch einmal berechnet. */
function slotInfo(ctx: PlannerContext, recipe: Recipe, swaps: Slot['swaps']) {
  const key = swaps ? `${recipe.id}|${JSON.stringify(swaps)}` : recipe.id;
  let hit = ctx.slotMemo.get(key);
  if (!hit) {
    const items = effectiveIngredients(recipe, swaps, ctx.ingredientsById);
    hit = { meat: isMeatMeal(items, ctx.ingredientsById), ...nutritionFor(recipe, swaps, ctx.ingredientsById) };
    ctx.slotMemo.set(key, hit);
  }
  return hit;
}

/**
 * Bewertet einen (auch unvollständigen) Plan.
 * `costs` wird (falls übergeben) mit den Einkaufskosten pro Zutat gefüllt.
 */
export function evaluate(slots: (Slot | null)[], ctx: PlannerContext, costs?: Map<string, number>): Evaluation {
  const needs = new Map<string, number>();
  const usageDays = new Map<string, number[]>();
  const usedRecipes = new Set<string>();
  let bonus = 0;
  let violations = 0;
  let meatMeals = 0;
  let favorites = 0;
  let empty = 0;
  let prev: Recipe | null = null;

  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (!slot) {
      empty++;
      prev = null;
      continue;
    }
    // Ausgefallene Mahlzeit: kostet nichts und zählt für keine Ziele.
    if (slot.skipped) {
      prev = null;
      continue;
    }
    const recipe = ctx.recipesById.get(slot.recipeId);
    if (!recipe) continue;
    const info = slotInfo(ctx, recipe, slot.swaps);
    if (info.meat) meatMeals++;

    if (cooksFresh(slots, index)) {
      if (usedRecipes.has(recipe.id)) violations++;
      usedRecipes.add(recipe.id);
      if (ctx.favorites.has(recipe.id)) {
        favorites++;
        bonus += ctx.favoriteBonus.get(recipe.id) ?? 0;
      } else if (ctx.lastWeek.has(recipe.id)) {
        bonus -= WEIGHTS.lastWeek;
      }
      bonus += ctx.jitter.get(recipe.id) ?? 0;
      if (ctx.nutritionGoal === 'protein') {
        bonus += WEIGHTS.proteinGram * (info.protein - 30) + WEIGHTS.kcal * (600 - info.kcal);
      }
      if (prev) {
        if (prev.base === recipe.base) bonus -= WEIGHTS.sameBaseInARow;
        if (prev.cuisine === recipe.cuisine) bonus -= WEIGHTS.sameCuisineInARow;
      }
      const portions = slot.cooked ? 0 : portionsAt(slots, index, ctx.persons);
      for (const { id, qty } of effectiveIngredients(recipe, slot.swaps, ctx.ingredientsById)) {
        const ing = ctx.ingredientsById.get(id);
        if (ing?.category === 'fleisch-fisch') bonus -= WEIGHTS.meatPerDay * slot.day;
        if (portions === 0) continue;
        needs.set(id, (needs.get(id) ?? 0) + qty * portions);
        const days = usageDays.get(id);
        if (days) days.push(slot.day);
        else usageDays.set(id, [slot.day]);
      }
    }
    prev = recipe;
  }

  // Fleisch: Bonus bis zum Minimum; Strafe erst, wenn es mit den freien Slots nicht mehr erreichbar ist.
  bonus += WEIGHTS.meatMeal * Math.min(meatMeals, ctx.minMeatMeals);
  const meatShort = ctx.minMeatMeals - meatMeals - empty;
  if (meatShort > 0) bonus -= WEIGHTS.meatMissing * meatShort;
  const favoriteShort = ctx.favoriteTarget - favorites - empty;
  if (favoriteShort > 0) bonus -= WEIGHTS.favoriteMissing * favoriteShort;

  let coop = 0;
  let migros = 0;
  let split = 0;
  let waste = 0;
  let pantryBonus = 0;

  for (const [id, need] of needs) {
    const ing = ctx.ingredientsById.get(id);
    if (!ing) continue;
    const unit = ctx.unitPrice.get(id) ?? 0;
    const avail = ctx.pantryAvail.get(id) ?? 0;
    const fromPantry = Math.min(need, avail);
    const expiring = Math.min(fromPantry, ctx.pantryExpiring.get(id) ?? 0);
    pantryBonus += expiring * unit * WEIGHTS.pantryExpiring + (fromPantry - expiring) * unit * WEIGHTS.pantryOther;
    if (expiring > 0) pantryBonus += WEIGHTS.pantryExpiringFlat;

    const net = need - fromPantry;
    if (net <= 1e-9) continue;
    const c = packFor(ctx, id, 'coop', net);
    const m = packFor(ctx, id, 'migros', net);
    coop += c.cost;
    migros += m.cost;
    split += Math.min(c.cost, m.cost);
    costs?.set(id, Math.min(c.cost, m.cost));

    // Frisch gekaufte Ware muss bis zum Kochtag halten.
    const days = usageDays.get(id) ?? [];
    const opened = ing.openedShelfLifeDays ?? ing.shelfLifeDays;
    const first = Math.min(...days);
    for (const d of days) {
      if (d >= ing.shelfLifeDays) violations++;
      else if (d - first > opened) bonus -= WEIGHTS.openedTooLong;
    }
    if (ing.shelfLifeDays <= 10) {
      const bought = c.cost <= m.cost ? c.qty : m.qty;
      waste += Math.max(0, bought - net) * unit;
    }
  }

  const single = Math.min(coop, migros);
  const purchase = single - split > ctx.splitThreshold ? split : single;
  const total = round2(purchase + ctx.alreadySpent);
  const objective =
    -ctx.costWeight * total - WEIGHTS.waste * waste + pantryBonus + bonus - WEIGHTS.violation * violations;
  return { total, objective, violations, meatMeals, favorites };
}
