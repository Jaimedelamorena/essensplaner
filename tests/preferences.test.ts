import { describe, expect, it } from 'vitest';
import { planNeeds, planRecipeIds } from '../src/core/plan';
import { generatePlan, type PlannerInput } from '../src/core/planner/generate';
import { effectiveIngredients, isMeatMeal, nutritionFor, pastaIngredientOf } from '../src/core/recipes';
import type { Settings, WeekPlan } from '../src/core/types';
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

const recipesById = new Map(RECIPES.map((r) => [r.id, r]));
const ingredientsById = new Map(INGREDIENTS.map((i) => [i.id, i]));

const staplePantry: PlannerInput['pantry'] = INGREDIENTS.filter((i) => i.staple).map((i) => ({
  id: `s-${i.id}`,
  ingredientId: i.id,
  qty: Math.max(...PRODUCTS.filter((p) => p.ingredientId === i.id).map((p) => p.packSize)),
  staple: true,
}));

const input = (overrides: Partial<PlannerInput> = {}, s: Partial<Settings> = {}): PlannerInput => ({
  recipes: RECIPES,
  ingredients: INGREDIENTS,
  products: PRODUCTS,
  pantry: staplePantry,
  settings: { ...settings, ...s },
  favorites: [],
  blocked: [],
  lastWeek: [],
  weekStart: '2026-11-02',
  seed: 11,
  ...overrides,
});

const meatMeals = (plan: WeekPlan) =>
  plan.slots.filter((s) => isMeatMeal(effectiveIngredients(recipesById.get(s.recipeId)!, s.swaps, ingredientsById), ingredientsById))
    .length;

const freshMeals = (plan: WeekPlan) => plan.slots.filter((s) => s.leftoverOf === undefined);

describe('Fleisch pro Woche', () => {
  it('erkennt Fleischgerichte (Speck allein zählt nicht)', () => {
    const items = (id: string) => recipesById.get(id)!.ingredients;
    expect(isMeatMeal(items('chili-con-carne'), ingredientsById)).toBe(true);
    expect(isMeatMeal(items('trutenschnitzel-ofengemuese'), ingredientsById)).toBe(true);
    expect(isMeatMeal(items('spaghetti-carbonara'), ingredientsById)).toBe(false);
    expect(isMeatMeal(items('shakshuka'), ingredientsById)).toBe(false);
  });

  it('plant mindestens 3 Fleisch-Mahlzeiten (10 Wochen)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const result = generatePlan(input({ seed }));
      expect(result.overBudget).toBe(false);
      expect(meatMeals(result.plan), `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('richtet sich nach der Einstellung (5 Fleisch-Mahlzeiten)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      expect(meatMeals(generatePlan(input({ seed }, { minMeatMeals: 5 })).plan)).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('Ernährungsziel «viel Protein, wenig Kalorien»', () => {
  it('liefert mehr Protein und weniger kcal pro Mahlzeit als «ausgewogen»', () => {
    const average = (goal: Settings['nutritionGoal']) => {
      let kcal = 0;
      let protein = 0;
      let count = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const plan = generatePlan(input({ seed }, { nutritionGoal: goal })).plan;
        for (const s of freshMeals(plan)) {
          const n = nutritionFor(recipesById.get(s.recipeId)!, s.swaps, ingredientsById);
          kcal += n.kcal;
          protein += n.protein;
          count++;
        }
      }
      return { kcal: kcal / count, protein: protein / count };
    };
    const protein = average('protein');
    const balanced = average('ausgewogen');
    expect(protein.protein).toBeGreaterThan(balanced.protein + 3);
    expect(protein.kcal).toBeLessThan(balanced.kcal);
    expect(protein.protein).toBeGreaterThanOrEqual(32);
    expect(protein.kcal).toBeLessThanOrEqual(600);
  });
});

describe('Lieblingsrezepte', () => {
  const favorites = ['chili-con-carne', 'poulet-teriyaki', 'shakshuka'];

  it('kommen jede Woche mindestens zweimal vor', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const plan = generatePlan(input({ seed, favorites })).plan;
      const hits = freshMeals(plan).filter((s) => favorites.includes(s.recipeId)).length;
      expect(hits, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('kommen regelmässig und wechseln sich über 4 Wochen ab', () => {
    const recentWeeks: string[][] = [];
    const count = new Map(favorites.map((f) => [f, 0]));
    for (let week = 0; week < 4; week++) {
      const plan = generatePlan(input({ seed: 100 + week, favorites, lastWeek: recentWeeks[0] ?? [], recentWeeks })).plan;
      const ids = planRecipeIds(plan);
      for (const f of favorites) if (ids.includes(f)) count.set(f, count.get(f)! + 1);
      recentWeeks.unshift(ids);
    }
    for (const f of favorites) expect(count.get(f), f).toBeGreaterThanOrEqual(2);
  });

  it('dürfen auch direkt nach der Vorwoche wieder kommen', () => {
    const plan = generatePlan(input({ favorites: ['poulet-teriyaki'], lastWeek: ['poulet-teriyaki'] }, { minFavorites: 1 })).plan;
    expect(planRecipeIds(plan)).toContain('poulet-teriyaki');
  });
});

describe('Pasta-Sorten', () => {
  const bolognese = recipesById.get('spaghetti-bolognese')!;

  it('tauscht die Pasta bei gleicher Menge', () => {
    const items = effectiveIngredients(bolognese, { spaghetti: 'farfalle' }, ingredientsById);
    expect(items.find((i) => i.id === 'farfalle')?.qty).toBe(110);
    expect(items.some((i) => i.id === 'spaghetti')).toBe(false);
  });

  it('rechnet frische Ravioli um (mehr Gewicht als trockene Pasta)', () => {
    const items = effectiveIngredients(bolognese, { spaghetti: 'ravioli-fleisch' }, ingredientsById);
    expect(items.find((i) => i.id === 'ravioli-fleisch')?.qty).toBeCloseTo(154, 6);
  });

  it('tauscht nur innerhalb der Pasta-Gruppe', () => {
    const items = effectiveIngredients(bolognese, { spaghetti: 'hackfleisch' }, ingredientsById);
    expect(items).toEqual(bolognese.ingredients);
  });

  it('Linsen-Pasta bringt mehr Protein', () => {
    const normal = nutritionFor(bolognese, undefined, ingredientsById);
    const lentil = nutritionFor(bolognese, { spaghetti: 'linsen-pasta' }, ingredientsById);
    expect(lentil.protein).toBeGreaterThan(normal.protein + 10);
  });

  it('die Lieblings-Pasta aus den Einstellungen gilt für alle Pasta-Gerichte', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { plan } = generatePlan(input({ seed }, { preferredPasta: 'fusilli' }));
      const needs = planNeeds(plan.slots, 1, recipesById, ingredientsById);
      const pastaIds = INGREDIENTS.filter((i) => i.group === 'pasta').map((i) => i.id);
      for (const id of pastaIds) if (id !== 'fusilli') expect(needs.has(id), id).toBe(false);
      const hasPastaDish = plan.slots.some((s) => pastaIngredientOf(recipesById.get(s.recipeId)!, ingredientsById));
      if (hasPastaDish) expect(needs.get('fusilli') ?? 0).toBeGreaterThan(0);
    }
  });
});
