import { describe, expect, it } from 'vitest';
import { pantryAvailable } from '../src/core/pantry';
import { cookSlot, planNeeds, purchaseToPantry } from '../src/core/plan';
import { evaluatePlan, generatePlan, alternativesForSlot, swapSlot, keptSlots, type PlannerInput } from '../src/core/planner/generate';
import { groupByIngredient } from '../src/core/pricing';
import { computeShopping } from '../src/core/shopping';
import { MAX_MINUTES, type Settings } from '../src/core/types';
import { INGREDIENTS, PRODUCTS, RECIPES } from '../src/data';

const settings: Settings = {
  budget: 70,
  persons: 1,
  shoppingDay: 0,
  splitThreshold: 5,
  leftoverLunches: 2,
  lunchToGo: false,
  noGo: [],
};

const input = (overrides: Partial<PlannerInput> = {}, s: Partial<Settings> = {}): PlannerInput => ({
  recipes: RECIPES,
  ingredients: INGREDIENTS,
  products: PRODUCTS,
  pantry: [],
  settings: { ...settings, ...s },
  favorites: [],
  blocked: [],
  lastWeek: [],
  weekStart: '2026-10-19',
  seed: 42,
  ...overrides,
});

const recipesById = new Map(RECIPES.map((r) => [r.id, r]));
const ingredientsById = new Map(INGREDIENTS.map((i) => [i.id, i]));
const byIngredient = groupByIngredient(PRODUCTS);

/** Realistischer Start: Grundvorrat (Öl, Gewürze, Reis, Pasta …) ist vorhanden. */
const staplePantry: PlannerInput['pantry'] = INGREDIENTS.filter((i) => i.staple).map((i) => ({
  id: `s-${i.id}`,
  ingredientId: i.id,
  qty: Math.max(...PRODUCTS.filter((p) => p.ingredientId === i.id).map((p) => p.packSize)),
  staple: true,
}));

function shoppingFor(result: ReturnType<typeof generatePlan>, pantry = [] as PlannerInput['pantry']) {
  const needs = planNeeds(result.plan.slots, result.plan.persons, recipesById);
  return computeShopping(needs, {
    ingredientsById,
    byIngredient,
    pantryAvail: pantryAvailable(pantry, result.plan.weekStart),
    splitThreshold: settings.splitThreshold,
  });
}

