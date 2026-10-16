import { useMemo, useState } from 'react';
import { addDays, formatDate, todayISO, WEEKDAYS, weekdayOf } from '../../core/dates';
import { alternativesForSlot } from '../../core/planner/generate';
import type { Persons, Recipe, Slot } from '../../core/types';
import { formatCHF } from '../../core/units';
import { plannerInput } from '../../state/derive';
import { useStore } from '../../state/store';
import { Checkbox, Empty, formatDelta, Segmented, Sheet } from '../components';
import { usePlanData, useRecipesById } from '../hooks';
import { Icon } from '../Icon';
import { Link } from '../router';

const STORE_LABEL = { coop: 'Coop', migros: 'Migros', split: 'Coop + Migros' };

/** Kurz warten, damit der Lade-Hinweis sichtbar wird, bevor der Planer rechnet. */
function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = (key: string, fn: () => void) => {
    setBusy(key);
    setTimeout(() => {
      try {
        fn();
      } finally {
        setBusy(null);
      }
    }, 30);
  };
  return { busy, run };
}

export function PlanPage() {
  const plan = useStore((s) => s.plan);
  const settings = useStore((s) => s.settings);
  const notice = useStore((s) => s.notice);
  const pantry = useStore((s) => s.pantry);
  const { generateWeek, recalculate, setPersons, updateSettings, dismissNotice } = useStore.getState();
  const { shopping, cost } = usePlanData();
  const recipesById = useRecipesById();
  const { busy, run } = useBusy();
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const hasStaples = pantry.some((p) => p.staple && p.qty > 0);

  const generateButton = (
    <button className="btn primary" disabled={!!busy} onClick={() => run('generate', generateWeek)}>
      <Icon name="refresh" /> {busy === 'generate' ? 'Plane …' : 'Neue Woche generieren'}
    </button>
  );

  return (
    <div className="stack">
      {notice?.kind === 'budget' && (
        <div className="alert danger stack-sm" role="alert">
          <strong>
            {notice.persons === 2 ? 'Das Budget reicht für 2 Personen nicht.' : 'Das Budget reicht nicht.'}
          </strong>
          <div>
            Mit {formatCHF(settings.budget)} liess sich kein Plan erstellen. Der günstigste gefundene Plan kostet{' '}
            <strong>{formatCHF(notice.minTotal)}</strong>.
          </div>
          <div className="row wrap">
            <button
              className="btn small primary"
              onClick={() => {
                updateSettings({ budget: notice.minTotal });
                run('generate', generateWeek);
              }}
            >
              Budget auf {notice.minTotal} CHF erhöhen
            </button>
            <button className="btn small" onClick={dismissNotice}>
              Schliessen
            </button>
          </div>
        </div>
      )}

      {!plan ? (
        <Empty title="Noch kein Wochenplan">
          <p className="muted">
            Der Planer stellt 14 Mahlzeiten (Mittag und Abend) zusammen, die zu deinem Budget von{' '}
            {formatCHF(settings.budget)} passen, und erstellt die Einkaufsliste für Coop und Migros.
          </p>
          {!hasStaples && (
            <p className="muted small">
              Tipp: Erfasse zuerst deinen <Link to="/vorraete">Grundvorrat</Link> (Öl, Gewürze, Reis …). Dann wird er nicht
              eingekauft.
            </p>
          )}
          {generateButton}
        </Empty>
      ) : (
        <>
          <section className="card stack">
            <div className="row between wrap">
              <div>
                <div className="tiny muted">Woche ab</div>
                <h2 className="no-margin">
                  {WEEKDAYS[weekdayOf(plan.weekStart)]}, {formatDate(plan.weekStart)}
                </h2>
              </div>
              <Segmented<Persons>
                label="Personen"
                value={plan.persons}
                onChange={setPersons}
                options={[
                  { value: 1, label: '1 Person' },
                  { value: 2, label: '2 Personen' },
                ]}
              />
            </div>

            {cost && shopping && (
              <div className="stack-sm">
                <div className="row between baseline">
                  <div>
                    <span className="big tabular">{formatCHF(cost.total)}</span>
                    <span className="muted small"> von {formatCHF(settings.budget)}</span>
                  </div>
                  <span className="small muted">
                    {plan.shopping ? 'inkl. bezahltem Einkauf' : `Empfehlung: ${STORE_LABEL[shopping.recommendation.mode]}`}
                  </span>
                </div>
                <div className={`progress ${cost.overBudget ? 'over' : ''}`} aria-hidden="true">
                  <div style={{ width: `${Math.min(100, (cost.total / settings.budget) * 100)}%` }} />
                </div>
                <div className="stat-grid">
                  <div className="stat">
                    <div className="label">pro Tag</div>
                    <div className="value tabular">{formatCHF(cost.perDay)}</div>
                  </div>
                  <div className="stat">
                    <div className="label">pro Portion</div>
                    <div className="value tabular">{formatCHF(cost.perPortion)}</div>
                  </div>
                  <div className="stat">
                    <div className="label">{plan.shopping ? 'noch zu kaufen' : 'Budget übrig'}</div>
                    <div className="value tabular">
                      {formatCHF(plan.shopping ? cost.remaining : Math.max(0, settings.budget - cost.total))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {cost?.overBudget && (
              <div className="alert danger stack-sm" role="alert">
                <strong>
                  {plan.persons === 2
                    ? `Das Budget reicht für 2 Personen nicht: dieser Plan kostet ${formatCHF(cost.total)}.`
                    : `Dieser Plan kostet ${formatCHF(cost.total)} und liegt über dem Budget.`}
                </strong>
                <div className="row wrap">
                  <button className="btn small primary" disabled={!!busy} onClick={() => run('recalc', recalculate)}>
                    Günstiger planen
                  </button>
                  <button className="btn small" onClick={() => updateSettings({ budget: Math.ceil(cost.total) })}>
                    Budget auf {Math.ceil(cost.total)} CHF erhöhen
                  </button>
                </div>
              </div>
            )}

            <div className="row wrap">
              {generateButton}
              <button className="btn" disabled={!!busy} onClick={() => run('recalc', recalculate)}>
                {busy === 'recalc' ? 'Rechne …' : 'Neu berechnen'}
              </button>
            </div>
            <p className="tiny muted no-margin">
              «Neu berechnen» behält gekochte und von Hand getauschte Mahlzeiten und berücksichtigt deine aktuellen Vorräte.
            </p>
          </section>

          {!hasStaples && (
            <div className="alert info">
              Tipp: Erfasse deinen <Link to="/vorraete">Grundvorrat</Link> (Öl, Gewürze, Reis, Pasta …). Dann wird er nicht
              jede Woche eingekauft und das Budget reicht weiter.
            </div>
          )}

          {Array.from({ length: 7 }, (_, day) => (
            <DayCard
              key={day}
              day={day}
              date={addDays(plan.weekStart, day)}
              slots={[plan.slots[day * 2], plan.slots[day * 2 + 1]]}
              recipesById={recipesById}
              onSwap={setSwapIndex}
            />
          ))}
        </>
      )}

      {plan && swapIndex !== null && <SwapSheet index={swapIndex} onClose={() => setSwapIndex(null)} />}
    </div>
  );
}

function DayCard({
  day,
  date,
  slots,
  recipesById,
  onSwap,
}: {
  day: number;
  date: string;
  slots: Slot[];
  recipesById: Map<string, Recipe>;
  onSwap: (index: number) => void;
}) {
  const isToday = date === todayISO();
  return (
    <section className={`card day ${isToday ? 'today' : ''}`}>
      <h3>
        {WEEKDAYS[weekdayOf(date)]} <span className="muted">{formatDate(date)}</span>
        {isToday && <span className="badge good">heute</span>}
      </h3>
      {slots.map((slot, k) => (
        <MealRow key={k} index={day * 2 + k} slot={slot} recipe={recipesById.get(slot.recipeId)} onSwap={onSwap} />
      ))}
    </section>
  );
}

function MealRow({
  index,
  slot,
  recipe,
  onSwap,
}: {
  index: number;
  slot: Slot;
  recipe?: Recipe;
  onSwap: (index: number) => void;
}) {
  const favorites = useStore((s) => s.favorites);
  const toggleCooked = useStore((s) => s.toggleCooked);
  if (!recipe) return null;
  const leftover = slot.leftoverOf !== undefined;
  return (
    <div className={`meal ${slot.cooked ? 'done' : ''}`}>
      <Checkbox checked={slot.cooked} onChange={() => toggleCooked(index)} label={`${recipe.name} als gekocht markieren`} />
      <div className="grow">
        <div className="tiny muted">{slot.meal === 'mittag' ? 'Mittag' : 'Abend'}</div>
        <Link to={`/rezepte/${recipe.id}`} className="meal-title">
          {recipe.name}
        </Link>
        <div className="small muted">
          {leftover
            ? 'Reste vom Vorabend – nur aufwärmen'
            : `${recipe.prepMin + recipe.cookMin} Min · ${recipe.kcal} kcal · ${recipe.protein} g Protein`}
        </div>
        <div className="badges">
          {slot.double && <span className="badge info">doppelt kochen → Mittag morgen</span>}
          {leftover && <span className="badge info">Reste</span>}
          {favorites.includes(recipe.id) && <span className="badge good">★ Favorit</span>}
          {recipe.tags.includes('vegetarisch') && <span className="badge">vegi</span>}
          {slot.locked && <span className="badge">fixiert</span>}
        </div>
      </div>
      <button className="btn icon ghost" onClick={() => onSwap(index)} aria-label={`${recipe.name} austauschen`}>
        <Icon name="swap" />
      </button>
    </div>
  );
}

function SwapSheet({ index, onClose }: { index: number; onClose: () => void }) {
  const swap = useStore((s) => s.swap);
  const [query, setQuery] = useState('');
  const alternatives = useMemo(() => {
    const state = useStore.getState();
    const plan = state.plan!;
    return alternativesForSlot(plan, index, plannerInput(state, plan.weekStart, state.history[0]?.recipeIds ?? []));
  }, [index]);
  const slot = useStore.getState().plan!.slots[index];
  const filtered = alternatives.filter((a) => a.recipe.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Sheet title={`${slot.meal === 'mittag' ? 'Mittagessen' : 'Abendessen'} austauschen`} onClose={onClose}>
      <div className="stack-sm">
        {slot.double && (
          <p className="small muted no-margin">
            Dieses Abendessen wird doppelt gekocht – es werden nur Meal-Prep-Rezepte angezeigt.
          </p>
        )}
        {slot.leftoverOf !== undefined && (
          <p className="small muted no-margin">
            Statt Resten kochst du hier frisch; das Abendessen davor wird dann einfach gekocht.
          </p>
        )}
        <input
          type="search"
          placeholder="Rezept suchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rezept suchen"
        />
        <ul className="option-list">
          {filtered.map(({ recipe, total, delta, withinBudget }) => (
            <li key={recipe.id}>
              <button
                className="option"
                disabled={!withinBudget}
                onClick={() => {
                  swap(index, recipe.id);
                  onClose();
                }}
              >
                <span className="grow">
                  <span className="option-title">{recipe.name}</span>
                  <span className="tiny muted">
                    {recipe.prepMin + recipe.cookMin} Min · {recipe.kcal} kcal · Woche {formatCHF(total)}
                  </span>
                </span>
                <span className={`delta tabular ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
                  {withinBudget ? formatDelta(delta) : 'über Budget'}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="muted small">Keine passenden Rezepte.</li>}
        </ul>
      </div>
    </Sheet>
  );
}
