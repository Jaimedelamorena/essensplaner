# Essensplaner

Wochen-Essensplaner mit Einkaufsliste für Coop & Migros (St. Gallen): 14 Mahlzeiten pro Woche
(Mittag + Abend), alle in höchstens 30 Minuten, unter einem festen Budget. Läuft komplett im
Browser – ohne Backend, ohne Login, ohne KI-API.

## Funktionen

- **Wochenplan** Mo–So (ab Einkaufstag), «Neue Woche generieren», einzelne Mahlzeiten tauschen
  (mit Kostenänderung), Reste-Mittagessen (Abendessen doppelt kochen), 1 / 2 Personen.
- **Rezepte**: 50 Rezepte, Mengen für 1 oder 2 Personen, eigene Rezepte anlegen/bearbeiten,
  Favoriten und «nie wieder».
- **Einkaufsliste**: aus dem Plan, Vorräte abgezogen, nach Kategorien, mit echten Packungsgrössen,
  Ladenvergleich Coop / Migros / Kombination, zum Abhaken, «Einkauf erledigt» → Vorräte.
- **Vorräte** mit Ablaufdatum, Grundvorrat separat, «gekocht» zieht Zutaten ab, Plan neu berechnen.
- **Preisliste**: Coop und Migros nebeneinander, günstigere Option markiert, Preise editierbar,
  Alter der Preise sichtbar.
- **Backup**: Export/Import als JSON (Einstellungen → Daten), z. B. zwischen Laptop und Handy.

## Starten

