import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative Pfade → funktioniert auf GitHub Pages unter /<repo>/ und lokal
  base: './',
  plugins: [react()],
  test: {
    // Der Planer probiert pro Woche einige tausend Varianten; mehrere Wochen pro Test brauchen etwas Zeit.
    testTimeout: 60_000,
  },
});
