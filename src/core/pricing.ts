import type { Product, PriceOverride, Store } from './types';

export interface PackChoice {
  packs: { product: Product; count: number }[];
  cost: number;
  /** Gekaufte Menge in der Basiseinheit der Zutat. */
  qty: number;
}

const EMPTY: PackChoice = { packs: [], cost: 0, qty: 0 };

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** CHF pro kg/l (g, ml) bzw. pro Stück. */
export function pricePerUnit(price: number, packSize: number, unit: string): number {
  return round2(unit === 'stk' ? price / packSize : (price / packSize) * 1000);
}

/** Manuell angepasste Preise anwenden. */
export function applyOverrides(products: Product[], overrides: Record<string, PriceOverride>): Product[] {
  return products.map((p) => {
    const o = overrides[p.id];
    if (!o) return p;
    // 1000 bei g/ml (CHF pro kg/l), 1 bei Stück
    const perUnitFactor = p.pricePerUnit / (p.price / p.packSize) > 10 ? 1000 : 1;
    return {
      ...p,
      price: o.price,
      packSize: o.packSize,
      pricePerUnit: round2((o.price / o.packSize) * perUnitFactor),
      fetchedAt: o.updatedAt,
      estimated: false,
    };
  });
}

export function groupByIngredient(products: Product[]): Map<string, Product[]> {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const list = map.get(p.ingredientId);
    if (list) list.push(p);
    else map.set(p.ingredientId, [p]);
  }
  return map;
}

export function productsFor(byIng: Map<string, Product[]>, ingredientId: string, store: Store): Product[] {
  return (byIng.get(ingredientId) ?? []).filter((p) => p.store === store);
}

/**
 * Günstigste Packungskombination, die mindestens `need` abdeckt.
 * Volle Packungen zählen immer ganz – der Rest landet nach dem Einkauf in den Vorräten.
 */
export function bestPacks(options: Product[], need: number): PackChoice | null {
  if (need <= 1e-9) return EMPTY;
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => b.packSize - a.packSize);
  let best: PackChoice | null = null;
  const counts = new Array<number>(sorted.length).fill(0);

  const search = (i: number, remaining: number, cost: number) => {
    if (best && cost >= best.cost - 1e-9) return;
    if (remaining <= 1e-9) {
      const packs = counts
        .map((count, k) => ({ product: sorted[k], count }))
        .filter((x) => x.count > 0);
      const qty = packs.reduce((s, x) => s + x.product.packSize * x.count, 0);
      best = { packs, cost: round2(cost), qty };
      return;
    }
    if (i >= sorted.length) return;
    const p = sorted[i];
    const max = Math.ceil(remaining / p.packSize - 1e-9);
    const isLast = i === sorted.length - 1;
    for (let c = max; c >= (isLast ? max : 0); c--) {
      counts[i] = c;
      search(i + 1, remaining - c * p.packSize, cost + c * p.price);
    }
    counts[i] = 0;
  };

  search(0, need, 0);
  return best;
}

/** Günstigster Preis pro Basiseinheit (CHF pro g/ml/Stk) über alle Produkte einer Zutat. */
export function cheapestUnitPrice(options: Product[]): number {
  let min = Infinity;
  for (const p of options) min = Math.min(min, p.price / p.packSize);
  return Number.isFinite(min) ? min : 0;
}