describe('Planer', () => {
  it('überschreitet das Budget nie (20 Wochen, 1 Person, leere Vorräte)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const result = generatePlan(input({ seed }));
      expect(result.overBudget, `seed ${seed}`).toBe(false);
      expect(result.total, `seed ${seed}`).toBeLessThanOrEqual(70);
      // Kontrolle mit der echten Einkaufsliste
      expect(shoppingFor(result).recommendation.total).toBeCloseTo(result.total, 2);
    }
  });

  it('überschreitet das Budget nie (10 Wochen, 2 Personen mit Grundvorrat, 70 und 90 CHF)', () => {
    for (const budget of [70, 90]) {
      for (let seed = 1; seed <= 10; seed++) {
        const result = generatePlan(input({ seed, pantry: staplePantry }, { persons: 2, budget }));
        if (!result.overBudget) expect(result.total).toBeLessThanOrEqual(budget);
        else expect(result.total).toBeGreaterThan(budget);
        expect(shoppingFor(result, staplePantry).recommendation.total).toBeCloseTo(result.total, 2);
      }
    }
  });

  it('meldet «über Budget», statt einen zu teuren Plan als gültig auszugeben', () => {
    const result = generatePlan(input({}, { budget: 15 }));
    expect(result.overBudget).toBe(true);
    expect(result.total).toBeGreaterThan(15);
  });

  it('hält auch knappe Budgets ein, wenn es möglich ist', () => {
    for (const budget of [45, 55]) {
      const result = generatePlan(input({ seed: 7 }, { budget }));
      if (!result.overBudget) expect(result.total).toBeLessThanOrEqual(budget);
    }
  });

  it('plant 14 Mahlzeiten, alle höchstens 30 Minuten, ohne doppelte Rezepte', () => {
    const { plan } = generatePlan(input());
    expect(plan.slots).toHaveLength(14);
    const fresh = plan.slots.filter((s) => s.leftoverOf === undefined);
    expect(new Set(fresh.map((s) => s.recipeId)).size).toBe(fresh.length);
    for (const slot of plan.slots) {
      const r = recipesById.get(slot.recipeId)!;
      expect(r.prepMin + r.cookMin).toBeLessThanOrEqual(MAX_MINUTES);
    }
  });

  it('kocht Abendessen doppelt für Reste-Mittagessen', () => {
    const { plan } = generatePlan(input({}, { leftoverLunches: 2 }));
    const leftovers = plan.slots.filter((s) => s.leftoverOf !== undefined);
    expect(leftovers).toHaveLength(2);
    for (const l of leftovers) {
      const source = plan.slots[l.leftoverOf!];
      expect(source.double).toBe(true);
      expect(source.recipeId).toBe(l.recipeId);
      expect(l.day).toBe(source.day + 1);
      expect(recipesById.get(l.recipeId)!.tags).toContain('meal-prep');
    }
  });

  it('respektiert No-Gos und «nie wieder»', () => {
    const blocked = RECIPES.slice(0, 10).map((r) => r.id);
    const { plan } = generatePlan(input({ blocked }, { noGo: ['hackfleisch', 'speckwuerfeli'] }));
    for (const slot of plan.slots) {
      const r = recipesById.get(slot.recipeId)!;
      expect(blocked).not.toContain(r.id);
      expect(r.ingredients.map((i) => i.id)).not.toContain('hackfleisch');
      expect(r.ingredients.map((i) => i.id)).not.toContain('speckwuerfeli');
    }
  });

  it('kocht verderbliche Zutaten, bevor sie ablaufen', () => {
    for (let seed = 1; seed <= 10; seed++) expect(generatePlan(input({ seed })).violations).toBe(0);
  });

  it('meidet Rezepte der Vorwoche', () => {
    const first = generatePlan(input({ seed: 3 }));
    const lastWeek = first.plan.slots.map((s) => s.recipeId);
    const second = generatePlan(input({ seed: 4, lastWeek }));
    const repeated = second.plan.slots.filter((s) => s.leftoverOf === undefined && lastWeek.includes(s.recipeId));
    expect(repeated.length).toBeLessThanOrEqual(3);
  });

  it('bevorzugt Vorräte, die bald ablaufen', () => {
    const pantry = [{ id: 'p1', ingredientId: 'tofu', qty: 400, expiresAt: '2026-10-21', staple: false }];
    const hits = [1, 2, 3, 4, 5].filter((seed) =>
      generatePlan(input({ seed, pantry })).plan.slots.some((s) =>
        recipesById.get(s.recipeId)!.ingredients.some((i) => i.id === 'tofu'),
      ),
    );
    expect(hits.length).toBeGreaterThanOrEqual(4);
  });

  it('liefert Alternativen für eine Mahlzeit und hält beim Tauschen das Budget', () => {
    const withStaples = input({ pantry: staplePantry });
    const { plan } = generatePlan(withStaples);
    const alternatives = alternativesForSlot(plan, 3, withStaples);
    expect(alternatives.length).toBeGreaterThan(5);
    const pick = alternatives.find((a) => a.withinBudget)!;
    expect(pick).toBeDefined();
    const swapped = swapSlot(plan, 3, pick.recipe);
    expect(swapped.slots[3].recipeId).toBe(pick.recipe.id);
    expect(swapped.slots[3].locked).toBe(true);
    expect(evaluatePlan(swapped, withStaples).total).toBeCloseTo(pick.total, 2);
    expect(pick.total).toBeLessThanOrEqual(70);
  });

  it('kostet mit Grundvorrat deutlich weniger', () => {
    const empty = generatePlan(input()).total;
    const stocked = generatePlan(input({ pantry: staplePantry })).total;
    expect(stocked).toBeLessThan(empty - 10);
  });

  it('behält beim Neuberechnen gekochte und von Hand gewählte Mahlzeiten', () => {
    const { plan } = generatePlan(input());
    plan.slots[0] = { ...plan.slots[0], cooked: true };
    plan.slots[5] = { ...plan.slots[5], locked: true };
    const again = generatePlan(input({ seed: 99 }), keptSlots(plan, true));
    expect(again.plan.slots[0].recipeId).toBe(plan.slots[0].recipeId);
    expect(again.plan.slots[5].recipeId).toBe(plan.slots[5].recipeId);
  });
});

