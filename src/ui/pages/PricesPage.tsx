import { useMemo, useState } from 'react';
import { daysBetween, formatAge, todayISO } from '../../core/dates';
import { CATEGORIES, CATEGORY_LABELS, type Ingredient, type Product, type Store } from '../../core/types';
import { formatCHF } from '../../core/units';
import { INGREDIENTS } from '../../data';
import { useStore } from '../../state/store';
import { Sheet } from '../components';
import { useProducts } from '../hooks';
import { Icon } from '../Icon';

type Sort = 'name' | 'kategorie' | 'preis' | 'differenz' | 'alter';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'kategorie', label: 'Kategorie' },
  { id: 'preis', label: 'Preis pro kg/l/Stk' },
  { id: 'differenz', label: 'Grösster Preisunterschied' },
  { id: 'alter', label: 'Älteste Preise zuerst' },
];

const perUnitLabel = (ing: Ingredient) => (ing.unit === 'g' ? '/kg' : ing.unit === 'ml' ? '/l' : '/Stk');
const packLabel = (p: Product, ing: Ingredient) =>
  ing.unit === 'stk' ? `${p.packSize} Stk` : p.packSize >= 1000 ? `${p.packSize / 1000} ${ing.unit === 'g' ? 'kg' : 'l'}` : `${p.packSize} ${ing.unit}`;

interface Row {
  ingredient: Ingredient;
  coop: Product[];
  migros: Product[];
  bestCoop: number;
  bestMigros: number;
  oldest: string;
}

