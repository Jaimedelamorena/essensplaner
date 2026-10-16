import { MAX_MINUTES, type Ingredient, type MealType, type Recipe, type Settings } from '../types';

/** Grundfilter: Zeit, «nie wieder», No-Go-Zutaten, unbekannte Zutaten. */
export function baseCandidates(
  recipes: Recipe[],
  settings: Pick<Settings, 'noGo'>,
  blocked: Set<string>,
  ingredientsById: Map<string, Ingredient>,
): Recipe[] {
  const noGo = new Set(settings.noGo);
  return recipes.filter(
    (r) =>
      r.prepMin + r.cookMin <= MAX_MINUTES &&
      !blocked.has(r.id) &&
      r.ingredients.every((i) => ingredientsById.has(i.id) && !noGo.has(i.id)),
  );
}

/** Passt ein Rezept in diesen Slot? (Mitnehmen am Mittag, Meal-Prep für doppelte Abendessen) */
export function fitsSlot(
  recipe: Recipe,
  slot: { meal: MealType; double: boolean },
  settings: Pick<Settings, 'lunchToGo'>,
): boolean {
  if (slot.meal === 'mittag' && settings.lunchToGo && !recipe.tags.includes('mitnehmen')) return false;
  if (slot.double && !recipe.tags.includes('meal-prep')) return false;
  return true;
}
