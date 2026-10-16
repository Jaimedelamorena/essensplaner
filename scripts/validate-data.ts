// Prüft Zutatenkatalog, Rezeptdatenbank und Preisliste. Exit-Code 1 bei Fehlern.
import { validateData } from '../src/core/validate';
import { INGREDIENTS, PRODUCTS, RECIPES } from '../src/data';

const { errors, warnings } = validateData(INGREDIENTS, RECIPES, PRODUCTS);

for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);

const estimated = PRODUCTS.filter((p) => p.estimated).length;
console.log(
  `${INGREDIENTS.length} Zutaten, ${RECIPES.length} Rezepte, ${PRODUCTS.length} Produkte (${estimated} geschätzt) – ` +
    `${errors.length} Fehler, ${warnings.length} Warnungen`,
);
process.exit(errors.length > 0 ? 1 : 0);
