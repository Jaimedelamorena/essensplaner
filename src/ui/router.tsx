// Minimaler Hash-Router: funktioniert auf GitHub Pages ohne Server-Konfiguration.
import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};

const currentPath = () => decodeURI(window.location.hash.replace(/^#/, '')) || '/';

export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

export function navigate(to: string): void {
  window.location.hash = to;
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

export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}
