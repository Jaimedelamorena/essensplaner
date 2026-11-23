import { useMemo, useState } from 'react';
import { addDays, formatDate, todayISO, WEEKDAYS, weekdayOf } from '../../core/dates';
import { cooksFresh } from '../../core/plan';
import { alternativesForSlot } from '../../core/planner/generate';
import { effectiveIngredients, isMeatMeal, nutritionFor, pastaIngredientOf, pastaTypes } from '../../core/recipes';
import type { Persons, Recipe, Slot, WeekPlan } from '../../core/types';
import { formatCHF } from '../../core/units';
import { INGREDIENTS } from '../../data';
import { INGREDIENTS_BY_ID, plannerInput } from '../../state/derive';
import { useStore } from '../../state/store';
import { Checkbox, Empty, formatDelta, Segmented, Sheet } from '../components';
import { usePlanData, useRecipesById } from '../hooks';
import { Icon } from '../Icon';
import { Link } from '../router';

const STORE_LABEL = { coop: 'Coop', migros: 'Migros', split: 'Coop + Migros' };
const PASTA_TYPES = pastaTypes(INGREDIENTS);

/** kcal, Protein und «Fleisch?» eines Slots – mit der gewählten Pasta-Sorte. */
function slotInfo(slot: Slot, recipe: Recipe) {
  return {
    ...nutritionFor(recipe, slot.swaps, INGREDIENTS_BY_ID),
    meat: isMeatMeal(effectiveIngredients(recipe, slot.swaps, INGREDIENTS_BY_ID), INGREDIENTS_BY_ID),
  };
}