Voraussetzung: [Node.js LTS](https://nodejs.org) (getestet mit v24).

```bash
npm install
npm run dev        # App unter http://localhost:5173
npm test           # Tests (Budget, 30 Minuten, Skalierung, Vorräte …)
npm run validate   # Zutaten, Rezepte und Preise prüfen
npm run build      # Produktions-Build nach dist/
```

Am Handy im selben WLAN: `npm run dev -- --host` und die angezeigte Netzwerk-Adresse öffnen.

## Veröffentlichen (GitHub Pages, kostenlos)

1. Repository auf GitHub anlegen und den Code pushen (Branch `main`).
2. Auf GitHub: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. Jeder Push auf `main` testet und baut die App und veröffentlicht sie
   (`.github/workflows/deploy.yml`) unter `https://<benutzername>.github.io/<repo>/`.

Mit der GitHub-CLI geht das in einem Rutsch:

```bash
gh auth login
gh repo create essensplaner --public --source=. --push
gh api -X POST repos/{owner}/essensplaner/pages -f build_type=workflow
```

Hinweis: GitHub Pages ist für öffentliche Repositories gratis (für private nur mit GitHub Pro –
für Studierende im GitHub Student Developer Pack enthalten). Alternativ funktioniert auch Vercel
(Framework «Vite», Output `dist`).

## Preise aktualisieren

Die Preise in `src/data/prices.json` wurden am 16.10.2026 auf coop.ch und migros.ch
(Region Ostschweiz, 9000 St. Gallen) erfasst – günstige Eigenmarken (Prix Garantie, M-Budget)
bevorzugt, Aktionspreise nicht berücksichtigt. Ein Preis war nicht auffindbar und ist als
`"estimated": true` markiert.

**Warum kein automatisches Skript?** Beide `robots.txt` sperren die Suche für Crawler, und die
rechtlichen Hinweise von Migros untersagen Webcrawler für öffentliche oder kommerzielle Zwecke ohne
Zustimmung. Deshalb werden Preise von Hand gepflegt:

- **In der App** (für dich): Preisliste → Produkt antippen → Preis/Packungsgrösse ändern.
  Gilt sofort und wird mit dem Backup exportiert.
- **In der Datei** (für alle): In `src/data/prices.json` `price`, `packSize` und `fetchedAt`
  anpassen, dann
  ```bash
  npm run prices:normalize   # rechnet CHF/kg neu, sortiert, prüft
  npm run validate
  ```
  Jede Zutat braucht mindestens ein Produkt bei Coop und eines bei Migros. `packSize` ist immer
  in der Einheit der Zutat (g, ml oder Stück) – bei Dosen das Abtropfgewicht. Offen verkaufte Ware
  (z. B. Ingwer pro kg) wird als typische Kaufmenge erfasst.

## Rezepte hinzufügen

**In der App:** Rezepte → «+». Mengen pro Person, höchstens 30 Minuten, kcal/Protein und
vegetarisch/vegan werden automatisch berechnet.

**Fest in die Datenbank** (für alle):

1. In `src/data/recipes.json` ein Objekt ergänzen:
   - `id`: eindeutig, klein mit Bindestrichen (`mein-rezept`)
   - `prepMin` + `cookMin` zusammen höchstens 30
   - `ingredients`: Menge **pro Person** in der Einheit der Zutat (siehe `src/data/ingredients.json`)
   - `tags`: `vegetarisch`, `vegan`, `meal-prep` (eignet sich als Reste-Mittagessen), `mitnehmen`,
     `ofen`. `vegetarisch`/`vegan` müssen zu den Zutaten passen.
   - `base` (Sättigungsbeilage) und `cuisine` – für die Abwechslung
   - `kcal`/`protein` auf `0` setzen.
2. Fehlt eine Zutat: in `src/data/ingredients.json` ergänzen (Einheit, Kategorie, Haltbarkeit
   frisch/angebrochen, Nährwerte pro 100 g/ml bzw. pro Stück, `staple: true` für Grundvorrat) und in
   `src/data/prices.json` je ein Produkt bei Coop und Migros eintragen.
3. `npm run data:nutrition` füllt kcal und Protein aus.
4. `npm run validate` und `npm test` müssen ohne Fehler durchlaufen.

## So plant der Planer

Alles läuft lokal im Browser (`src/core/planner/`):

1. **Filtern** – nur Rezepte ≤ 30 Min., ohne No-Go-Zutaten und ohne «nie wieder»; Rezepte der
   Vorwoche fallen raus, solange genug andere übrig bleiben.
2. **Aufbauen** – Mahlzeit für Mahlzeit (chronologisch) wird jedes passende Rezept bewertet:
   - − Einkaufskosten der ganzen Woche mit echten Packungen (Rest einer angebrochenen Packung kostet nichts)
   - \+ Vorräte, besonders solche, die bald ablaufen
   - − Verschwendung (übrig bleibende verderbliche Ware)
   - − frische Zutaten, die am Kochtag schon abgelaufen wären (Fleisch also früh in der Woche)
   - − gleiche Beilage oder Küche zweimal hintereinander, + Favoriten
   - \+ etwas Zufall, damit jede Woche anders aussieht

   Gewählt wird eines der drei besten Rezepte.
3. **Budget** – ist der Plan zu teuer, werden Mahlzeiten mit der grössten Ersparnis getauscht oder
   teure Zutaten (z. B. ein Gewürzglas, das nur für ein Rezept gebraucht würde) ganz gestrichen.
   Reicht das nicht, folgt ein neuer Durchgang, in dem Kosten stärker zählen.
4. **Verbessern** – einige hundert zufällige Tauschversuche, die die Bewertung verbessern, ohne das
   Budget zu überschreiten.

Ein Plan über dem Budget wird nie übernommen – stattdessen erscheint der Mindestbetrag mit der
Möglichkeit, das Budget anzupassen.

## Projektstruktur

```
src/
  core/          Logik ohne UI – getestet
    types.ts       Datenmodell
    pricing.ts     Packungswahl, Preise
    shopping.ts    Einkaufsliste, Ladenvergleich
    pantry.ts      Vorräte
    plan.ts        Bedarf, Kochen, Einkauf → Vorräte
    planner/       Filter, Bewertung, Planerstellung
  data/          ingredients.json · recipes.json · prices.json
  state/         Zustand (localStorage), Ableitungen
  ui/            React-Oberfläche (Seiten, Komponenten)
scripts/         Datenpflege (validate, nutrition, prices:normalize)
tests/           Vitest
```
