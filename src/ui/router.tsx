// Minimaler Router: die aktuelle Seite lebt im Speicher und wird – wo möglich – im Hash gespiegelt
// (#/einkauf). So funktioniert er auf GitHub Pages (mit Zurück-Taste) und auch eingebettet,
// wo die Adresszeile Änderungen nicht übernimmt.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

const fromHash = () => {
  try {
    const hash = decodeURI(window.location.hash.replace(/^#/, ''));
    return hash.startsWith('/') ? hash : '/';
  } catch {
    return '/';
  }
};

let current = typeof window === 'undefined' ? '/' : fromHash();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = fromHash();
    if (next !== current) {
      current = next;
      emit();
    }
  });
}

const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => current, () => '/');
}

export function navigate(to: string): void {
  if (to === current) return;
  current = to;
  try {
    window.location.hash = to;
  } catch {
    /* Hash nicht verfügbar – die Seite wechselt trotzdem */
  }
  emit();
}

/** «/rezepte/:id» gegen «/rezepte/chili» → { id: 'chili' } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0].split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = a[i];
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: ReactNode;
}

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={`#${to}`} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
