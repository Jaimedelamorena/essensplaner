import { describe, expect, it } from 'vitest';
import { estimateNutrition } from '../src/core/nutrition';
import { CUISINES, MAX_MINUTES, type Recipe } from '../src/core/types';
import { validateData, validateRecipe } from '../src/core/validate';
import { INGREDIENTS, RECIPES } from '../src/data';

const byId = new Map(INGREDIENTS.map((i) => [i.id, i]));

/** Persönliche No-Gos: Koriander und jeder Käse ausser Mozzarella, Burrata und Parmesan. */
const NO_GO =
  /koriander|cilantro|käse|kaese|feta|ricotta|mascarpone|gruy|emment|appenzell|raclette|tilsit|sbrinz|vacherin|cheddar|halloumi|gorgonzola|pecorino|brie|camembert|gouda|grana/i;

describe('Rezeptdatenbank', () => {
  it('ist gültig (Validator ohne Fehler)', () => {
    const { errors } = validateData(INGREDIENTS, RECIPES);
    expect(errors).toEqual([]);
  });

  it('enthält mindestens 40 Rezepte', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(40);
  });

  it(`hat nur Rezepte mit höchstens ${MAX_MINUTES} Minuten`, () => {
    const tooLong = RECIPES.filter((r) => r.prepMin + r.cookMin > MAX_MINUTES).map((r) => r.id);
    expect(tooLong).toEqual([]);
  });

  it('enthält keine No-Go-Zutaten', () => {
    const hits = INGREDIENTS.filter((i) => NO_GO.test(i.name) || NO_GO.test(i.id)).map((i) => i.id);
    expect(hits).toEqual([]);
  });

  it('ist bunt gemischt (jede Küche mit mindestens 4 Rezepten)', () => {
    for (const cuisine of CUISINES) {
      expect(RECIPES.filter((r) => r.cuisine === cuisine).length, cuisine).toBeGreaterThanOrEqual(4);
    }
  });

  it('hat genug Meal-Prep-Rezepte für Reste-Mittagessen', () => {
    expect(RECIPES.filter((r) => r.tags.includes('meal-prep')).length).toBeGreaterThanOrEqual(15);
  });

  it('hat plausible Nährwerte pro Portion', () => {
    for (const r of RECIPES) {
      expect(r.kcal, r.id).toBeGreaterThanOrEqual(300);
      expect(r.kcal, r.id).toBeLessThanOrEqual(1300);
      expect(r.protein, r.id).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('Validator', () => {
  const valid: Recipe = {
    id: 'test-rezept',
    name: 'Test',
    cuisine: 'italienisch',
    base: 'pasta',
    prepMin: 5,
    cookMin: 10,
    ingredients: [
      { id: 'spaghetti', qty: 100 },
      { id: 'olivenoel', qty: 10 },
    ],
    steps: ['Kochen.', 'Essen.'],
    tags: ['vegetarisch', 'vegan'],
    kcal: 0,
    protein: 0,
  };
  const withNutrition = (r: Recipe): Recipe => ({ ...r, ...estimateNutrition(r.ingredients, byId) });

  it('akzeptiert ein korrektes Rezept', () => {
    expect(validateRecipe(withNutrition(valid), byId)).toEqual([]);
  });

  it('meldet zu lange Rezepte', () => {
    const errors = validateRecipe(withNutrition({ ...valid, cookMin: 26 }), byId);
    expect(errors.some((e) => e.includes('dauert 31 Min.'))).toBe(true);
  });

  it('meldet unbekannte Zutaten', () => {
    const errors = validateRecipe({ ...valid, ingredients: [{ id: 'koriander', qty: 5 }] }, byId);
    expect(errors.some((e) => e.includes('unbekannte Zutat «koriander»'))).toBe(true);
  });

  it('meldet falsche Vegi-Tags', () => {
    const meat = withNutrition({ ...valid, ingredients: [...valid.ingredients, { id: 'speckwuerfeli', qty: 40 }] });
    const errors = validateRecipe(meat, byId);
    expect(errors.some((e) => e.includes('«vegetarisch»'))).toBe(true);
    expect(errors.some((e) => e.includes('«vegan»'))).toBe(true);
  });

  it('meldet fehlende Nährwerte', () => {
    const errors = validateRecipe(valid, byId);
    expect(errors.some((e) => e.includes('kcal'))).toBe(true);
  });
});
