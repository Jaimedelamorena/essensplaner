import { addDays } from './dates';
import type { Ingredient, PantryItem } from './types';

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const isUsable = (item: PantryItem, onDate?: string) => !onDate || !item.expiresAt || item.expiresAt >= onDate;

/** Verfügbare Mengen pro Zutat (abgelaufene Posten zählen nicht). */
export function pantryAvailable(pantry: PantryItem[], onDate?: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of pantry) {
    if (item.qty <= 0 || !isUsable(item, onDate)) continue;
    map.set(item.ingredientId, (map.get(item.ingredientId) ?? 0) + item.qty);
  }
  return map;
}

/** Mengen, die innerhalb von `days` Tagen ab `fromDate` ablaufen. */
export function pantryExpiringSoon(pantry: PantryItem[], fromDate: string, days: number): Map<string, number> {
  const limit = addDays(fromDate, days);
  const map = new Map<string, number>();
  for (const item of pantry) {
    if (item.qty <= 0 || !item.expiresAt || item.expiresAt < fromDate || item.expiresAt > limit) continue;
    map.set(item.ingredientId, (map.get(item.ingredientId) ?? 0) + item.qty);
  }
  return map;
}

/**
 * Zieht `qty` einer Zutat ab – zuerst die Posten, die am frühesten ablaufen.
 * Fehlt etwas, wird nur abgezogen, was da ist.
 */
export function consume(pantry: PantryItem[], ingredientId: string, qty: number): PantryItem[] {
  let rest = qty;
  const order = pantry
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.ingredientId === ingredientId && item.qty > 0)
    .sort((a, b) => (a.item.expiresAt ?? '9999').localeCompare(b.item.expiresAt ?? '9999'));
  const updated = [...pantry];
  for (const { item, index } of order) {
    if (rest <= 1e-9) break;
    const take = Math.min(item.qty, rest);
    updated[index] = { ...item, qty: round(item.qty - take) };
    rest -= take;
  }
  // Grundvorrat bleibt als Eintrag mit Menge 0 sichtbar, alles andere verschwindet.
  return updated.filter((item) => item.qty > 1e-6 || item.staple);
}

/** Fügt eine Menge hinzu (z. B. nach dem Einkauf); gleiche Zutat + gleiches Ablaufdatum wird zusammengelegt. */
export function addToPantry(
  pantry: PantryItem[],
  ingredient: Ingredient,
  qty: number,
  expiresAt: string | undefined,
): PantryItem[] {
  if (qty <= 0) return pantry;
  const index = pantry.findIndex((p) => p.ingredientId === ingredient.id && p.expiresAt === expiresAt);
  if (index >= 0) {
    const updated = [...pantry];
    updated[index] = { ...pantry[index], qty: round(pantry[index].qty + qty) };
    return updated;
  }
  return [...pantry, { id: newId(), ingredientId: ingredient.id, qty: round(qty), expiresAt, staple: ingredient.staple }];
}

/** Ablaufdatum für frisch gekaufte Ware. */
export function expiryFor(ingredient: Ingredient, purchaseDate: string): string | undefined {
  return ingredient.shelfLifeDays >= 365 ? undefined : addDays(purchaseDate, ingredient.shelfLifeDays);
}

const round = (n: number) => Math.round(n * 1000) / 1000;
