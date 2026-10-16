import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { nextShoppingDay, todayISO } from '../core/dates';
import { addToPantry, newId } from '../core/pantry';
import { cookSlot, planRecipeIds, purchaseToPantry, uncookSlot } from '../core/plan';
import { generatePlan, keptSlots, swapSlot } from '../core/planner/generate';
import { totalFor, type ShoppingMode } from '../core/shopping';
import type { AppState, PantryItem, Persons, Recipe, Settings } from '../core/types';
import { PRODUCTS } from '../data';
import { finalizeRecipe, INGREDIENTS_BY_ID, mergedRecipes, planShopping, plannerInput } from './derive';

export const STATE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  budget: 70,
  persons: 1,
  shoppingDay: 0,
  splitThreshold: 5,
  leftoverLunches: 2,
  lunchToGo: false,
  noGo: [],
};

const initialState: AppState = {
  version: STATE_VERSION,
  settings: DEFAULT_SETTINGS,
  plan: undefined,
  history: [],
  pantry: [],
  userRecipes: [],
  favorites: [],
  blocked: [],
  priceOverrides: {},
  checked: {},
};

export type Notice =
  | { kind: 'budget'; minTotal: number; persons: Persons }
  | { kind: 'info'; text: string };

interface Actions {
  notice: Notice | null;
  dismissNotice(): void;
  generateWeek(): void;
  recalculate(): void;
  swap(index: number, recipeId: string): void;
  toggleCooked(index: number): void;
  setPersons(persons: Persons): void;
  completeShopping(mode: ShoppingMode): void;
  updateSettings(partial: Partial<Settings>): void;
  addPantryItem(ingredientId: string, qty: number, expiresAt?: string): void;
  updatePantryItem(id: string, partial: Partial<PantryItem>): void;
  removePantryItem(id: string): void;
  addStaples(ingredientIds: string[]): void;
  toggleFavorite(recipeId: string): void;
  toggleBlocked(recipeId: string): void;
  saveRecipe(recipe: Recipe): Recipe;
  deleteUserRecipe(recipeId: string): void;
  setPriceOverride(productId: string, price: number, packSize: number): void;
  clearPriceOverride(productId: string): void;
  toggleChecked(key: string): void;
  importData(json: string): string | null;
  resetAll(): void;
}

export type Store = AppState & Actions;

/** localStorage kann fehlen oder Fehler werfen (privater Modus) – dann läuft die App ohne Speicherung. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* Speicher voll oder gesperrt */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignorieren */
    }
  },
};

const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export const persistedState = (s: AppState): AppState => ({
  version: STATE_VERSION,
  settings: s.settings,
  plan: s.plan,
  history: s.history,
  pantry: s.pantry,
  userRecipes: s.userRecipes,
  favorites: s.favorites,
  blocked: s.blocked,
  priceOverrides: s.priceOverrides,
  checked: s.checked,
});

