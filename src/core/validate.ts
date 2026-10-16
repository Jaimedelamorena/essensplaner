import { estimateNutrition } from './nutrition';
import { pricePerUnit } from './pricing';
import {
  CATEGORIES,
  CUISINES,
  DIETS,
  MAX_MINUTES,
  RECIPE_BASES,
  RECIPE_TAGS,
  STORES,
  UNITS,
  type Ingredient,
  type Product,
  type Recipe,
} from './types';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Erlaubte Abweichung der gespeicherten Nährwerte von der Schätzung. */
const NUTRITION_TOLERANCE = 0.15;

const includes = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

export function validateIngredients(ingredients: Ingredient[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const ing of ingredients) {
    const at = `Zutat «${ing.id}»`;
    if (!ID_PATTERN.test(ing.id)) errors.push(`${at}: ungültige ID`);
    if (seen.has(ing.id)) errors.push(`${at}: doppelte ID`);
    seen.add(ing.id);
    if (!ing.name?.trim()) errors.push(`${at}: Name fehlt`);
    if (!includes(UNITS, ing.unit)) errors.push(`${at}: unbekannte Einheit ${ing.unit}`);
    if (!includes(CATEGORIES, ing.category)) errors.push(`${at}: unbekannte Kategorie ${ing.category}`);
    if (!includes(DIETS, ing.diet)) errors.push(`${at}: unbekannte Ernährungsform ${ing.diet}`);
    if (typeof ing.staple !== 'boolean') errors.push(`${at}: staple muss true/false sein`);
    if (!(ing.shelfLifeDays > 0)) errors.push(`${at}: Haltbarkeit muss > 0 sein`);
    if (ing.openedShelfLifeDays !== undefined) {
      if (!(ing.openedShelfLifeDays > 0)) errors.push(`${at}: Haltbarkeit nach Anbruch muss > 0 sein`);
      if (ing.openedShelfLifeDays > ing.shelfLifeDays)
        errors.push(`${at}: Haltbarkeit nach Anbruch länger als ungeöffnet`);
    }
    if (ing.measure && !(ing.measure.amount > 0)) errors.push(`${at}: Haushaltsmass muss > 0 sein`);
    if (!ing.nutrition || !(ing.nutrition.kcal >= 0) || !(ing.nutrition.protein >= 0))
      errors.push(`${at}: Nährwerte fehlen`);
  }
  return errors;
}

export function validateRecipe(recipe: Recipe, byId: Map<string, Ingredient>): string[] {
  const errors: string[] = [];
  const at = `Rezept «${recipe.id}»`;
  if (!ID_PATTERN.test(recipe.id)) errors.push(`${at}: ungültige ID`);
  if (!recipe.name?.trim()) errors.push(`${at}: Name fehlt`);
  if (!includes(CUISINES, recipe.cuisine)) errors.push(`${at}: unbekannte Küche ${recipe.cuisine}`);
  if (!includes(RECIPE_BASES, recipe.base)) errors.push(`${at}: unbekannte Basis ${recipe.base}`);

  const total = recipe.prepMin + recipe.cookMin;
  if (!Number.isInteger(recipe.prepMin) || recipe.prepMin < 0) errors.push(`${at}: ungültige Vorbereitungszeit`);
  if (!Number.isInteger(recipe.cookMin) || recipe.cookMin < 0) errors.push(`${at}: ungültige Kochzeit`);
  if (!(total > 0)) errors.push(`${at}: Gesamtzeit fehlt`);
  if (total > MAX_MINUTES) errors.push(`${at}: dauert ${total} Min. (max. ${MAX_MINUTES})`);

  if (!recipe.ingredients?.length) errors.push(`${at}: keine Zutaten`);
  const used = new Set<string>();
  let allVegan = true;
  let allVegetarian = true;
  for (const item of recipe.ingredients ?? []) {
    const ing = byId.get(item.id);
    if (!ing) {
      errors.push(`${at}: unbekannte Zutat «${item.id}»`);
      continue;
    }
    if (used.has(item.id)) errors.push(`${at}: Zutat «${item.id}» doppelt`);
    used.add(item.id);
    if (!(item.qty > 0)) errors.push(`${at}: Menge für «${item.id}» muss > 0 sein`);
    if (ing.diet !== 'vegan') allVegan = false;
    if (ing.diet === 'fleisch' || ing.diet === 'fisch') allVegetarian = false;
  }

  if (!recipe.steps || recipe.steps.length < 2 || recipe.steps.some((s) => !s.trim()))
    errors.push(`${at}: mindestens 2 nicht-leere Schritte nötig`);

  const tags = recipe.tags ?? [];
  for (const tag of tags) if (!includes(RECIPE_TAGS, tag)) errors.push(`${at}: unbekannter Tag ${tag}`);
  if (new Set(tags).size !== tags.length) errors.push(`${at}: doppelte Tags`);
  if (tags.includes('vegetarisch') !== allVegetarian)
    errors.push(`${at}: Tag «vegetarisch» passt nicht zu den Zutaten`);
  if (tags.includes('vegan') !== allVegan) errors.push(`${at}: Tag «vegan» passt nicht zu den Zutaten`);

  if (errors.length === 0) {
    const est = estimateNutrition(recipe.ingredients, byId);
    const off = (stored: number, estimated: number) =>
      Math.abs(stored - estimated) > Math.max(NUTRITION_TOLERANCE * estimated, 3);
    if (!(recipe.kcal > 0) || off(recipe.kcal, est.kcal))
      errors.push(`${at}: kcal ${recipe.kcal} weicht von Schätzung ${est.kcal} ab (npm run data:nutrition)`);
    if (!(recipe.protein >= 0) || off(recipe.protein, est.protein))
      errors.push(`${at}: Protein ${recipe.protein} g weicht von Schätzung ${est.protein} g ab`);
  }
  return errors;
}