describe('Skalierung 1 → 2 Personen', () => {
  it('verdoppelt den Bedarf exakt', () => {
    const { plan } = generatePlan(input());
    const one = planNeeds(plan.slots, 1, recipesById);
    const two = planNeeds(plan.slots, 2, recipesById);
    for (const [id, qty] of one) expect(two.get(id)).toBeCloseTo(qty * 2, 6);
  });

  it('Kosten für 2 Personen sind höher, aber höchstens doppelt so hoch', () => {
    const result = generatePlan(input());
    const one = shoppingFor(result).recommendation.total;
    const two = shoppingFor({ ...result, plan: { ...result.plan, persons: 2 } }).recommendation.total;
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(one * 2 + 0.01);
  });

  it('erstellt auch für 2 Personen Pläne im Budget oder meldet es', () => {
    const result = generatePlan(input({}, { persons: 2 }));
    expect(result.overBudget ? result.total > 70 : result.total <= 70).toBe(true);
  });
});

describe('Vorräte', () => {
  it('Einkauf → volle Packungen in die Vorräte, Kochen zieht genau ab', () => {
    const { plan } = generatePlan(input());
    const needs = planNeeds(plan.slots, 1, recipesById);
    const shopping = computeShopping(needs, {
      ingredientsById,
      byIngredient,
      pantryAvail: new Map(),
      splitThreshold: 5,
    });
    let pantry = purchaseToPantry([], shopping, shopping.recommendation.mode, '2026-10-19');
    const bought = pantryAvailable(pantry);
    // Gekauft wird mindestens der Bedarf
    for (const [id, qty] of needs) expect(bought.get(id) ?? 0).toBeGreaterThanOrEqual(qty - 1e-6);

    // Alles kochen → übrig bleibt genau Packungsmenge minus Bedarf
    for (const slot of plan.slots) pantry = cookSlot(pantry, slot, 1, recipesById);
    const rest = pantryAvailable(pantry);
    for (const [id, qty] of needs) expect(rest.get(id) ?? 0).toBeCloseTo((bought.get(id) ?? 0) - qty, 3);
  });

  it('zieht bei doppeltem Abendessen zwei Portionen ab, beim Reste-Mittag nichts', () => {
    const recipe = recipesById.get('chili-con-carne')!;
    const pantry = recipe.ingredients.map((i, n) => ({
      id: String(n),
      ingredientId: i.id,
      qty: 1000,
      staple: false,
    }));
    const dinner = { day: 0, meal: 'abend' as const, recipeId: recipe.id, double: true, cooked: false };
    const lunch = { day: 1, meal: 'mittag' as const, recipeId: recipe.id, leftoverOf: 1, cooked: false };
    const afterDinner = pantryAvailable(cookSlot(pantry, dinner, 1, recipesById));
    for (const i of recipe.ingredients) expect(afterDinner.get(i.id)).toBeCloseTo(1000 - 2 * i.qty, 6);
    const afterLunch = pantryAvailable(cookSlot(cookSlot(pantry, dinner, 1, recipesById), lunch, 1, recipesById));
    expect(afterLunch).toEqual(afterDinner);
  });

  it('vorhandene Vorräte werden von der Einkaufsliste abgezogen', () => {
    const needs = new Map([['spaghetti', 600]]);
    const ctx = { ingredientsById, byIngredient, splitThreshold: 5 };
    const without = computeShopping(needs, { ...ctx, pantryAvail: new Map() });
    const withPantry = computeShopping(needs, { ...ctx, pantryAvail: new Map([['spaghetti', 600]]) });
    expect(without.recommendation.total).toBeGreaterThan(0);
    expect(withPantry.recommendation.total).toBe(0);
    expect(withPantry.items[0].toBuy).toBe(0);
  });
});
