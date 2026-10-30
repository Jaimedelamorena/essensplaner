import { estimateNutrition } from './nutrition';
import { MEAT_MEAL_GRAMS, type Ingredient, type Recipe, type RecipeIngredient } from './types';

/**
 * Zutaten eines Rezepts mit ausgetauschten Zutaten (z. B. Spaghetti → Farfalle).
 * Getauscht wird nur innerhalb derselben Gruppe; die Menge wird über `groupFactor` umgerechnet
 * (110 g trockene Pasta → 154 g frische Ravioli).
 */
export function effectiveIngredients(
  recipe: Recipe,
  swaps: Record<string, string> | undefined,
  ingredientsById: Map<string, Ingredient>,
): RecipeIngredient[] {
  if (!swaps) return recipe.ingredients;
  return recipe.ingredients.map(({ id, qty }) => {
    const to = swaps[id];
    if (!to || to === id) return { id, qty };
    const from = ingredientsById.get(id);
    const target = ingredientsById.get(to);
    if (!from?.group || from.group !== target?.group) return { id, qty };
    return { id: to, qty: (qty / (from.groupFactor ?? 1)) * (target.groupFactor ?? 1) };
  });
}

/** Die (erste) Pasta-Zutat eines Rezepts – oder null, wenn es kein Pasta-Gericht ist. */
export function pastaIngredientOf(recipe: Recipe, ingredientsById: Map<string, Ingredient>): string | null {
  return recipe.ingredients.find((i) => ingredientsById.get(i.id)?.group === 'pasta')?.id ?? null;
}

/** Alle Pasta-Sorten des Katalogs. */
export function pastaTypes(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter((i) => i.group === 'pasta');
}

/** Tausch-Objekt für eine gewünschte Pasta-Sorte (leer, wenn nicht nötig). */
export function pastaSwap(
  recipe: Recipe,
  pastaId: string | undefined,
  ingredientsById: Map<string, Ingredient>,
): Record<string, string> | undefined {
  if (!pastaId || ingredientsById.get(pastaId)?.group !== 'pasta') return undefined;
  const original = pastaIngredientOf(recipe, ingredientsById);
  return original && original !== pastaId ? { [original]: pastaId } : undefined;
}

/** Gramm Hauptfleisch pro Portion (Stück-Zutaten wie Cervelat zählen 100 g). */
export function meatGrams(items: RecipeIngredient[], ingredientsById: Map<string, Ingredient>): number {
  let grams = 0;
  for (const { id, qty } of items) {
    const ing = ingredientsById.get(id);
    if (ing?.mainMeat) grams += ing.unit === 'stk' ? qty * 100 : qty;
  }
  return grams;
}

export function isMeatMeal(items: RecipeIngredient[], ingredientsById: Map<string, Ingredient>): boolean {
  return meatGrams(items, ingredientsById) >= MEAT_MEAL_GRAMS;
}

/** kcal und Protein pro Portion – mit ausgetauschten Zutaten neu geschätzt. */
export function nutritionFor(
  recipe: Recipe,
  swaps: Record<string, string> | undefined,
  ingredientsById: Map<string, Ingredient>,
): { kcal: number; protein: number } {
  if (!swaps || Object.keys(swaps).length === 0) return { kcal: recipe.kcal, protein: recipe.protein };
  return estimateNutrition(effectiveIngredients(recipe, swaps, ingredientsById), ingredientsById);
}
