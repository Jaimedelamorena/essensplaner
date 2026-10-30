import { addToPantry, consume, expiryFor } from './pantry';
import { effectiveIngredients } from './recipes';
import { choiceFor, type ShoppingMode, type ShoppingResult } from './shopping';
import type { Ingredient, PantryItem, Persons, Recipe, Slot, WeekPlan } from './types';

export const SLOTS_PER_WEEK = 14;

/** Slot-Index für Tag und Mahlzeit (Mittag vor Abend). */
export const slotIndex = (day: number, meal: Slot['meal']) => day * 2 + (meal === 'abend' ? 1 : 0);

/** Portionen, die für diesen Slot gekocht werden (Reste-Mittag: 0, doppeltes Abendessen: 2×). */
export function portionsFor(slot: Slot, persons: Persons): number {
  if (slot.leftoverOf !== undefined) return 0;
  return persons * (slot.double ? 2 : 1);
}

/** Zutaten eines Slots (inkl. ausgetauschter Pasta-Sorte), skaliert auf die gekochten Portionen. */
export function slotIngredients(
  slot: Slot,
  persons: Persons,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
): { id: string; qty: number }[] {
  const recipe = recipesById.get(slot.recipeId);
  const portions = portionsFor(slot, persons);
  if (!recipe || portions === 0) return [];
  return effectiveIngredients(recipe, slot.swaps, ingredientsById).map(({ id, qty }) => ({ id, qty: qty * portions }));
}

/** Zutatenbedarf eines Plans; bereits gekochte Slots zählen nicht mehr. */
export function planNeeds(
  slots: (Slot | null)[],
  persons: Persons,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
  includeCooked = false,
): Map<string, number> {
  const needs = new Map<string, number>();
  for (const slot of slots) {
    if (!slot || (slot.cooked && !includeCooked)) continue;
    for (const { id, qty } of slotIngredients(slot, persons, recipesById, ingredientsById)) {
      needs.set(id, (needs.get(id) ?? 0) + qty);
    }
  }
  return needs;
}

/** «Gekocht»: Zutaten des Slots von den Vorräten abziehen. */
export function cookSlot(
  pantry: PantryItem[],
  slot: Slot,
  persons: Persons,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>,
): PantryItem[] {
  return slotIngredients(slot, persons, recipesById, ingredientsById).reduce(
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
): PantryItem[] {
  return slotIngredients(slot, persons, recipesById, ingredientsById).reduce((acc, { id, qty }) => {
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

/** Gesamt-, Tages- und Portionskosten. */
export function costSummary(total: number, persons: Persons) {
  return {
    total,
    perDay: total / 7,
    perPortion: total / (SLOTS_PER_WEEK * persons),
  };
}

export function planRecipeIds(plan: WeekPlan): string[] {
  return [...new Set(plan.slots.filter((s) => s.leftoverOf === undefined).map((s) => s.recipeId))];
}
