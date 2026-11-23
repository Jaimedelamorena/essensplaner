import { addToPantry, consume, expiryFor } from './pantry';
import { effectiveIngredients } from './recipes';
import { choiceFor, type ShoppingMode, type ShoppingResult } from './shopping';
import type { Ingredient, PantryItem, Persons, Recipe, Slot, WeekPlan } from './types';

export const SLOTS_PER_WEEK = 14;

/** Slot-Index für Tag und Mahlzeit (Mittag vor Abend). */
export const slotIndex = (day: number, meal: Slot['meal']) => day * 2 + (meal === 'abend' ? 1 : 0);

/** Portionen laut Planstruktur (Reste-Mittag: 0, doppeltes Abendessen: 2×) – ohne Blick auf ausgefallene Mahlzeiten. */
export function portionsFor(slot: Slot, persons: Persons): number {
  if (slot.skipped || slot.leftoverOf !== undefined) return 0;
  return persons * (slot.double ? 2 : 1);
}

/**
 * Wird für diesen Slot selbst gekocht? Nein bei ausgefallenen Mahlzeiten und bei Resten –
 * ausser das Abendessen davor fällt aus, dann wird der Reste-Mittag frisch gekocht.
 */
export function cooksFresh(slots: readonly (Slot | null)[], index: number): boolean {
  const slot = slots[index];
  if (!slot || slot.skipped) return false;
  return slot.leftoverOf === undefined || !!slots[slot.leftoverOf]?.skipped;
}

/** Portionen, die für diesen Slot tatsächlich gekocht werden – mit Blick auf ausgefallene Mahlzeiten. */
export function portionsAt(slots: readonly (Slot | null)[], index: number, persons: Persons): number {
  const slot = slots[index];
  if (!slot || !cooksFresh(slots, index)) return 0;
  if (slot.double) {
    const next = slots[index + 1];
    // Fällt der Reste-Mittag aus, reicht eine Portion.
    if (next?.leftoverOf === index && next.skipped) return persons;
    return persons * 2;
  }
  return persons;
}

/** Zutaten eines Slots (inkl. ausgetauschter Pasta-Sorte), skaliert auf die gekochten Portionen. */
export function slotIngredients(
  slot: Slot,
  persons: Persons,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
  portions = portionsFor(slot, persons),
): { id: string; qty: number }[] {
  const recipe = recipesById.get(slot.recipeId);
  if (!recipe || portions === 0) return [];
  return effectiveIngredients(recipe, slot.swaps, ingredientsById).map(({ id, qty }) => ({ id, qty: qty * portions }));
}

/** Zutatenbedarf eines Plans; gekochte und ausgefallene Slots zählen nicht. */
export function planNeeds(
  slots: (Slot | null)[],
  persons: Persons,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
  includeCooked = false,
): Map<string, number> {
  const needs = new Map<string, number>();
  slots.forEach((slot, index) => {
    if (!slot || (slot.cooked && !includeCooked)) return;
    const portions = portionsAt(slots, index, persons);
    for (const { id, qty } of slotIngredients(slot, persons, recipesById, ingredientsById, portions)) {
      needs.set(id, (needs.get(id) ?? 0) + qty);
    }
  });
  return needs;
}

/** «Gekocht»: Zutaten des Slots von den Vorräten abziehen. */
export function cookSlot(
  pantry: PantryItem[],
  slot: Slot,
  persons: Persons,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
  portions = portionsFor(slot, persons),
): PantryItem[] {
  return slotIngredients(slot, persons, recipesById, ingredientsById, portions).reduce(
    (acc, { id, qty }) => consume(acc, id, qty),
    pantry,
  );
}

/** «Gekocht» rückgängig: Zutaten wieder gutschreiben. */
export function uncookSlot(
  pantry: PantryItem[],
  slot: Slot,
  persons: Persons,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
  portions = slot.cookedPortions ?? portionsFor(slot, persons),
): PantryItem[] {
  return slotIngredients(slot, persons, recipesById, ingredientsById, portions).reduce((acc, { id, qty }) => {
    const ingredient = ingredientsById.get(id);
    return ingredient ? addToPantry(acc, ingredient, qty, undefined) : acc;
  }, pantry);
}

/** «Einkauf erledigt»: gekaufte Packungen (volle Mengen) in die Vorräte. */
export function purchaseToPantry(
  pantry: PantryItem[],
  shopping: ShoppingResult,
  mode: ShoppingMode,
  purchaseDate: string,
): PantryItem[] {
  let next = pantry;
  for (const item of shopping.items) {
    if (item.toBuy <= 0) continue;
    const picked = choiceFor(item, mode);
    if (!picked) continue;
    next = addToPantry(next, item.ingredient, picked.choice.qty, expiryFor(item.ingredient, purchaseDate));
  }
  return next;
}

/** Mahlzeiten, die gegessen werden (ausgefallene zählen nicht). */
export const eatenMeals = (slots: readonly (Slot | null)[]) => slots.filter((s) => s && !s.skipped).length;

/** Gesamt-, Tages- und Portionskosten. */
export function costSummary(total: number, persons: Persons, meals = SLOTS_PER_WEEK) {
  return {
    total,
    perDay: total / 7,
    perPortion: total / (Math.max(1, meals) * persons),
  };
}

/** Rezepte, die diese Woche gekocht werden (für «nicht zwei Wochen hintereinander»). */
export function planRecipeIds(plan: WeekPlan): string[] {
  return [...new Set(plan.slots.filter((_, i) => cooksFresh(plan.slots, i)).map((s) => s.recipeId))];
}
