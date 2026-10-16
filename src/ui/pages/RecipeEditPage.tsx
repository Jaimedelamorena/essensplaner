import { useState } from 'react';
import { estimateNutrition } from '../../core/nutrition';
import { CATEGORIES, CATEGORY_LABELS, CUISINES, MAX_MINUTES, RECIPE_BASES, type Recipe, type RecipeTag } from '../../core/types';
import { validateRecipe } from '../../core/validate';
import { INGREDIENTS } from '../../data';
import { finalizeRecipe, INGREDIENTS_BY_ID } from '../../state/derive';
import { useStore } from '../../state/store';
import { useRecipes } from '../hooks';
import { Icon } from '../Icon';
import { Link, navigate } from '../router';
import { CUISINE_LABEL } from './RecipesPage';

const BASE_LABEL: Record<Recipe['base'], string> = {
  pasta: 'Pasta',
  reis: 'Reis',
  kartoffeln: 'Kartoffeln',
  nudeln: 'Asia-Nudeln',
  couscous: 'Couscous',
  brot: 'Brot',
  tortilla: 'Tortilla',
  polenta: 'Polenta',
  gnocchi: 'Gnocchi',
  spaetzli: 'Spätzli',
  pizza: 'Pizza/Teig',
  gemuese: 'Gemüse',
};

const OPTIONAL_TAGS: { tag: RecipeTag; label: string }[] = [
  { tag: 'meal-prep', label: 'Meal-Prep (eignet sich als Reste)' },
  { tag: 'mitnehmen', label: 'Zum Mitnehmen' },
  { tag: 'ofen', label: 'Braucht Backofen' },
];

const UNIT_LABEL = { g: 'g', ml: 'ml', stk: 'Stk' };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'rezept';

const emptyRecipe: Recipe = {
  id: '',
  name: '',
  cuisine: 'international',
  base: 'pasta',
  prepMin: 10,
  cookMin: 15,
  ingredients: [{ id: '', qty: 0 }],
  steps: [],
  tags: [],
  kcal: 0,
  protein: 0,
};

