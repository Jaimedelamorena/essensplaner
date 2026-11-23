import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline-Fähigkeit für die installierte Handy-App. Nur im Build und nur, wo erlaubt
// (eingebettet, z. B. als Artifact, gibt es keinen Service Worker – dann läuft die App einfach ohne).
if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker?.register('./sw.js').catch(() => {});
    } catch {
      /* nicht verfügbar */
    }
  });
}