export function PricesPage() {
  const products = useProducts();
  const overrides = useStore((s) => s.priceOverrides);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  const [editing, setEditing] = useState<{ product: Product; ingredient: Ingredient } | null>(null);
  const today = todayISO();

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const list = INGREDIENTS.map((ingredient) => {
      const mine = products.filter((p) => p.ingredientId === ingredient.id);
      const byStore = (s: Store) => mine.filter((p) => p.store === s).sort((a, b) => a.pricePerUnit - b.pricePerUnit);
      const coop = byStore('coop');
      const migros = byStore('migros');
      return {
        ingredient,
        coop,
        migros,
        bestCoop: coop[0]?.pricePerUnit ?? Infinity,
        bestMigros: migros[0]?.pricePerUnit ?? Infinity,
        oldest: mine.reduce((min, p) => (p.fetchedAt < min ? p.fetchedAt : min), '9999'),
      };
    }).filter(
      (r) =>
        !q ||
        r.ingredient.name.toLowerCase().includes(q) ||
        [...r.coop, ...r.migros].some((p) => p.name.toLowerCase().includes(q)),
    );
    const diff = (r: Row) => Math.abs(r.bestCoop - r.bestMigros) / Math.max(1e-9, Math.min(r.bestCoop, r.bestMigros));
    const sorters: Record<Sort, (a: Row, b: Row) => number> = {
      name: (a, b) => a.ingredient.name.localeCompare(b.ingredient.name),
      kategorie: (a, b) =>
        CATEGORIES.indexOf(a.ingredient.category) - CATEGORIES.indexOf(b.ingredient.category) ||
        a.ingredient.name.localeCompare(b.ingredient.name),
      preis: (a, b) => Math.min(a.bestCoop, a.bestMigros) - Math.min(b.bestCoop, b.bestMigros),
      differenz: (a, b) => diff(b) - diff(a),
      alter: (a, b) => a.oldest.localeCompare(b.oldest),
    };
    return list.sort(sorters[sort]);
  }, [products, query, sort]);

  const cheaperCount = {
    coop: rows.filter((r) => r.bestCoop < r.bestMigros).length,
    migros: rows.filter((r) => r.bestMigros < r.bestCoop).length,
  };

  return (
    <div className="stack">
      <section className="card stack-sm">
        <div className="row wrap">
          <input
            type="search"
            className="grow"
            placeholder="Zutat oder Produkt suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Preisliste durchsuchen"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortieren">
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <p className="tiny muted no-margin">
          Günstiger pro kg/l/Stück: Coop bei {cheaperCount.coop}, Migros bei {cheaperCount.migros} Zutaten. Preise von coop.ch
          und migros.ch (Region Ostschweiz), Aktionspreise nicht berücksichtigt. Antippen zum Bearbeiten.
        </p>
      </section>

      {rows.map((row) => (
        <section key={row.ingredient.id} className="card price-card">
          <div className="row between baseline">
            <h3>{row.ingredient.name}</h3>
            <span className="tiny muted">{CATEGORY_LABELS[row.ingredient.category]}</span>
          </div>
          <div className="price-grid">
            {(['coop', 'migros'] as Store[]).map((store) => {
              const list = row[store];
              const best = store === 'coop' ? row.bestCoop : row.bestMigros;
              const other = store === 'coop' ? row.bestMigros : row.bestCoop;
              return (
                <div key={store} className={`price-cell ${best < other ? 'cheaper' : ''}`}>
                  <div className="row between">
                    <strong className="small">{store === 'coop' ? 'Coop' : 'Migros'}</strong>
                    {best < other && <span className="badge good">günstiger</span>}
                  </div>
                  {list.map((p) => {
                    const age = daysBetween(p.fetchedAt, today);
                    return (
                      <button key={p.id} className="price-product" onClick={() => setEditing({ product: p, ingredient: row.ingredient })}>
                        <span className="small">{p.name}</span>
                        <span className="row between">
                          <span className="tabular">
                            {formatCHF(p.price)} <span className="tiny muted">· {packLabel(p, row.ingredient)}</span>
                          </span>
                        </span>
                        <span className="tiny muted tabular">
                          {p.pricePerUnit.toFixed(2)} CHF{perUnitLabel(row.ingredient)} · {formatAge(p.fetchedAt, today)}
                        </span>
                        <span className="badges">
                          {p.estimated && <span className="badge warn">geschätzt</span>}
                          {overrides[p.id] && <span className="badge good">von dir angepasst</span>}
                          {age > 60 && <span className="badge warn">älter als 2 Monate</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {editing && <EditPriceSheet {...editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditPriceSheet({ product, ingredient, onClose }: { product: Product; ingredient: Ingredient; onClose: () => void }) {
  const { setPriceOverride, clearPriceOverride } = useStore.getState();
  const hasOverride = useStore((s) => !!s.priceOverrides[product.id]);
  const [price, setPrice] = useState(String(product.price));
  const [packSize, setPackSize] = useState(String(product.packSize));
  const valid = Number(price) > 0 && Number(packSize) > 0;
  const unitLabel = ingredient.unit === 'stk' ? 'Stück' : ingredient.unit;

  return (
    <Sheet title="Preis anpassen" onClose={onClose}>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          setPriceOverride(product.id, Math.round(Number(price) * 100) / 100, Number(packSize));
          onClose();
        }}
      >
        <div>
          <strong>{product.name}</strong>
          <div className="small muted">{product.store === 'coop' ? 'Coop' : 'Migros'}</div>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Preis (CHF)</span>
            <input type="number" inputMode="decimal" step="0.05" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="field">
            <span>Packungsgrösse ({unitLabel})</span>
            <input type="number" inputMode="decimal" min={0} step="any" value={packSize} onChange={(e) => setPackSize(e.target.value)} />
          </label>
        </div>
        <a className="small" href={product.url} target="_blank" rel="noreferrer">
          Produkt im Shop ansehen <Icon name="external" size={14} />
        </a>
        <div className="row wrap">
          <button className="btn primary" type="submit" disabled={!valid}>
            Speichern
          </button>
          {hasOverride && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                clearPriceOverride(product.id);
                onClose();
              }}
            >
              Originalpreis
            </button>
          )}
        </div>
        <p className="tiny muted no-margin">
          Angepasste Preise gelten sofort für Plan und Einkaufsliste und werden mit dem Backup exportiert.
        </p>
      </form>
    </Sheet>
  );
}
