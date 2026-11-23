import { describe, expect, it } from 'vitest';
import { cookSlot, cooksFresh, planNeeds, planRecipeIds, portionsAt, uncookSlot } from '../src/core/plan';
import { evaluatePlan, generatePlan, keptSlots, swapSlot, type PlannerInput } from '../src/core/planner/generate';
import { pantryAvailable } from '../src/core/pantry';
import type { Settings, Slot, WeekPlan } from '../src/core/types';
import { INGREDIENTS, PRODUCTS, RECIPES } from '../src/data';

const settings: Settings = {
  budget: 70,
  persons: 1,
  shoppingDay: 0,
  splitThreshold: 5,
  leftoverLunches: 2,
  lunchToGo: false,
  noGo: [],
  minMeatMeals: 3,
  nutritionGoal: 'protein',
  minFavorites: 2,
  preferredPasta: '',
};

const input = (overrides: Partial<PlannerInput> = {}): PlannerInput => ({
  recipes: RECIPES,
  ingredients: INGREDIENTS,
  products: PRODUCTS,
  pantry: [],
  settings,
  favorites: [],
  blocked: [],
  lastWeek: [],
  weekStart: '2026-10-19',
  seed: 42,
  ...overrides,
});

const recipesById = new Map(RECIPES.map((r) => [r.id, r]));
const ingredientsById = new Map(INGREDIENTS.map((i) => [i.id, i]));
const needsOf = (slots: Slot[], persons: 1 | 2 = 1) => planNeeds(slots, persons, recipesById, ingredientsById);
const skip = (plan: WeekPlan, ...indices: number[]): WeekPlan => ({
  ...plan,
  slots: plan.slots.map((s, i) => (indices.includes(i) ? { ...s, skipped: true } : s)),
});

/** Ein Plan mit doppeltem Abendessen (Index 1) und Reste-Mittag (Index 2). */
const recipe = recipesById.get('chili-con-carne')!;
const pairPlan: WeekPlan = {
  weekStart: '2026-10-19',
  persons: 1,
  slots: [
    { day: 0, meal: 'mittag', recipeId: 'shakshuka', cooked: false },
    { day: 0, meal: 'abend', recipeId: recipe.id, double: true, cooked: false },
    { day: 1, meal: 'mittag', recipeId: recipe.id, leftoverOf: 1, cooked: false },
  ],
};

