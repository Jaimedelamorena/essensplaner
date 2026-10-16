// Nach manuellen Änderungen an src/data/prices.json:
// berechnet «pricePerUnit» neu, sortiert nach Zutat/Laden und schreibt die Datei sauber formatiert zurück.
// Optional: `npm run prices:normalize -- --today` setzt das Abrufdatum geänderter Einträge auf heute.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { todayISO } from '../src/core/dates';
import { pricePerUnit } from '../src/core/pricing';
import type { Product } from '../src/core/types';
import { validateProducts } from '../src/core/validate';
import { INGREDIENTS } from '../src/data';

const file = fileURLToPath(new URL('../src/data/prices.json', import.meta.url));
const products = JSON.parse(readFileSync(file, 'utf8')) as Product[];
const units = new Map(INGREDIENTS.map((i) => [i.id, i.unit]));
const order = new Map(INGREDIENTS.map((i, index) => [i.id, index]));
const stampToday = process.argv.includes('--today');

let changed = 0;
for (const p of products) {
  const unit = units.get(p.ingredientId);
  if (!unit) continue;
  const ppu = pricePerUnit(p.price, p.packSize, unit);
  if (ppu !== p.pricePerUnit) {
    p.pricePerUnit = ppu;
    if (stampToday) p.fetchedAt = todayISO();
    changed++;
  }
}

products.sort(
  (a, b) =>
    (order.get(a.ingredientId) ?? 999) - (order.get(b.ingredientId) ?? 999) ||
    a.store.localeCompare(b.store) ||
    a.price - b.price,
);

writeFileSync(file, '[\n' + products.map((p) => '  ' + JSON.stringify(p)).join(',\n') + '\n]\n');
const errors = validateProducts(products, INGREDIENTS);
for (const e of errors) console.error(`✗ ${e}`);
console.log(`${products.length} Produkte, ${changed} neu berechnet, ${errors.length} Fehler.`);
process.exit(errors.length > 0 ? 1 : 0);
