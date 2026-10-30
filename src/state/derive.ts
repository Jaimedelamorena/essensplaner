// Abgeleitete Daten aus App-Zustand + mitgelieferten Daten (ohne React).
import { todayISO } from '../core/dates';
import { estimateNutrition } from '../core/nutrition';
import { pantryAvailable } from '../core/pantry';
import { costSummary, planNeeds } from '../core/plan';
import type { PlannerInput } from '../core/planner/generate';
import { applyOverrides, groupByIngredient } from '../core/pricing';
import { computeShopping, totalFor, type ShoppingMode, type ShoppingResult } from '../core/shopping';
import type { AppState, Ingredient, PriceOverride, Product, Recipe, RecipeTag } from '../core/types';
import { INGREDIENTS, PRODUCTS, RECIPES } from '../data';

export const INGREDIENTS_BY_ID = new Map<string, Ingredient>(INGREDIENTS.map((i) => [i.id, i]));
export const BUILTIN_RECIPE_IDS = new Set(RECIPES.map((r) => r.id));

/** Eingebaute Rezepte, ersetzt bzw. ergänzt durch eigene. */
export function mergedRecipes(userRecipes: Recipe[]): Recipe[] {
  const map = new Map(RECIPES.map((r) => [r.id, r]));
  for (const r of userRecipes) map.set(r.id, r);
  return [...map.values()];
}

export function effectiveProducts(overrides: Record<string, PriceOverride>): Product[] {
  return applyOverrides(PRODUCTS, overrides);
}

/** Datum, ab dem Vorräte zählen: Wochenbeginn (falls in der Zukunft) oder heute. */
export function pantryDate(state: Pick<AppState, 'plan'>): string {
  const today = todayISO();
  const start = state.plan?.weekStart;
  return start && start > today ? start : today;
}

export function plannerInput(state: AppState, weekStart: string, lastWeek: string[]): PlannerInput {
  return {
    recipes: mergedRecipes(state.userRecipes),
    ingredients: INGREDIENTS,
    products: effectiveProducts(state.priceOverrides),
    pantry: state.pantry,
    settings: state.settings,
    favorites: state.favorites,
    blocked: state.blocked,
    lastWeek,
    recentWeeks: state.history.map((h) => h.recipeIds),
    weekStart,
  };
}

/** Einkaufsliste für den aktuellen Plan (noch nicht gekochte Mahlzeiten minus Vorräte). */
export function planShopping(state: AppState): ShoppingResult | null {
  if (!state.plan) return null;
  const recipesById = new Map(mergedRecipes(state.userRecipes).map((r) => [r.id, r]));
  const needs = planNeeds(state.plan.slots, state.plan.persons, recipesById, INGREDIENTS_BY_ID);
  return computeShopping(needs, {
    ingredientsById: INGREDIENTS_BY_ID,
    byIngredient: groupByIngredient(effectiveProducts(state.priceOverrides)),
    pantryAvail: pantryAvailable(state.pantry, pantryDate(state)),
    splitThreshold: state.settings.splitThreshold,
  });
}

export interface PlanCost {
  /** Bereits bezahlt (nach «Einkauf erledigt»). */
  spent: number;
  /** Noch einzukaufen (empfohlene Variante). */
  remaining: number;
  total: number;
  perDay: number;
  perPortion: number;
  overBudget: boolean;
}

export function planCost(state: AppState, shopping: ShoppingResult | null, mode?: ShoppingMode): PlanCost | null {
  if (!state.plan || !shopping) return null;
  const spent = state.plan.shopping?.total ?? 0;
  const remaining = mode ? totalFor(shopping, mode) : shopping.recommendation.total;
  const total = Math.round((spent + remaining) * 100) / 100;
  const summary = costSummary(total, state.plan.persons);
  return { spent, remaining, ...summary, overBudget: total > state.settings.budget + 1e-9 };
}

/** Vegi/Vegan-Tags aus den Zutaten ableiten und Nährwerte schätzen (für eigene Rezepte). */
export function finalizeRecipe(recipe: Recipe): Recipe {
  const diets = recipe.ingredients.map((i) => INGREDIENTS_BY_ID.get(i.id)?.diet ?? 'vegan');
  const vegetarian = diets.every((d) => d === 'vegan' || d === 'vegetarisch');
  const vegan = diets.every((d) => d === 'vegan');
  const userTags = recipe.tags.filter((t) => t !== 'vegetarisch' && t !== 'vegan');
  const tags: RecipeTag[] = [...(vegetarian ? ['vegetarisch' as const] : []), ...(vegan ? ['vegan' as const] : []), ...userTags];
  return { ...recipe, tags, ...estimateNutrition(recipe.ingredients, INGREDIENTS_BY_ID) };
}
