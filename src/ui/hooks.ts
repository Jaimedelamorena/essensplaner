import { useMemo } from 'react';
import type { AppState, Recipe } from '../core/types';
import { effectiveProducts, mergedRecipes, planCost, planShopping } from '../state/derive';
import { useStore } from '../state/store';

export function useRecipes(): Recipe[] {
  const userRecipes = useStore((s) => s.userRecipes);
  return useMemo(() => mergedRecipes(userRecipes), [userRecipes]);
}

export function useRecipesById(): Map<string, Recipe> {
  const recipes = useRecipes();
  return useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
}

export function useProducts() {
  const overrides = useStore((s) => s.priceOverrides);
  return useMemo(() => effectiveProducts(overrides), [overrides]);
}

/** Einkaufsliste und Kosten des aktuellen Plans. */
export function usePlanData() {
  const plan = useStore((s) => s.plan);
  const pantry = useStore((s) => s.pantry);
  const settings = useStore((s) => s.settings);
  const userRecipes = useStore((s) => s.userRecipes);
  const priceOverrides = useStore((s) => s.priceOverrides);
  return useMemo(() => {
    const state = { plan, pantry, settings, userRecipes, priceOverrides } as AppState;
    const shopping = planShopping(state);
    return { shopping, cost: planCost(state, shopping) };
  }, [plan, pantry, settings, userRecipes, priceOverrides]);
}
