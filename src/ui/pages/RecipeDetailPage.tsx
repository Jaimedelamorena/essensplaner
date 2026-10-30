import { useState } from 'react';
import { effectiveIngredients, isMeatMeal, nutritionFor, pastaIngredientOf, pastaSwap, pastaTypes } from '../../core/recipes';
import type { Persons } from '../../core/types';
import { formatIngredientQty } from '../../core/units';
import { INGREDIENTS } from '../../data';
import { BUILTIN_RECIPE_IDS, INGREDIENTS_BY_ID } from '../../state/derive';
import { useStore } from '../../state/store';
import { Empty, Segmented } from '../components';
import { useRecipesById } from '../hooks';
import { Icon } from '../Icon';
import { Link, navigate } from '../router';
import { CUISINE_LABEL } from './RecipesPage';

const TAG_LABEL: Record<string, string> = {
  vegetarisch: 'vegetarisch',
  vegan: 'vegan',
  'meal-prep': 'Meal-Prep-geeignet',
  mitnehmen: 'zum Mitnehmen',
  ofen: 'Ofen',
};

export function RecipeDetailPage({ id }: { id: string }) {
  const recipe = useRecipesById().get(id);
  const settingsPersons = useStore((s) => s.plan?.persons ?? s.settings.persons);
  const favorites = useStore((s) => s.favorites);
  const blocked = useStore((s) => s.blocked);
  const userRecipes = useStore((s) => s.userRecipes);
  const { toggleFavorite, toggleBlocked, deleteUserRecipe } = useStore.getState();
  const [persons, setPersons] = useState<Persons>(settingsPersons);
  const preferredPasta = useStore((s) => s.settings.preferredPasta);
  const [pasta, setPasta] = useState(preferredPasta);

  if (!recipe) {
    return (
      <Empty title="Rezept nicht gefunden">
        <Link to="/rezepte">Zurück zu den Rezepten</Link>
      </Empty>
    );
  }

  const isFavorite = favorites.includes(recipe.id);
  const isBlocked = blocked.includes(recipe.id);
  const isBuiltin = BUILTIN_RECIPE_IDS.has(recipe.id);
  const isEdited = isBuiltin && userRecipes.some((r) => r.id === recipe.id);
  const originalPasta = pastaIngredientOf(recipe, INGREDIENTS_BY_ID);
  const swaps = originalPasta ? pastaSwap(recipe, pasta || undefined, INGREDIENTS_BY_ID) : undefined;
  const items = effectiveIngredients(recipe, swaps, INGREDIENTS_BY_ID);
  const nutrition = nutritionFor(recipe, swaps, INGREDIENTS_BY_ID);
  const meat = isMeatMeal(items, INGREDIENTS_BY_ID);

  return (
    <div className="stack">
      <Link to="/rezepte" className="back-link">
        <Icon name="back" size={18} /> Rezepte
      </Link>
      <section className="card stack-sm">
        <h1>{recipe.name}</h1>
        <div className="small muted">
          {CUISINE_LABEL[recipe.cuisine]} · <Icon name="clock" size={14} /> {recipe.prepMin} Min Vorbereitung + {recipe.cookMin}{' '}
          Min Kochen = <strong>{recipe.prepMin + recipe.cookMin} Min</strong>
        </div>
        <div className="small">
          {nutrition.kcal} kcal · {nutrition.protein} g Protein <span className="muted">pro Portion (geschätzt)</span>
        </div>
        <div className="badges">
          {meat && <span className="badge">Fleisch</span>}
          {recipe.tags.map((t) => (
            <span key={t} className="badge">
              {TAG_LABEL[t] ?? t}
            </span>
          ))}
          {isEdited && <span className="badge good">bearbeitet</span>}
          {!isBuiltin && <span className="badge good">eigenes Rezept</span>}
        </div>
        <div className="row wrap">
          <button className={`btn small ${isFavorite ? 'primary' : ''}`} onClick={() => toggleFavorite(recipe.id)} aria-pressed={isFavorite}>
            <Icon name="heart" size={18} filled={isFavorite} /> {isFavorite ? 'Gefällt mir' : 'Gefällt mir?'}
          </button>
          <button className={`btn small ${isBlocked ? 'danger' : ''}`} onClick={() => toggleBlocked(recipe.id)} aria-pressed={isBlocked}>
            <Icon name="ban" size={18} /> {isBlocked ? 'Nie wieder (aktiv)' : 'Nie wieder'}
          </button>
          <Link to={`/rezepte/${recipe.id}/bearbeiten`} className="btn small">
            <Icon name="edit" size={18} /> Bearbeiten
          </Link>
          {(isEdited || !isBuiltin) && (
            <button
              className="btn small"
              onClick={() => {
                const question = isBuiltin ? 'Änderungen verwerfen und Originalrezept wiederherstellen?' : 'Eigenes Rezept löschen?';
                if (window.confirm(question)) {
                  deleteUserRecipe(recipe.id);
                  if (!isBuiltin) navigate('/rezepte');
                }
              }}
            >
              <Icon name="trash" size={18} /> {isBuiltin ? 'Original' : 'Löschen'}
            </button>
          )}
        </div>
        {isFavorite && (
          <p className="tiny muted no-margin">♥ Kommt regelmässig in deinen Wochenplan – was länger nicht dran war, zuerst.</p>
        )}
      </section>

      <section className="card stack-sm">
        <div className="row between wrap">
          <h2 className="no-margin">Zutaten</h2>
          <Segmented<Persons>
            label="Portionen"
            value={persons}
            onChange={setPersons}
            options={[
              { value: 1, label: '1 Person' },
              { value: 2, label: '2 Personen' },
            ]}
          />
        </div>
        {originalPasta && (
          <label className="pasta-pick">
            <span className="small muted">Pasta-Sorte:</span>
            <select value={pasta || originalPasta} onChange={(e) => setPasta(e.target.value === originalPasta ? '' : e.target.value)}>
              {pastaTypes(INGREDIENTS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === originalPasta ? ' (Rezept)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="ingredient-list">
          {items.map(({ id: ingredientId, qty }) => {
            const ingredient = INGREDIENTS_BY_ID.get(ingredientId);
            if (!ingredient) return null;
            return (
              <li key={ingredientId}>
                <span className="qty tabular">{formatIngredientQty(qty * persons, ingredient)}</span>
                <span>
                  {ingredient.name}
                  {ingredient.staple && <span className="tiny muted"> · Grundvorrat</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Zubereitung</h2>
        <ol className="steps">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