/** Wochenzahlen: Fleisch-Mahlzeiten, Ø Protein/kcal pro Mahlzeit, Lieblingsrezepte. */
function planStats(plan: WeekPlan, recipesById: Map<string, Recipe>, favorites: string[]) {
  let meat = 0;
  let kcal = 0;
  let protein = 0;
  let count = 0;
  let favs = 0;
  let skipped = 0;
  plan.slots.forEach((slot, index) => {
    if (slot.skipped) {
      skipped++;
      return;
    }
    const recipe = recipesById.get(slot.recipeId);
    if (!recipe) return;
    const info = slotInfo(slot, recipe);
    if (info.meat) meat++;
    kcal += info.kcal;
    protein += info.protein;
    count++;
    if (cooksFresh(plan.slots, index) && favorites.includes(recipe.id)) favs++;
  });
  return {
    meat,
    kcal: Math.round(kcal / Math.max(1, count)),
    protein: Math.round(protein / Math.max(1, count)),
    favorites: favs,
    skipped,
  };
}

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
  const favorites = useStore((s) => s.favorites);
  const { generateWeek, recalculate, setPersons, updateSettings, dismissNotice } = useStore.getState();
  const { shopping, cost } = usePlanData();
  const recipesById = useRecipesById();
  const { busy, run } = useBusy();
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const hasStaples = pantry.some((p) => p.staple && p.qty > 0);
  const stats = useMemo(() => (plan ? planStats(plan, recipesById, favorites) : null), [plan, recipesById, favorites]);

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
                {stats && (
                  <div className="badges">
                    <span className={`badge ${stats.meat >= settings.minMeatMeals ? 'good' : 'warn'}`}>
                      Fleisch {stats.meat}×{settings.minMeatMeals > 0 ? ` (Ziel ≥ ${settings.minMeatMeals})` : ''}
                    </span>
                    <span className="badge">
                      Ø {stats.protein} g Protein · {stats.kcal} kcal pro Mahlzeit
                    </span>
                    {favorites.length > 0 && <span className="badge good">♥ {stats.favorites}× Lieblingsrezept</span>}
                    {stats.skipped > 0 && (
                      <span className="badge">
                        {stats.skipped} Mahlzeit{stats.skipped === 1 ? ' fällt' : 'en fallen'} aus
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {stats && stats.meat < settings.minMeatMeals && !cost?.overBudget && (
              <div className="alert info small">
                Diese Woche nur {stats.meat} Fleisch-Mahlzeit{stats.meat === 1 ? '' : 'en'} statt {settings.minMeatMeals}: mehr
                liegt im Budget nicht drin.{' '}
                {!hasStaples ? (
                  <>
                    Erfasse deinen <Link to="/vorraete">Grundvorrat</Link>, dann bleibt mehr Geld fürs Fleisch.
                  </>
                ) : (
                  <>Mit etwas mehr Budget klappt es.</>
                )}
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
              «Neu berechnen» behält gekochte, ausgefallene und von Hand getauschte Mahlzeiten und berücksichtigt deine
              aktuellen Vorräte. Isst du einmal nicht zu Hause, tippe bei der Mahlzeit auf «Fällt aus».
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
              allSlots={plan.slots}
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
  allSlots,
  recipesById,
  onSwap,
}: {
  day: number;
  date: string;
  allSlots: Slot[];
  recipesById: Map<string, Recipe>;
  onSwap: (index: number) => void;
}) {
  const setSkipped = useStore((s) => s.setSkipped);
  const isToday = date === todayISO();
  const indices = [day * 2, day * 2 + 1];
  const slots = indices.map((i) => allSlots[i]);
  const total = slots.reduce(
    (sum, slot) => {
      const recipe = recipesById.get(slot.recipeId);
      if (!recipe || slot.skipped) return sum;
      const info = slotInfo(slot, recipe);
      return { kcal: sum.kcal + info.kcal, protein: sum.protein + info.protein };
    },
    { kcal: 0, protein: 0 },
  );
  // Nur noch offene (nicht gekochte) Mahlzeiten können ausfallen.
  const open = indices.filter((i) => !allSlots[i].cooked);
  const allSkipped = slots.every((s) => s.skipped);
  return (
    <section className={`card day ${isToday ? 'today' : ''}`}>
      <div className="row between baseline wrap">
        <h3>
          {WEEKDAYS[weekdayOf(date)]} <span className="muted">{formatDate(date)}</span>
          {isToday && <span className="badge good">heute</span>}
        </h3>
        <span className="tiny muted tabular">
          {allSkipped ? 'nicht zu Hause' : `${Math.round(total.kcal)} kcal · ${Math.round(total.protein)} g Protein`}
        </span>
      </div>
      {slots.map((slot, k) => (
        <MealRow
          key={k}
          index={indices[k]}
          slot={slot}
          allSlots={allSlots}
          recipe={recipesById.get(slot.recipeId)}
          onSwap={onSwap}
        />
      ))}
      {open.length === 2 && (
        <button
          className="skip-day"
          onClick={() => setSkipped(open, !allSkipped)}
          aria-label={allSkipped ? `${WEEKDAYS[weekdayOf(date)]} wieder einplanen` : `Ganzer ${WEEKDAYS[weekdayOf(date)]} fällt aus`}
        >
          {allSkipped ? 'Ganzen Tag wieder einplanen' : 'Ganzer Tag fällt aus'}
        </button>
      )}
    </section>
  );
}

function MealRow({
  index,
  slot,
  allSlots,
  recipe,
  onSwap,
}: {
  index: number;
  slot: Slot;
  allSlots: Slot[];
  recipe?: Recipe;
  onSwap: (index: number) => void;
}) {
  const favorites = useStore((s) => s.favorites);
  const toggleCooked = useStore((s) => s.toggleCooked);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const setPasta = useStore((s) => s.setPasta);
  const setSkipped = useStore((s) => s.setSkipped);
  if (!recipe) return null;
  const mealLabel = slot.meal === 'mittag' ? 'Mittag' : 'Abend';

  if (slot.skipped) {
    return (
      <div className="meal skipped">
        <span className="check skip-mark" aria-hidden="true">
          <Icon name="ban" size={18} />
        </span>
        <div className="grow">
          <div className="tiny muted">{mealLabel} · fällt aus</div>
          <span className="meal-title">{recipe.name}</span>
          <div className="small muted">Wird nicht eingekauft, deine Vorräte bleiben, wie sie sind.</div>
          <div className="badges">
            <button className="badge-btn" onClick={() => setSkipped([index], false)}>
              <Icon name="refresh" size={14} /> Wieder einplanen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fällt das doppelte Abendessen aus, wird der Reste-Mittag frisch gekocht.
  const leftover = slot.leftoverOf !== undefined && !cooksFresh(allSlots, index);
  const freshInsteadOfLeftover = slot.leftoverOf !== undefined && !leftover;
  const next = allSlots[index + 1];
  const cooksDouble = !!slot.double && !(next?.leftoverOf === index && next.skipped);
  const info = slotInfo(slot, recipe);
  const liked = favorites.includes(recipe.id);
  const originalPasta = pastaIngredientOf(recipe, INGREDIENTS_BY_ID);
  const currentPasta = originalPasta ? (slot.swaps?.[originalPasta] ?? originalPasta) : null;
  return (
    <div className={`meal ${slot.cooked ? 'done' : ''}`}>
      <Checkbox checked={slot.cooked} onChange={() => toggleCooked(index)} label={`${recipe.name} als gekocht markieren`} />
      <div className="grow">
        <div className="tiny muted">{mealLabel}</div>
        <Link to={`/rezepte/${recipe.id}`} className="meal-title">
          {recipe.name}
        </Link>
        <div className="small muted">
          {leftover
            ? 'Reste vom Vorabend – nur aufwärmen'
            : `${freshInsteadOfLeftover ? 'Frisch kochen, das Abendessen davor fällt aus · ' : ''}${recipe.prepMin + recipe.cookMin} Min · ${info.kcal} kcal · ${info.protein} g Protein`}
        </div>
        {currentPasta && !leftover && (
          <label className="pasta-pick">
            <span className="tiny muted">Pasta:</span>
            <select
              value={currentPasta}
              onChange={(e) => setPasta(index, e.target.value)}
              aria-label={`Pasta-Sorte für ${recipe.name}`}
            >
              {PASTA_TYPES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === originalPasta ? ' (Rezept)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="badges">
          {cooksDouble && <span className="badge info">doppelt kochen → Mittag morgen</span>}
          {leftover && <span className="badge info">Reste</span>}
          {info.meat && <span className="badge">Fleisch</span>}
          {recipe.tags.includes('vegetarisch') && <span className="badge">vegi</span>}
          {slot.locked && <span className="badge">fixiert</span>}
          {!slot.cooked && (
            <button
              className="badge-btn"
              onClick={() => setSkipped([index], true)}
              aria-label={`${mealLabel}: ${recipe.name} fällt aus`}
            >
              <Icon name="ban" size={14} /> Fällt aus
            </button>
          )}
        </div>
      </div>
      <div className="meal-actions">
        <button
          className={`btn icon ghost like ${liked ? 'on' : ''}`}
          onClick={() => toggleFavorite(recipe.id)}
          aria-pressed={liked}
          aria-label={liked ? `${recipe.name}: gefällt mir nicht mehr` : `${recipe.name}: gefällt mir`}
          title={liked ? 'Gefällt mir – kommt regelmässig' : 'Gefällt mir'}
        >
          <Icon name="heart" filled={liked} />
        </button>
        <button className="btn icon ghost" onClick={() => onSwap(index)} aria-label={`${recipe.name} austauschen`}>
          <Icon name="swap" />
        </button>
      </div>
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
                    {recipe.prepMin + recipe.cookMin} Min · {recipe.kcal} kcal · {recipe.protein} g Protein · Woche{' '}
                    {formatCHF(total)}
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
