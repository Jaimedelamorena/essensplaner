import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';
import { PantryPage } from './pages/PantryPage';
import { PlanPage } from './pages/PlanPage';
import { PricesPage } from './pages/PricesPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { RecipeEditPage } from './pages/RecipeEditPage';
import { RecipesPage } from './pages/RecipesPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShoppingPage } from './pages/ShoppingPage';
import { Link, matchPath, usePath } from './router';

const NAV = [
  { to: '/', label: 'Plan', icon: 'calendar' },
  { to: '/einkauf', label: 'Einkauf', icon: 'cart' },
  { to: '/vorraete', label: 'Vorräte', icon: 'box' },
  { to: '/rezepte', label: 'Rezepte', icon: 'book' },
  { to: '/preise', label: 'Preise', icon: 'tag' },
];

function route(path: string): { title: string; section: string; element: ReactNode } {
  let m: Record<string, string> | null;
  if ((m = matchPath('/rezepte/neu', path))) return { title: 'Neues Rezept', section: '/rezepte', element: <RecipeEditPage /> };
  if ((m = matchPath('/rezepte/:id/bearbeiten', path)))
    return { title: 'Rezept bearbeiten', section: '/rezepte', element: <RecipeEditPage key={m.id} id={m.id} /> };
  if ((m = matchPath('/rezepte/:id', path)))
    return { title: 'Rezept', section: '/rezepte', element: <RecipeDetailPage key={m.id} id={m.id} /> };
  switch (path) {
    case '/einkauf':
      return { title: 'Einkaufsliste', section: path, element: <ShoppingPage /> };
    case '/vorraete':
      return { title: 'Vorräte', section: path, element: <PantryPage /> };
    case '/rezepte':
      return { title: 'Rezepte', section: path, element: <RecipesPage /> };
    case '/preise':
      return { title: 'Preisliste', section: path, element: <PricesPage /> };
    case '/einstellungen':
      return { title: 'Einstellungen', section: path, element: <SettingsPage /> };
    default:
      return { title: 'Wochenplan', section: '/', element: <PlanPage /> };
  }
}

export function App() {
  const path = usePath();
  const { title, section, element } = route(path);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${title} · Essensplaner`;
  }, [path, title]);

  return (
    <>
      <header className="topbar">
        <h1>{title}</h1>
        <Link to="/einstellungen" className={`btn icon ghost ${section === '/einstellungen' ? 'active' : ''}`} aria-label="Einstellungen">
          <Icon name="settings" />
        </Link>
      </header>
      <main className="app">{element}</main>
      <nav className="bottomnav" aria-label="Hauptnavigation">
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} className={section === item.to ? 'active' : ''} aria-current={section === item.to ? 'page' : undefined}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
