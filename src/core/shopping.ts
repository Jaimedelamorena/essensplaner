import { bestPacks, productsFor, round2, type PackChoice } from './pricing';
import type { Ingredient, Product, Store } from './types';

export type ShoppingMode = Store | 'split';

export interface ShoppingItem {
  ingredient: Ingredient;
  /** Benötigte Menge für den Plan. */
  need: number;
  /** Davon schon in den Vorräten. */
  inPantry: number;
  /** Noch zu kaufen. */
  toBuy: number;
  coop: PackChoice | null;
  migros: PackChoice | null;
}

export interface ShoppingResult {
  items: ShoppingItem[];
  totals: { coop: number; migros: number; split: number };
  recommendation: { mode: ShoppingMode; total: number; saving: number };
}

export interface ShoppingContext {
  ingredientsById: Map<string, Ingredient>;
  byIngredient: Map<string, Product[]>;
  pantryAvail: Map<string, number>;
  splitThreshold: number;
}

/** Günstigere der beiden Ladenoptionen für einen Posten. */
export function cheaperStore(item: Pick<ShoppingItem, 'coop' | 'migros'>): Store | null {
  if (!item.coop && !item.migros) return null;
  if (!item.migros) return 'coop';
  if (!item.coop) return 'migros';
  return item.migros.cost < item.coop.cost ? 'migros' : 'coop';
}

/** Welcher Laden und welche Packungen für einen Posten im gewählten Modus gelten. */
export function choiceFor(item: ShoppingItem, mode: ShoppingMode): { store: Store; choice: PackChoice } | null {
  const store = mode === 'split' ? cheaperStore(item) : item[mode] ? mode : cheaperStore(item);
  if (!store) return null;
  const choice = item[store];
  return choice ? { store, choice } : null;
}

/**
 * Einkaufsliste aus Bedarf minus Vorräte, mit Ladenvergleich.
 * Empfohlen wird ein einziger Laden, ausser die Aufteilung spart mehr als `splitThreshold`.
 */
export function computeShopping(needs: Map<string, number>, ctx: ShoppingContext): ShoppingResult {
  const items: ShoppingItem[] = [];
  let coop = 0;
  let migros = 0;
  let split = 0;

  for (const [ingredientId, need] of needs) {
    const ingredient = ctx.ingredientsById.get(ingredientId);
    if (!ingredient || need <= 0) continue;
    const inPantry = Math.min(need, ctx.pantryAvail.get(ingredientId) ?? 0);
    const toBuy = Math.max(0, need - inPantry);
    const coopChoice = bestPacks(productsFor(ctx.byIngredient, ingredientId, 'coop'), toBuy);
    const migrosChoice = bestPacks(productsFor(ctx.byIngredient, ingredientId, 'migros'), toBuy);
    items.push({ ingredient, need, inPantry, toBuy, coop: coopChoice, migros: migrosChoice });
    if (toBuy <= 0) continue;
    coop += coopChoice ? coopChoice.cost : Infinity;
    migros += migrosChoice ? migrosChoice.cost : Infinity;
    split += Math.min(coopChoice?.cost ?? Infinity, migrosChoice?.cost ?? Infinity);
  }

  const single: Store = migros < coop ? 'migros' : 'coop';
  const singleTotal = Math.min(coop, migros);
  const saving = singleTotal - split;
  const recommendation =
    Number.isFinite(saving) && saving > ctx.splitThreshold
      ? { mode: 'split' as const, total: round2(split), saving: round2(saving) }
      : Number.isFinite(singleTotal)
        ? { mode: single, total: round2(singleTotal), saving: round2(Math.max(0, saving)) }
        : { mode: 'split' as const, total: round2(split), saving: 0 };

  return {
    items,
    totals: { coop: round2(coop), migros: round2(migros), split: round2(split) },
    recommendation,
  };
}

export function totalFor(result: ShoppingResult, mode: ShoppingMode): number {
  return mode === 'split' ? result.totals.split : result.totals[mode];
}
