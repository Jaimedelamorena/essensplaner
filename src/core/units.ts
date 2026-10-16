import type { Ingredient } from './types';

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

/** Stückzahl mit Bruchzeichen, z. B. 1.5 → «1½». */
export function formatPieces(qty: number): string {
  const whole = Math.floor(qty + 1e-9);
  const rest = qty - whole;
  if (rest < 0.08) return String(whole);
  if (rest > 0.92) return String(whole + 1);
  const [, sign] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  return whole > 0 ? `${whole}${sign}` : sign;
}

const decimal = (n: number, digits: number) =>
  n.toFixed(digits).replace(/\.?0+$/, '').replace('.', ',');

function roundNice(qty: number): number {
  if (qty < 10) return Math.round(qty * 10) / 10;
  if (qty < 100) return Math.round(qty);
  return Math.round(qty / 5) * 5;
}

/** Menge mit Einheit, z. B. «250 g», «1,2 kg», «½ Stk». */
export function formatQty(qty: number, unit: Ingredient['unit']): string {
  if (unit === 'stk') return `${formatPieces(qty)} Stk`;
  const big = unit === 'g' ? 'kg' : 'l';
  if (qty >= 1000) return `${decimal(qty / 1000, 2)} ${big}`;
  return `${decimal(roundNice(qty), 1)} ${unit}`;
}

/** Haushaltsmass als Zusatz, z. B. «2 EL» – nur wenn es lesbar ist. */
export function formatMeasure(qty: number, ingredient: Ingredient): string | null {
  const m = ingredient.measure;
  if (!m) return null;
  const count = qty / m.amount;
  if (count < 0.2 || count > 12) return null;
  return `${formatPieces(Math.round(count * 4) / 4)} ${m.label}`;
}

/** Rezeptmenge für Anzeige: Hauptmenge plus Haushaltsmass. */
export function formatIngredientQty(qty: number, ingredient: Ingredient): string {
  const main = formatQty(qty, ingredient.unit);
  const measure = formatMeasure(qty, ingredient);
  return measure ? `${main} (≈ ${measure})` : main;
}

export function formatCHF(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return `CHF ${n.toFixed(2)}`;
}
