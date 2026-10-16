import { useState } from 'react';
import { formatDate } from '../../core/dates';
import { choiceFor, type ShoppingItem, type ShoppingMode } from '../../core/shopping';
import { CATEGORIES, CATEGORY_LABELS } from '../../core/types';
import { formatCHF, formatQty } from '../../core/units';
import { useStore } from '../../state/store';
import { Checkbox, Empty } from '../components';
import { usePlanData } from '../hooks';
import { Link } from '../router';

const MODE_LABEL: Record<ShoppingMode, string> = { coop: 'Coop', migros: 'Migros', split: 'Kombination' };

export function ShoppingPage() {
  const plan = useStore((s) => s.plan);
  const checked = useStore((s) => s.checked);
  const settings = useStore((s) => s.settings);
  const { toggleChecked, completeShopping } = useStore.getState();
  const { shopping } = usePlanData();
  const [selected, setSelected] = useState<ShoppingMode | null>(null);
  const [showPantry, setShowPantry] = useState(false);

  if (!plan || !shopping) {
    return (
      <Empty title="Keine Einkaufsliste">
        <p className="muted">
          Die Liste entsteht automatisch aus dem <Link to="/">Wochenplan</Link>.
        </p>
      </Empty>
    );
  }

  const recommended = shopping.recommendation.mode;
  const mode = selected ?? recommended;
  const toBuy = shopping.items.filter((i) => i.toBuy > 0);
  const fromPantry = shopping.items.filter((i) => i.inPantry > 0);
  const total = mode === 'split' ? shopping.totals.split : shopping.totals[mode];
  const done = toBuy.filter((i) => checked[i.ingredient.id]).length;

  const finish = () => {
    if (window.confirm(`Einkauf für ${formatCHF(total)} abschliessen? Die gekauften Packungen kommen in die Vorräte.`)) {
      completeShopping(mode);
    }
  };

  return (
    <div className="stack">
      {plan.shopping && (
        <div className="alert info">
          Einkauf erledigt am {formatDate(plan.shopping.doneAt)} für {formatCHF(plan.shopping.total)}.
          {toBuy.length > 0 ? ' Unten steht nur, was danach noch dazugekommen ist.' : ' Alles für diese Woche ist da.'}
        </div>
      )}

      {toBuy.length > 0 && (
        <section className="card stack-sm">
          <h2>Ladenvergleich</h2>
          <div className="store-compare">
            {(['coop', 'migros', 'split'] as ShoppingMode[]).map((m) => {
              const value = m === 'split' ? shopping.totals.split : shopping.totals[m];
              return (
                <button
                  key={m}
                  className={`store-option ${m === recommended ? 'best' : ''} ${m === mode ? 'selected' : ''}`}
                  onClick={() => setSelected(m)}
                  aria-pressed={m === mode}
                >
                  <span className="tiny muted">{MODE_LABEL[m]}</span>
                  <span className="value tabular">{formatCHF(value)}</span>
                  {m === recommended && <span className="badge good">Empfehlung</span>}
                </button>
              );
            })}
          </div>
          <p className="tiny muted no-margin">
            {recommended === 'split'
              ? `Aufteilen spart ${formatCHF(shopping.recommendation.saving)} – mehr als deine Schwelle von ${formatCHF(settings.splitThreshold)}.`
              : `Ein Laden reicht: Aufteilen würde nur ${formatCHF(shopping.recommendation.saving)} sparen (Schwelle ${formatCHF(settings.splitThreshold)}).`}
          </p>
        </section>
      )}

      {toBuy.length === 0 ? (
        <Empty title="Nichts einzukaufen">
          <p className="muted">Alles für die noch offenen Mahlzeiten ist in den Vorräten.</p>
        </Empty>
      ) : (
        <>
          <div className="row between">
            <span className="small muted">
              {done} von {toBuy.length} erledigt
            </span>
            <span className="small muted">alle Preise in CHF</span>
          </div>
          {CATEGORIES.map((category) => {
            const items = toBuy.filter((i) => i.ingredient.category === category);
            if (items.length === 0) return null;
            return (
              <section key={category} className="card shop-group">
                <h3>{CATEGORY_LABELS[category]}</h3>
                {items.map((item) => (
                  <ShopRow
                    key={item.ingredient.id}
                    item={item}
                    mode={mode}
                    checked={!!checked[item.ingredient.id]}
                    onToggle={() => toggleChecked(item.ingredient.id)}
                  />
                ))}
              </section>
            );
          })}
          <div className="finish-bar">
            <button className="btn primary block" onClick={finish}>
              Einkauf erledigt · {formatCHF(total)}
            </button>
          </div>
        </>
      )}

      {fromPantry.length > 0 && (
        <section className="card">
          <button className="btn ghost block between" onClick={() => setShowPantry(!showPantry)} aria-expanded={showPantry}>
            <span>Schon in den Vorräten ({fromPantry.length})</span>
            <span>{showPantry ? '▲' : '▼'}</span>
          </button>
          {showPantry && (
            <ul className="plain-list small">
              {fromPantry.map((i) => (
                <li key={i.ingredient.id}>
                  {i.ingredient.name}: {formatQty(i.inPantry, i.ingredient.unit)} aus Vorrat
                  {i.ingredient.staple && <span className="badge">Grundvorrat</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ShopRow({
  item,
  mode,
  checked,
  onToggle,
}: {
  item: ShoppingItem;
  mode: ShoppingMode;
  checked: boolean;
  onToggle: () => void;
}) {
  const picked = choiceFor(item, mode);
  const unit = item.ingredient.unit;
  const rest = picked ? picked.choice.qty - item.toBuy : 0;
  return (
    <div className={`shop-row ${checked ? 'done' : ''}`} onClick={onToggle}>
      <Checkbox checked={checked} onChange={onToggle} label={`${item.ingredient.name} abhaken`} />
      <div className="grow">
        <div className="row between baseline">
          <strong>{item.ingredient.name}</strong>
          <span className="tabular">{picked ? picked.choice.cost.toFixed(2) : '–'}</span>
        </div>
        <div className="small muted">
          {picked
            ? picked.choice.packs.map((p) => `${p.count}× ${p.product.name}`).join(' + ')
            : 'In keinem Laden gefunden'}
        </div>
        <div className="tiny muted">
          brauchst {formatQty(item.toBuy, unit)}
          {item.inPantry > 0 && ` (+ ${formatQty(item.inPantry, unit)} aus Vorrat)`}
          {rest > 0.5 && ` · Rest ${formatQty(rest, unit)} → Vorräte`}
        </div>
        <div className="badges">
          {mode === 'split' && picked && <span className="badge">{picked.store === 'coop' ? 'Coop' : 'Migros'}</span>}
          {picked && mode !== 'split' && picked.store !== mode && (
            <span className="badge warn">nur bei {picked.store === 'coop' ? 'Coop' : 'Migros'}</span>
          )}
          {item.ingredient.staple && <span className="badge">Grundvorrat</span>}
          {picked?.choice.packs.some((p) => p.product.estimated) && <span className="badge warn">Preis geschätzt</span>}
        </div>
      </div>
    </div>
  );
}