describe('Mahlzeit fällt aus', () => {
  it('nimmt eine ausgefallene Mahlzeit ganz aus dem Einkauf', () => {
    const { plan } = generatePlan(input());
    const index = plan.slots.findIndex((s) => s.leftoverOf === undefined && !s.double);
    const before = needsOf(plan.slots);
    const after = needsOf(skip(plan, index).slots);
    const own = recipesById.get(plan.slots[index].recipeId)!;
    for (const item of own.ingredients) {
      const ingredientId = plan.slots[index].swaps?.[item.id] ?? item.id;
      const factor = ingredientsById.get(item.id)?.group ? (ingredientsById.get(ingredientId)!.groupFactor ?? 1) / (ingredientsById.get(item.id)!.groupFactor ?? 1) : 1;
      expect((before.get(ingredientId) ?? 0) - (after.get(ingredientId) ?? 0)).toBeCloseTo(item.qty * factor, 6);
    }
  });

  it('fällt das doppelte Abendessen aus, wird der Reste-Mittag frisch gekocht (1 Portion)', () => {
    const plan = skip(pairPlan, 1);
    expect(cooksFresh(plan.slots, 2)).toBe(true);
    expect(portionsAt(plan.slots, 1, 1)).toBe(0);
    expect(portionsAt(plan.slots, 2, 1)).toBe(1);
    const needs = needsOf(skip(plan, 0).slots);
    for (const item of recipe.ingredients) expect(needs.get(item.id)).toBeCloseTo(item.qty, 6);
    // Zum Vergleich: ohne Ausfall werden am Abend zwei Portionen gekocht.
    const full = needsOf(skip(pairPlan, 0).slots);
    for (const item of recipe.ingredients) expect(full.get(item.id)).toBeCloseTo(2 * item.qty, 6);
  });

  it('fällt der Reste-Mittag aus, wird am Abend nur eine Portion gekocht', () => {
    const plan = skip(pairPlan, 2);
    expect(portionsAt(plan.slots, 1, 2)).toBe(2);
    expect(portionsAt(pairPlan.slots, 1, 2)).toBe(4);
    expect(portionsAt(plan.slots, 2, 2)).toBe(0);
  });

  it('beides fällt aus → nichts einkaufen', () => {
    expect(needsOf(skip(pairPlan, 0, 1, 2).slots).size).toBe(0);
  });

  it('Gekocht-Abhaken und Rückgängig buchen genau die tatsächlich gekochten Portionen', () => {
    const pantry = recipe.ingredients.map((i, n) => ({ id: String(n), ingredientId: i.id, qty: 1000, staple: false }));
    const plan = skip(pairPlan, 2);
    const portions = portionsAt(plan.slots, 1, 1);
    const cooked = cookSlot(pantry, plan.slots[1], 1, recipesById, ingredientsById, portions);
    for (const i of recipe.ingredients) expect(pantryAvailable(cooked).get(i.id)).toBeCloseTo(1000 - i.qty, 6);
    const back = uncookSlot(cooked, { ...plan.slots[1], cooked: true, cookedPortions: portions }, 1, recipesById, ingredientsById);
    for (const i of recipe.ingredients) expect(pantryAvailable(back).get(i.id)).toBeCloseTo(1000, 6);
  });

  it('senkt die Wochenkosten und zählt nicht für Fleisch oder Wiederholungen', () => {
    const { plan } = generatePlan(input());
    const all = plan.slots.map((_, i) => i);
    const ctx = input();
    expect(evaluatePlan(skip(plan, ...all), ctx).total).toBe(0);
    expect(evaluatePlan(skip(plan, ...all), ctx).meatMeals).toBe(0);
    expect(evaluatePlan(skip(plan, 0, 1), ctx).total).toBeLessThanOrEqual(evaluatePlan(plan, ctx).total);
    expect(planRecipeIds(skip(plan, ...all))).toEqual([]);
  });

  it('Neu berechnen behält ausgefallene Mahlzeiten und plant drumherum', () => {
    const { plan } = generatePlan(input());
    // Ganzer Dienstag (Tag 1) fällt aus, dazu ein doppeltes Abendessen, falls vorhanden.
    const double = plan.slots.findIndex((s) => s.double);
    const skipped = [2, 3, ...(double >= 0 ? [double] : [])];
    const marked = skip(plan, ...skipped);
    const again = generatePlan(input({ seed: 7 }), keptSlots(marked, true));
    expect(again.plan.slots).toHaveLength(14);
    for (const i of skipped) {
      expect(again.plan.slots[i].skipped).toBe(true);
      expect(again.plan.slots[i].recipeId).toBe(marked.slots[i].recipeId);
    }
    // Keine Reste in einen ausgefallenen Slot hinein, kein leerer Slot, kein Rezept doppelt gekocht.
    for (const [i, s] of again.plan.slots.entries()) {
      expect(s).toBeTruthy();
      if (s.leftoverOf !== undefined) expect(again.plan.slots[s.leftoverOf].skipped).toBeFalsy();
      if (s.double && !s.skipped) expect(again.plan.slots[i + 1].leftoverOf).toBe(i);
    }
    const fresh = again.plan.slots.filter((_, i) => cooksFresh(again.plan.slots, i)).map((s) => s.recipeId);
    expect(new Set(fresh).size).toBe(fresh.length);
  });

  it('Austausch eines doppelten Abendessens lässt den ausgefallenen Reste-Mittag ausgefallen', () => {
    const plan = skip(pairPlan, 2);
    const mealPrep = RECIPES.find((r) => r.tags.includes('meal-prep') && r.id !== recipe.id)!;
    const swapped = swapSlot(plan, 1, mealPrep);
    expect(swapped.slots[2].leftoverOf).toBe(1);
    expect(swapped.slots[2].skipped).toBe(true);
    const plain = RECIPES.find((r) => !r.tags.includes('meal-prep'))!;
    const single = swapSlot(pairPlan, 1, plain);
    expect(single.slots[2]).toBeTruthy();
    expect(single.slots[2].leftoverOf).toBeUndefined();
  });
});
