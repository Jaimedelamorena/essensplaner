import type { Ingredient, Product, Recipe } from '../core/types';
import ingredientsJson from './ingredients.json';
import pricesJson from './prices.json';
import recipesJson from './recipes.json';

// JSON wird ohne Literal-Typen importiert; die Struktur prüft validateData().
export const INGREDIENTS = ingredientsJson as unknown as Ingredient[];
export const RECIPES = recipesJson as unknown as Recipe[];
export const PRODUCTS = pricesJson as unknown as Product[];
