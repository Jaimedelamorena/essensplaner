import { describe, expect, it } from 'vitest';
import { addToPantry, consume, pantryAvailable } from '../src/core/pantry';
import { applyOverrides, bestPacks } from '../src/core/pricing';
import { computeShopping } from '../src/core/shopping';
import type { Ingredient, Product } from '../src/core/types';
import { formatIngredientQty, formatQty } from '../src/core/units';

const product = (id: string, packSize: number, price: number, store: 'coop' | 'migros' = 'coop'): Product => ({
  id,
  ingredientId: 'x',
  store,
  name: id,
  packSize,
  price,
  pricePerUnit: (price / packSize) * 1000,
  fetchedAt: '2026-10-16',
  url: 'https://example.ch',
  estimated: false,
});

const ingredient: Ingredient = {
  id: 'x',
  name: 'Test',
  unit: 'g',
  category: 'trockenwaren',
  diet: 'vegan',
  staple: false,
  shelfLifeDays: 30,
  nutrition: { kcal: 100, protein: 1 },
};

describe('Packungswahl', () => {
  it('zählt die volle Packung, auch wenn nur ein Teil gebraucht wird', () => {
    const choice = bestPacks([product('a', 500, 2)], 200)!;
    expect(choice.cost).toBe(2);
    expect(choice.qty).toBe(500);
  });

  it('wählt die günstigste Kombination', () => {
    const options = [product('klein', 250, 1.5), product('gross', 1000, 2.5)];
    expect(bestPacks(options, 200)!.cost).toBe(1.5);
    expect(bestPacks(options, 600)!.cost).toBe(2.5);
    expect(bestPacks(options, 1200)!.cost).toBe(4);
    expect(bestPacks(options, 2100)!.cost).toBe(6.5);
  });

  it('braucht nichts zu kaufen, wenn der Bedarf 0 ist', () => {
    expect(bestPacks([product('a', 500, 2)], 0)!.cost).toBe(0);
  });

  it('wendet manuelle Preise an', () => {
    const [p] = applyOverrides([product('a', 500, 2)], { a: { price: 3, packSize: 1000, updatedAt: '2026-10-20' } });
    expect(p.price).toBe(3);
    expect(p.packSize).toBe(1000);
    expect(p.pricePerUnit).toBe(3);
    expect(p.fetchedAt).toBe('2026-10-20');
  });
});

describe('Ladenvergleich', () => {
  const ctx = (threshold: number, products: Product[]) => ({
    ingredientsById: new Map([['x', ingredient], ['y', { ...ingredient, id: 'y' }]]),
    byIngredient: new Map([
      ['x', products.filter((p) => p.ingredientId === 'x')],
      ['y', products.filter((p) => p.ingredientId === 'y')],
    ]),
    pantryAvail: new Map<string, number>(),
    splitThreshold: threshold,
  });
  const products = [
    { ...product('x-coop', 1000, 10, 'coop') },
    { ...product('x-migros', 1000, 4, 'migros') },
    { ...product('y-coop', 1000, 3, 'coop'), ingredientId: 'y' },
    { ...product('y-migros', 1000, 8, 'migros'), ingredientId: 'y' },
  ];
  const needs = new Map([['x', 500], ['y', 500]]);

  it('empfiehlt einen Laden, wenn die Aufteilung nicht MEHR als die Schwelle spart', () => {
    const r = computeShopping(needs, ctx(5, products));
    expect(r.totals).toEqual({ coop: 13, migros: 12, split: 7 });
    // Aufteilen spart genau 5.– → nicht mehr als 5.– → ein Laden
    expect(r.recommendation.mode).toBe('migros');
    expect(r.recommendation.total).toBe(12);
  });

  it('teilt nur auf, wenn die Ersparnis über der Schwelle liegt', () => {
    expect(computeShopping(needs, ctx(6, products)).recommendation.mode).toBe('migros');
    expect(computeShopping(needs, ctx(4, products)).recommendation.mode).toBe('split');
  });
});

describe('Vorräte', () => {
  it('verbraucht zuerst, was am frühesten abläuft', () => {
    let pantry = addToPantry([], ingredient, 300, '2026-10-25');
    pantry = addToPantry(pantry, ingredient, 300, '2026-10-20');
    pantry = consume(pantry, 'x', 400);
    expect(pantry).toHaveLength(1);
    expect(pantry[0].expiresAt).toBe('2026-10-25');
    expect(pantry[0].qty).toBe(200);
  });

  it('zählt abgelaufene Vorräte nicht', () => {
    const pantry = addToPantry([], ingredient, 300, '2026-10-10');
    expect(pantryAvailable(pantry, '2026-10-16').get('x')).toBeUndefined();
    expect(pantryAvailable(pantry, '2026-10-09').get('x')).toBe(300);
  });
});

describe('Anzeige', () => {
  it('formatiert Mengen lesbar', () => {
    expect(formatQty(1250, 'g')).toBe('1,25 kg');
    expect(formatQty(0.5, 'stk')).toBe('½ Stk');
    expect(formatQty(1.5, 'stk')).toBe('1½ Stk');
    expect(formatIngredientQty(20, { ...ingredient, unit: 'ml', measure: { label: 'EL', amount: 10 } })).toBe(
      '20 ml (≈ 2 EL)',
    );
  });
});
