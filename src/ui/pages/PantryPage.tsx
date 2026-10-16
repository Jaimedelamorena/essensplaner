import { useMemo, useState } from 'react';
import { daysBetween, formatDate, todayISO } from '../../core/dates';
import { expiryFor } from '../../core/pantry';
import type { PantryItem } from '../../core/types';
import { CATEGORIES, CATEGORY_LABELS } from '../../core/types';
import { formatQty } from '../../core/units';
import { INGREDIENTS } from '../../data';
import { INGREDIENTS_BY_ID } from '../../state/derive';
import { useStore } from '../../state/store';
import { Icon } from '../Icon';

const UNIT_LABEL = { g: 'g', ml: 'ml', stk: 'Stk' };

export function PantryPage() {
  const pantry = useStore((s) => s.pantry);
  const plan = useStore((s) => s.plan);
  const { recalculate, addStaples } = useStore.getState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const today = todayISO();

  const sorted = useMemo(
    () =>
      [...pantry].sort((a, b) =>
        (INGREDIENTS_BY_ID.get(a.ingredientId)?.name ?? '').localeCompare(INGREDIENTS_BY_ID.get(b.ingredientId)?.name ?? ''),
      ),
    [pantry],
  );
  const soon = sorted.filter((p) => !p.staple && p.expiresAt && daysBetween(today, p.expiresAt) <= 2);
  const regular = sorted.filter((p) => !p.staple && !soon.includes(p));
  const staples = sorted.filter((p) => p.staple);
  const missingStaples = INGREDIENTS.filter((i) => i.staple && !pantry.some((p) => p.ingredientId === i.id && p.qty > 0));

  const recalc = () => {
    setBusy(true);
    setTimeout(() => {
      recalculate();
      setBusy(false);
      setMessage('Plan wurde mit deinen Vorräten neu berechnet.');
    }, 30);
  };

  return (
    <div className="stack">
      {plan && (
        <div className="card row between wrap">
          <span className="small muted">Vorräte geändert? Der Planer nutzt sie, besonders was bald abläuft.</span>
          <button className="btn small primary" disabled={busy} onClick={recalc}>
            <Icon name="refresh" size={18} /> {busy ? 'Rechne …' : 'Plan neu berechnen'}
          </button>
        </div>
      )}
      {message && (
        <div className="alert info row between">
          <span>{message}</span>
          <button className="btn icon ghost" onClick={() => setMessage(null)} aria-label="Hinweis schliessen">
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      <AddForm />

      {soon.length > 0 && (
        <section className="card">
          <h2>Läuft bald ab</h2>
          {soon.map((item) => (
            <PantryRow key={item.id} item={item} />
          ))}
        </section>
      )}

      <section className="card">
        <h2>Vorräte</h2>
        {regular.length === 0 && <p className="muted small">Noch nichts erfasst. Nach «Einkauf erledigt» landen die gekauften Packungen hier.</p>}
        {regular.map((item) => (
          <PantryRow key={item.id} item={item} />
        ))}
      </section>

      <section className="card">
        <h2>Grundvorrat</h2>
        <p className="small muted">
          Öl, Salz, Gewürze, Reis, Pasta … werden nur eingekauft und ins Budget gezählt, wenn sie fehlen.
        </p>
        {staples.map((item) => (
          <PantryRow key={item.id} item={item} />
        ))}
        {missingStaples.length > 0 && <StapleSetup missing={missingStaples.map((i) => i.id)} onAdd={addStaples} />}
      </section>
    </div>
  );
}

function PantryRow({ item }: { item: PantryItem }) {
  const { updatePantryItem, removePantryItem } = useStore.getState();
  const ingredient = INGREDIENTS_BY_ID.get(item.ingredientId);
  if (!ingredient) return null;
  const today = todayISO();
  const days = item.expiresAt ? daysBetween(today, item.expiresAt) : null;
  const expiryClass = days === null ? '' : days < 0 ? 'danger' : days <= 2 ? 'warn' : '';
  return (
    <div className="pantry-row">
      <div className="grow">
        <div className="row between baseline">
          <strong>{ingredient.name}</strong>
          <span className="small muted tabular">{formatQty(item.qty, ingredient.unit)}</span>
        </div>
        <div className="pantry-fields">
          <label className="inline-field">
            <span className="visually-hidden">Menge</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={ingredient.unit === 'stk' ? 0.25 : 10}
              value={Math.round(item.qty * 100) / 100}
              onChange={(e) => updatePantryItem(item.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="unit">{UNIT_LABEL[ingredient.unit]}</span>
          </label>
          <label className="inline-field">
            <span className="visually-hidden">Ablaufdatum</span>
            <input
              type="date"
              value={item.expiresAt ?? ''}
              onChange={(e) => updatePantryItem(item.id, { expiresAt: e.target.value || undefined })}
            />
          </label>
          <button className="btn icon ghost" onClick={() => removePantryItem(item.id)} aria-label={`${ingredient.name} entfernen`}>
            <Icon name="trash" size={20} />
          </button>
        </div>
        {item.expiresAt && (
          <div className={`tiny ${expiryClass ? `text-${expiryClass}` : 'muted'}`}>
            {days! < 0 ? `abgelaufen am ${formatDate(item.expiresAt)}` : days === 0 ? 'läuft heute ab' : `haltbar bis ${formatDate(item.expiresAt)}`}
          </div>
        )}
      </div>
    </div>
  );
}

function AddForm() {
  const addPantryItem = useStore((s) => s.addPantryItem);
  const [ingredientId, setIngredientId] = useState('');
  const [qty, setQty] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const ingredient = INGREDIENTS_BY_ID.get(ingredientId);

  const choose = (id: string) => {
    setIngredientId(id);
    const ing = INGREDIENTS_BY_ID.get(id);
    setExpiresAt(ing ? (expiryFor(ing, todayISO()) ?? '') : '');
  };

  return (
    <form
      className="card stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ingredient || !(Number(qty) > 0)) return;
        addPantryItem(ingredient.id, Number(qty), expiresAt || undefined);
        setIngredientId('');
        setQty('');
        setExpiresAt('');
      }}
    >
      <h2>Vorrat hinzufügen</h2>
      <select value={ingredientId} onChange={(e) => choose(e.target.value)} aria-label="Zutat">
        <option value="">Zutat wählen …</option>
        {CATEGORIES.map((c) => (
          <optgroup key={c} label={CATEGORY_LABELS[c]}>
            {INGREDIENTS.filter((i) => i.category === c).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="row">
        <label className="inline-field grow">
          <span className="visually-hidden">Menge</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Menge"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <span className="unit">{ingredient ? UNIT_LABEL[ingredient.unit] : ''}</span>
        </label>
        <label className="inline-field grow">
          <span className="visually-hidden">Ablaufdatum (optional)</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
      </div>
      <button className="btn primary" type="submit" disabled={!ingredient || !(Number(qty) > 0)}>
        <Icon name="plus" size={18} /> Hinzufügen
      </button>
    </form>
  );
}

function StapleSetup({ missing, onAdd }: { missing: string[]; onAdd: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div className="stack-sm staple-setup">
      <div className="small">
        <strong>Was hast du schon zu Hause?</strong> Antippen und übernehmen – es wird je eine Packung erfasst.
      </div>
      <div className="chips">
        {missing.map((id) => (
          <button
            key={id}
            type="button"
            className={`chip ${selected.includes(id) ? 'on' : ''}`}
            aria-pressed={selected.includes(id)}
            onClick={() => toggle(id)}
          >
            {INGREDIENTS_BY_ID.get(id)?.name}
          </button>
        ))}
      </div>
      <div className="row wrap">
        <button className="btn small" onClick={() => setSelected(missing)}>
          Alle auswählen
        </button>
        <button
          className="btn small primary"
          disabled={selected.length === 0}
          onClick={() => {
            onAdd(selected);
            setSelected([]);
          }}
        >
          {selected.length} übernehmen
        </button>
      </div>
    </div>
  );
}