export function validateProducts(products: Product[], ingredients: Ingredient[]): string[] {
  const errors: string[] = [];
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const p of products) {
    const at = `Produkt «${p.id}»`;
    if (seen.has(p.id)) errors.push(`${at}: doppelte ID`);
    seen.add(p.id);
    const ing = byId.get(p.ingredientId);
    if (!ing) errors.push(`${at}: unbekannte Zutat «${p.ingredientId}»`);
    if (!includes(STORES, p.store)) errors.push(`${at}: unbekannter Laden ${p.store}`);
    if (!p.name?.trim()) errors.push(`${at}: Name fehlt`);
    if (!(p.packSize > 0)) errors.push(`${at}: Packungsgrösse muss > 0 sein`);
    if (!(p.price > 0)) errors.push(`${at}: Preis muss > 0 sein`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fetchedAt)) errors.push(`${at}: Abrufdatum ungültig`);
    if (!p.url?.startsWith('https://')) errors.push(`${at}: Link fehlt`);
    if (ing && p.packSize > 0 && Math.abs(pricePerUnit(p.price, p.packSize, ing.unit) - p.pricePerUnit) > 0.011)
      errors.push(`${at}: Preis pro Einheit stimmt nicht (npm run prices:normalize)`);
  }
  for (const ing of ingredients)
    for (const store of STORES)
      if (!products.some((p) => p.ingredientId === ing.id && p.store === store))
        errors.push(`Zutat «${ing.id}»: kein Preis bei ${store}`);
  return errors;
}

export function validateData(ingredients: Ingredient[], recipes: Recipe[], products?: Product[]): ValidationResult {
  const errors = validateIngredients(ingredients);
  if (products) errors.push(...validateProducts(products, ingredients));
  const warnings: string[] = [];
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  const recipeIds = new Set<string>();
  const usedIngredients = new Set<string>();
  for (const recipe of recipes) {
    if (recipeIds.has(recipe.id)) errors.push(`Rezept «${recipe.id}»: doppelte ID`);
    recipeIds.add(recipe.id);
    errors.push(...validateRecipe(recipe, byId));
    for (const item of recipe.ingredients ?? []) usedIngredients.add(item.id);
  }

  for (const ing of ingredients)
    if (!usedIngredients.has(ing.id)) warnings.push(`Zutat «${ing.id}» wird in keinem Rezept verwendet`);

  return { errors, warnings };
}
