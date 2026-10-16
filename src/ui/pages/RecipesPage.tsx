import { useMemo, useState } from 'react';
import type { Recipe } from '../../core/types';
import { BUILTIN_RECIPE_IDS } from '../../state/derive';
import { useStore } from '../../state/store';
import { useRecipes } from '../hooks';
import { Icon } from '../Icon';
import { Link } from '../router';

export const CUISINE_LABEL: Record<Recipe['cuisine'], string> = {
  italienisch: 'Italienisch',
  schweizerisch: 'Schweizerisch',
  asiatisch: 'Asiatisch',
  mexikanisch: 'Mexikanisch',
  orientalisch: 'Orientalisch',
  international: 'International',
};

type Filter = 'alle' | 'favoriten' | 'vegetarisch' | 'meal-prep' | 'mitnehmen' | 'ofen' | 'eigene' | 'nie';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'favoriten', label: '★ Favoriten' },
  { id: 'vegetarisch', label: 'Vegetarisch' },
  { id: 'meal-prep', label: 'Meal-Prep' },
  { id: 'mitnehmen', label: 'Zum Mitnehmen' },
  { id: 'ofen', label: 'Ofen' },
  { id: 'eigene', label: 'Eigene' },
  { id: 'nie', label: 'Nie wieder' },
];

export function RecipesPage() {
  const recipes = useRecipes();
  const favorites = useStore((s) => s.favorites);
  const blocked = useStore((s) => s.blocked);
  const userRecipes = useStore((s) => s.userRecipes);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const own = new Set(userRecipes.map((r) => r.id));
    return recipes
      .filter((r) => {
        if (q && !r.name.toLowerCase().includes(q)) return false;
        switch (filter) {
          case 'favoriten':
            return favorites.includes(r.id);
          case 'nie':
            return blocked.includes(r.id);
          case 'eigene':
            return own.has(r.id);
          case 'alle':
            return true;
          default:
            return r.tags.includes(filter);
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, query, filter, favorites, blocked, userRecipes]);

  return (
    <div className="stack">
      <div className="row">
        <input
          type="search"
          placeholder={`${recipes.length} Rezepte durchsuchen …`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rezepte durchsuchen"
        />
        <Link to="/rezepte/neu" className="btn primary" aria-label="Eigenes Rezept hinzufügen">
          <Icon name="plus" />
        </Link>
      </div>
      <div className="chips scroll-x">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
            {f.label}
          </button>
        ))}
      </div>
      <ul className="card recipe-list">
        {visible.map((r) => (
          <li key={r.id}>
            <Link to={`/rezepte/${r.id}`} className="recipe-item">
              <span className="grow">
                <span className="recipe-name">
                  {favorites.includes(r.id) && <span className="star">★ </span>}
                  {r.name}
                </span>
                <span className="tiny muted">
                  {CUISINE_LABEL[r.cuisine]} · {r.prepMin + r.cookMin} Min · {r.kcal} kcal · {r.protein} g Protein
                </span>
              </span>
              <span className="badges">
                {r.tags.includes('vegetarisch') && <span className="badge">vegi</span>}
                {!BUILTIN_RECIPE_IDS.has(r.id) && <span className="badge good">eigenes</span>}
                {blocked.includes(r.id) && <span className="badge danger">nie wieder</span>}
              </span>
            </Link>
          </li>
        ))}
        {visible.length === 0 && <li className="muted small">Keine Rezepte gefunden.</li>}
      </ul>
    </div>
  );
}