export function RecipeEditPage({ id }: { id?: string }) {
  const recipes = useRecipes();
  const saveRecipe = useStore((s) => s.saveRecipe);
  const existing = id ? recipes.find((r) => r.id === id) : undefined;
  const [draft, setDraft] = useState<Recipe>(existing ?? emptyRecipe);
  const [stepsText, setStepsText] = useState((existing?.steps ?? []).join('\n'));
  const [errors, setErrors] = useState<string[]>([]);

  if (id && !existing) {
    return (
      <div className="card">
        Rezept nicht gefunden. <Link to="/rezepte">Zurück</Link>
      </div>
    );
  }

  const update = (partial: Partial<Recipe>) => setDraft((d) => ({ ...d, ...partial }));
  const setIngredient = (index: number, partial: Partial<Recipe['ingredients'][number]>) =>
    update({ ingredients: draft.ingredients.map((i, k) => (k === index ? { ...i, ...partial } : i)) });
  const validIngredients = draft.ingredients.filter((i) => i.id && i.qty > 0);
  const nutrition = validIngredients.length ? estimateNutrition(validIngredients, INGREDIENTS_BY_ID) : null;
  const total = draft.prepMin + draft.cookMin;

  const submit = () => {
    const newId = existing?.id ?? uniqueId(slugify(draft.name), new Set(recipes.map((r) => r.id)));
    const candidate = finalizeRecipe({
      ...draft,
      id: newId,
      name: draft.name.trim(),
      ingredients: validIngredients,
      steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean),
    });
    const problems = validateRecipe(candidate, INGREDIENTS_BY_ID);
    if (problems.length) {
      setErrors(problems.map((p) => p.replace(/^Rezept «[^»]*»: /, '')));
      return;
    }
    const saved = saveRecipe(candidate);
    navigate(`/rezepte/${saved.id}`);
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Link to={existing ? `/rezepte/${existing.id}` : '/rezepte'} className="back-link">
        <Icon name="back" size={18} /> Abbrechen
      </Link>
      <section className="card stack-sm">
        <h1>{existing ? 'Rezept bearbeiten' : 'Neues Rezept'}</h1>
        <label className="field">
          <span>Name</span>
          <input required value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Küche</span>
            <select value={draft.cuisine} onChange={(e) => update({ cuisine: e.target.value as Recipe['cuisine'] })}>
              {CUISINES.map((c) => (
                <option key={c} value={c}>
                  {CUISINE_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Beilage / Basis</span>
            <select value={draft.base} onChange={(e) => update({ base: e.target.value as Recipe['base'] })}>
              {RECIPE_BASES.map((b) => (
                <option key={b} value={b}>
                  {BASE_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vorbereitung (Min)</span>
            <input type="number" min={0} max={MAX_MINUTES} value={draft.prepMin} onChange={(e) => update({ prepMin: Math.round(Number(e.target.value) || 0) })} />
          </label>
          <label className="field">
            <span>Kochen (Min)</span>
            <input type="number" min={0} max={MAX_MINUTES} value={draft.cookMin} onChange={(e) => update({ cookMin: Math.round(Number(e.target.value) || 0) })} />
          </label>
        </div>
        <div className={`small ${total > MAX_MINUTES ? 'text-danger' : 'muted'}`}>
          Gesamt {total} Min {total > MAX_MINUTES && `– höchstens ${MAX_MINUTES} Min erlaubt`}
        </div>
      </section>

      <section className="card stack-sm">
        <h2>Zutaten (Menge pro Person)</h2>
        {draft.ingredients.map((item, index) => {
          const ingredient = INGREDIENTS_BY_ID.get(item.id);
          return (
            <div key={index} className="ingredient-edit">
              <select value={item.id} onChange={(e) => setIngredient(index, { id: e.target.value })} aria-label="Zutat">
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
              <label className="inline-field">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={item.qty || ''}
                  placeholder="0"
                  onChange={(e) => setIngredient(index, { qty: Number(e.target.value) || 0 })}
                  aria-label="Menge pro Person"
                />
                <span className="unit">{ingredient ? UNIT_LABEL[ingredient.unit] : ''}</span>
              </label>
              <button
                type="button"
                className="btn icon ghost"
                aria-label="Zutat entfernen"
                onClick={() => update({ ingredients: draft.ingredients.filter((_, k) => k !== index) })}
              >
                <Icon name="trash" size={20} />
              </button>
            </div>
          );
        })}
        <button type="button" className="btn small" onClick={() => update({ ingredients: [...draft.ingredients, { id: '', qty: 0 }] })}>
          <Icon name="plus" size={18} /> Zutat
        </button>
        <p className="tiny muted no-margin">
          Fehlt eine Zutat? Sie muss im Zutatenkatalog stehen (siehe README, «Rezepte hinzufügen»).
          {nutrition && ` Geschätzt: ${nutrition.kcal} kcal, ${nutrition.protein} g Protein pro Portion.`}
        </p>
      </section>

      <section className="card stack-sm">
        <h2>Zubereitung</h2>
        <label className="field">
          <span>Ein Schritt pro Zeile</span>
          <textarea rows={7} value={stepsText} onChange={(e) => setStepsText(e.target.value)} />
        </label>
      </section>

      <section className="card stack-sm">
        <h2>Eigenschaften</h2>
        {OPTIONAL_TAGS.map(({ tag, label }) => (
          <label key={tag} className="toggle-row">
            <input
              type="checkbox"
              checked={draft.tags.includes(tag)}
              onChange={(e) => update({ tags: e.target.checked ? [...draft.tags, tag] : draft.tags.filter((t) => t !== tag) })}
            />
            <span>{label}</span>
          </label>
        ))}
        <p className="tiny muted no-margin">«vegetarisch» und «vegan» werden automatisch aus den Zutaten bestimmt.</p>
      </section>

      {errors.length > 0 && (
        <div className="alert danger" role="alert">
          <strong>Bitte korrigieren:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <button className="btn primary block" type="submit">
        Speichern
      </button>
    </form>
  );
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = `eigen-${base}`;
  for (let n = 2; taken.has(id); n++) id = `eigen-${base}-${n}`;
  return id;
}