function isAppState(value: unknown): value is AppState {
  const v = value as AppState;
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.settings?.budget === 'number' &&
    Array.isArray(v.pantry) &&
    Array.isArray(v.userRecipes) &&
    Array.isArray(v.favorites) &&
    Array.isArray(v.blocked)
  );
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState,
      notice: null,

      dismissNotice: () => set({ notice: null }),

      generateWeek: () => {
        const state = get();
        const weekStart = nextShoppingDay(todayISO(), state.settings.shoppingDay);
        const old = state.plan;
        const sameWeek = old?.weekStart === weekStart;
        const history =
          old && !sameWeek
            ? [{ weekStart: old.weekStart, recipeIds: planRecipeIds(old) }, ...state.history].slice(0, 8)
            : state.history;
        const input = {
          ...plannerInput(state, weekStart, history[0]?.recipeIds ?? []),
          alreadySpent: sameWeek ? (old?.shopping?.total ?? 0) : 0,
        };
        const result = generatePlan(input, sameWeek && old ? keptSlots(old, false) : []);
        if (result.overBudget) {
          set({ notice: { kind: 'budget', minTotal: Math.ceil(result.total), persons: state.settings.persons } });
          return;
        }
        set({
          plan: { ...result.plan, shopping: sameWeek ? old?.shopping : undefined },
          history,
          checked: sameWeek ? state.checked : {},
          notice: null,
        });
      },

      recalculate: () => {
        const state = get();
        const plan = state.plan;
        if (!plan) return get().generateWeek();
        const input = {
          ...plannerInput(state, plan.weekStart, state.history[0]?.recipeIds ?? []),
          settings: { ...state.settings, persons: plan.persons },
          alreadySpent: plan.shopping?.total ?? 0,
        };
        const result = generatePlan(input, keptSlots(plan, true));
        if (result.overBudget) {
          set({ notice: { kind: 'budget', minTotal: Math.ceil(result.total), persons: plan.persons } });
          return;
        }
        set({ plan: { ...result.plan, shopping: plan.shopping }, notice: null });
      },

      swap: (index, recipeId) => {
        const { plan, userRecipes } = get();
        const recipe = mergedRecipes(userRecipes).find((r) => r.id === recipeId);
        if (!plan || !recipe) return;
        set({ plan: swapSlot(plan, index, recipe) });
      },

      toggleCooked: (index) => {
        const { plan, pantry, userRecipes } = get();
        if (!plan) return;
        const slot = plan.slots[index];
        const recipesById = new Map(mergedRecipes(userRecipes).map((r) => [r.id, r]));
        const nextPantry = slot.cooked
          ? uncookSlot(pantry, slot, plan.persons, recipesById, INGREDIENTS_BY_ID)
          : cookSlot(pantry, slot, plan.persons, recipesById);
        const slots = plan.slots.map((s, i) => (i === index ? { ...s, cooked: !s.cooked } : s));
        set({ plan: { ...plan, slots }, pantry: nextPantry });
      },

      setPersons: (persons) => {
        const { plan, settings } = get();
        set({ settings: { ...settings, persons }, plan: plan ? { ...plan, persons } : plan });
      },

      completeShopping: (mode) => {
        const state = get();
        const shopping = planShopping(state);
        if (!state.plan || !shopping) return;
        const today = todayISO();
        const paid = totalFor(shopping, mode);
        set({
          pantry: purchaseToPantry(state.pantry, shopping, mode, today),
          plan: {
            ...state.plan,
            shopping: { doneAt: today, total: Math.round(((state.plan.shopping?.total ?? 0) + paid) * 100) / 100 },
          },
          checked: {},
        });
      },

      updateSettings: (partial) => {
        const { settings, plan } = get();
        const next = { ...settings, ...partial };
        set({ settings: next, plan: plan && partial.persons ? { ...plan, persons: partial.persons } : plan });
      },

      addPantryItem: (ingredientId, qty, expiresAt) => {
        const ingredient = INGREDIENTS_BY_ID.get(ingredientId);
        if (!ingredient || !(qty > 0)) return;
        set({ pantry: addToPantry(get().pantry, ingredient, qty, expiresAt || undefined) });
      },

      updatePantryItem: (id, partial) =>
        set({ pantry: get().pantry.map((p) => (p.id === id ? { ...p, ...partial } : p)) }),

      removePantryItem: (id) => set({ pantry: get().pantry.filter((p) => p.id !== id) }),

      addStaples: (ids) => {
        const pantry = [...get().pantry];
        for (const id of ids) {
          if (pantry.some((p) => p.ingredientId === id && p.qty > 0)) continue;
          const pack = Math.max(...PRODUCTS.filter((p) => p.ingredientId === id).map((p) => p.packSize), 0);
          pantry.push({ id: newId(), ingredientId: id, qty: pack || 1, staple: true });
        }
        set({ pantry });
      },

      toggleFavorite: (id) => set({ favorites: toggleIn(get().favorites, id) }),
      toggleBlocked: (id) => set({ blocked: toggleIn(get().blocked, id) }),

      saveRecipe: (recipe) => {
        const final = finalizeRecipe(recipe);
        const userRecipes = get().userRecipes.filter((r) => r.id !== final.id);
        set({ userRecipes: [...userRecipes, final] });
        return final;
      },

      deleteUserRecipe: (id) => set({ userRecipes: get().userRecipes.filter((r) => r.id !== id) }),

      setPriceOverride: (productId, price, packSize) =>
        set({ priceOverrides: { ...get().priceOverrides, [productId]: { price, packSize, updatedAt: todayISO() } } }),

      clearPriceOverride: (productId) => {
        const next = { ...get().priceOverrides };
        delete next[productId];
        set({ priceOverrides: next });
      },

      toggleChecked: (key) => {
        const checked = { ...get().checked };
        if (checked[key]) delete checked[key];
        else checked[key] = true;
        set({ checked });
      },

      importData: (json) => {
        try {
          const parsed = JSON.parse(json);
          const data = parsed?.data ?? parsed;
          if (!isAppState(data)) return 'Die Datei sieht nicht wie ein Essensplaner-Backup aus.';
          set({ ...initialState, ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings }, version: STATE_VERSION, notice: null });
          return null;
        } catch {
          return 'Die Datei konnte nicht gelesen werden (kein gültiges JSON).';
        }
      },

      resetAll: () => set({ ...initialState, notice: null }),
    }),
    {
      name: 'essensplaner',
      version: STATE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => persistedState(s),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
      },
    },
  ),
);

/** JSON-Export aller gespeicherten Daten. */
export function exportJSON(): string {
  return JSON.stringify(
    { app: 'essensplaner', exportedAt: new Date().toISOString(), data: persistedState(useStore.getState()) },
    null,
    2,
  );
}
