// Berechnet kcal und Protein pro Portion für alle Rezepte aus den Zutaten
// und schreibt sie in src/data/recipes.json zurück.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { estimateNutrition } from '../src/core/nutrition';
import type { Recipe } from '../src/core/types';
import { INGREDIENTS } from '../src/data';

const file = fileURLToPath(new URL('../src/data/recipes.json', import.meta.url));
const recipes = JSON.parse(readFileSync(file, 'utf8')) as Recipe[];
const byId = new Map(INGREDIENTS.map((i) => [i.id, i]));

let changed = 0;
for (const recipe of recipes) {
  const { kcal, protein } = estimateNutrition(recipe.ingredients, byId);
  if (recipe.kcal !== kcal || recipe.protein !== protein) changed++;
  recipe.kcal = kcal;
  recipe.protein = protein;
}

writeFileSync(file, formatRecipes(recipes));
console.log(`${recipes.length} Rezepte geprüft, ${changed} aktualisiert.`);

/** JSON mit 2 Leerzeichen, aber Zutaten und Tags kompakt auf einer Zeile. */
function formatRecipes(data: Recipe[]): string {
  return (
    JSON.stringify(data, null, 2)
      .replace(
        /\{\n\s+"id": "([^"]+)",\n\s+"qty": ([\d.]+)\n\s+\}/g,
        (_, id: string, qty: string) => `{ "id": "${id}", "qty": ${qty} }`,
      )
      .replace(/"tags": \[([^\]]*)\]/g, (_, inner: string) => {
        const tags = inner.split(',').map((t) => t.trim()).filter(Boolean);
        return `"tags": [${tags.join(', ')}]`;
      }) + '\n'
  );
}
