import type { Ingredient, RecipeIngredient } from './types';

/** Schätzt kcal und Protein pro Portion aus den Zutatenmengen (pro Person). */
export function estimateNutrition(
  items: RecipeIngredient[],
  byId: Map<string, Ingredient>,
): { kcal: number; protein: number } {
  let kcal = 0;
  let protein = 0;
  for (const { id, qty } of items) {
    const ing = byId.get(id);
    if (!ing) throw new Error(`Unbekannte Zutat: ${id}`);
    const factor = ing.unit === 'stk' ? qty : qty / 100;
    kcal += ing.nutrition.kcal * factor;
    protein += ing.nutrition.protein * factor;
  }
  return { kcal: Math.round(kcal / 10) * 10, protein: Math.round(protein) };
}
