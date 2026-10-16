// Zentrales Datenmodell. Die Listen (as const) sind die einzige Quelle für
// erlaubte Werte – Typen und Validierung leiten sich daraus ab.

export const MAX_MINUTES = 30;

export const UNITS = ['g', 'ml', 'stk'] as const;
/** Basiseinheit einer Zutat. Rezeptmengen und Packungsgrössen verwenden immer diese Einheit. */
export type Unit = (typeof UNITS)[number];

export const CATEGORIES = [
  'gemuese-obst',
  'kuehlregal',
  'fleisch-fisch',
  'tiefkuehl',
  'trockenwaren',
  'konserven',
  'brot',
  'gewuerze-oel',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  'gemuese-obst': 'Gemüse & Obst',
  kuehlregal: 'Kühlregal',
  'fleisch-fisch': 'Fleisch & Fisch',
  tiefkuehl: 'Tiefkühl',
  trockenwaren: 'Trockenwaren',
  konserven: 'Konserven & Gläser',
  brot: 'Brot & Tortillas',
  'gewuerze-oel': 'Gewürze, Öl & Saucen',
};

export const DIETS = ['vegan', 'vegetarisch', 'fleisch', 'fisch'] as const;
export type Diet = (typeof DIETS)[number];

/** Haushaltsmass für die Anzeige, z. B. 1 EL = 10 ml oder 1 Zehe = 5 g. */
export interface Measure {
  label: string;
  amount: number;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: Unit;
  category: Category;
  diet: Diet;
  /** Grundvorrat (Öl, Salz, Reis, Pasta …): wird nur eingekauft, wenn er in den Vorräten fehlt. */
  staple: boolean;
  /** Haltbarkeit ab Einkauf in Tagen (ungeöffnet bzw. frisch). */
  shelfLifeDays: number;
  /** Haltbarkeit nach Anbruch in Tagen; fehlt der Wert, gilt shelfLifeDays. */
  openedShelfLifeDays?: number;
  measure?: Measure;
  /** Nährwerte pro 100 g bzw. 100 ml – bei Einheit 'stk' pro Stück. */
  nutrition: { kcal: number; protein: number };
}

export const RECIPE_TAGS = ['vegetarisch', 'vegan', 'meal-prep', 'mitnehmen', 'ofen'] as const;
export type RecipeTag = (typeof RECIPE_TAGS)[number];

export const CUISINES = [
  'italienisch',
  'schweizerisch',
  'asiatisch',
  'mexikanisch',
  'orientalisch',
  'international',
] as const;
export type Cuisine = (typeof CUISINES)[number];

/** Sättigungsbeilage – der Planer vermeidet dieselbe Basis an zwei Mahlzeiten hintereinander. */
export const RECIPE_BASES = [
  'pasta',
  'reis',
  'kartoffeln',
  'nudeln',
  'couscous',
  'brot',
  'tortilla',
  'polenta',
  'gnocchi',
  'spaetzli',
  'pizza',
  'gemuese',
] as const;
export type RecipeBase = (typeof RECIPE_BASES)[number];

export interface RecipeIngredient {
  id: string;
  /** Menge pro Person in der Basiseinheit der Zutat. */
  qty: number;
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: Cuisine;
  base: RecipeBase;
  prepMin: number;
  cookMin: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: RecipeTag[];
  /** Pro Portion, aus den Zutaten geschätzt (npm run data:nutrition). */
  kcal: number;
  protein: number;
}

// ---------- Preise (src/data/prices.json) ----------

export const STORES = ['coop', 'migros'] as const;
export type Store = (typeof STORES)[number];

export interface Product {
  id: string;
  ingredientId: string;
  store: Store;
  /** Produktname im Laden, z. B. "Prix Garantie Spaghetti". */
  name: string;
  /** Packungsgrösse in der Basiseinheit der Zutat. */
  packSize: number;
  /** Preis in CHF. */
  price: number;
  /** CHF pro kg, pro l oder pro Stück. */
  pricePerUnit: number;
  /** Abrufdatum (ISO, YYYY-MM-DD). */
  fetchedAt: string;
  url: string;
  /** true, wenn der Preis nicht abrufbar war und geschätzt wurde. */
  estimated: boolean;
}

// ---------- App-Zustand (localStorage, zugleich Export/Import-Format) ----------

/** 0 = Montag … 6 = Sonntag */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type MealType = 'mittag' | 'abend';
export type Persons = 1 | 2;

export interface Settings {
  /** Wochenbudget in CHF. */
  budget: number;
  persons: Persons;
  /** Einkaufstag – die Planwoche beginnt an diesem Tag. */
  shoppingDay: Weekday;
  /** Aufteilen auf Coop und Migros erst ab dieser Ersparnis (CHF). */
  splitThreshold: number;
  /** Anzahl Abendessen pro Woche, die doppelt gekocht werden → Mittagessen am nächsten Tag (0 = aus). */
  leftoverLunches: number;
  /** Mittagessen müssen zum Mitnehmen geeignet sein. */
  lunchToGo: boolean;
  /** Zutaten-IDs, die nie vorkommen dürfen. */
  noGo: string[];
}

export interface Slot {
  /** 0–6, Tage ab Einkaufstag. */
  day: number;
  meal: MealType;
  recipeId: string;
  /** Index des Abendessens im Plan, dessen zweite Portion hier gegessen wird. */
  leftoverOf?: number;
  /** Dieses Abendessen wird doppelt gekocht (Reste für den nächsten Mittag). */
  double?: boolean;
  /** Von Hand gewählt – bleibt beim Neuberechnen erhalten. */
  locked?: boolean;
  cooked: boolean;
}

export interface WeekPlan {
  /** Datum des Einkaufstags (ISO). */
  weekStart: string;
  persons: Persons;
  slots: Slot[];
  /** Gesetzt nach «Einkauf erledigt»: was bezahlt wurde. */
  shopping?: { doneAt: string; total: number };
}

export interface PantryItem {
  id: string;
  ingredientId: string;
  /** Menge in der Basiseinheit der Zutat. */
  qty: number;
  /** Ablaufdatum (ISO), optional. */
  expiresAt?: string;
  staple: boolean;
}

export interface PriceOverride {
  price: number;
  packSize: number;
  updatedAt: string;
}

export interface AppState {
  version: number;
  settings: Settings;
  plan?: WeekPlan;
  /** Rezepte der letzten Wochen – für «nicht zwei Wochen hintereinander». */
  history: { weekStart: string; recipeIds: string[] }[];
  pantry: PantryItem[];
  /** Eigene Rezepte; gleiche ID wie ein eingebautes Rezept = bearbeitete Version. */
  userRecipes: Recipe[];
  favorites: string[];
  /** «Nie wieder» markierte Rezepte. */
  blocked: string[];
  /** Manuell angepasste Preise, Schlüssel = Product.id. */
  priceOverrides: Record<string, PriceOverride>;
  /** Abgehakte Posten der Einkaufsliste. */
  checked: Record<string, boolean>;
}
