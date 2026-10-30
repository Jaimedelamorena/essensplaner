import { useRef, useState } from 'react';
import { WEEKDAYS } from '../../core/dates';
import { pastaTypes } from '../../core/recipes';
import { CATEGORIES, CATEGORY_LABELS, type NutritionGoal, type Persons, type Weekday } from '../../core/types';
import { INGREDIENTS } from '../../data';
import { INGREDIENTS_BY_ID } from '../../state/derive';
import { exportJSON, useStore } from '../../state/store';
import { Segmented } from '../components';
import { Icon } from '../Icon';

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const { updateSettings, importData, resetAll } = useStore.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [noGoPick, setNoGoPick] = useState('');

  const download = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `essensplaner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: 'Backup heruntergeladen.' });
  };

  const upload = async (file: File) => {
    const error = importData(await file.text());
    setMessage(error ? { ok: false, text: error } : { ok: true, text: 'Backup importiert.' });
  };

  return (
    <div className="stack">
      <section className="card stack-sm">
        <h2>Planung</h2>
        <label className="field">
          <span>Wochenbudget (CHF)</span>
          <input
            type="number"
            inputMode="decimal"
            min={10}
            step={5}
            value={settings.budget}
            onChange={(e) => updateSettings({ budget: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <div className="field">
          <span>Personen</span>
          <Segmented<Persons>
            label="Personen"
            value={settings.persons}
            onChange={(persons) => updateSettings({ persons })}
            options={[
              { value: 1, label: '1 Person' },
              { value: 2, label: '2 Personen' },
            ]}
          />
        </div>
        <label className="field">
          <span>Einkaufstag (die Woche beginnt an diesem Tag)</span>
          <select value={settings.shoppingDay} onChange={(e) => updateSettings({ shoppingDay: Number(e.target.value) as Weekday })}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reste-Mittagessen pro Woche: {settings.leftoverLunches === 0 ? 'aus' : settings.leftoverLunches}</span>
          <input
            type="range"
            min={0}
            max={6}
            value={settings.leftoverLunches}
            onChange={(e) => updateSettings({ leftoverLunches: Number(e.target.value) })}
          />
          <span className="tiny muted">So viele Abendessen werden doppelt gekocht und am nächsten Tag zu Mittag gegessen.</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={settings.lunchToGo} onChange={(e) => updateSettings({ lunchToGo: e.target.checked })} />
          <span>Mittagessen zum Mitnehmen (nur passende Rezepte am Mittag)</span>
        </label>
      </section>

      <section className="card stack-sm">
        <h2>Ernährung & Vorlieben</h2>
        <div className="field">
          <span>Ernährungsziel</span>
          <Segmented<NutritionGoal>
            label="Ernährungsziel"
            value={settings.nutritionGoal}
            onChange={(nutritionGoal) => updateSettings({ nutritionGoal })}
            options={[
              { value: 'protein', label: 'Viel Protein, wenig kcal' },
              { value: 'ausgewogen', label: 'Ausgewogen' },
            ]}
          />
        </div>
        <label className="field">
          <span>
            Fleisch-Mahlzeiten pro Woche: mindestens {settings.minMeatMeals === 0 ? '– (egal)' : settings.minMeatMeals}
          </span>
          <input
            type="range"
            min={0}
            max={7}
            value={settings.minMeatMeals}
            onChange={(e) => updateSettings({ minMeatMeals: Number(e.target.value) })}
          />
          <span className="tiny muted">Reste-Mittagessen zählen mit. Frisches Fleisch landet am Anfang der Woche.</span>
        </label>
        <label className="field">
          <span>
            Lieblingsrezepte pro Woche: mindestens {settings.minFavorites === 0 ? '– (egal)' : settings.minFavorites}
          </span>
          <input
            type="range"
            min={0}
            max={5}
            value={settings.minFavorites}
            onChange={(e) => updateSettings({ minFavorites: Number(e.target.value) })}
          />
          <span className="tiny muted">
            Markiere Rezepte mit ♥ «Gefällt mir». Sie kommen regelmässig in den Plan – was länger nicht dran war, zuerst.
          </span>
        </label>
        <label className="field">
          <span>Pasta-Sorte für alle Pasta-Gerichte</span>
          <select value={settings.preferredPasta} onChange={(e) => updateSettings({ preferredPasta: e.target.value })}>
            <option value="">Wie im Rezept</option>
            {pastaTypes(INGREDIENTS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="tiny muted">Einzelne Gerichte kannst du im Wochenplan auf eine andere Sorte umstellen.</span>
        </label>
      </section>

      <section className="card stack-sm">
        <h2>Einkauf</h2>
        <label className="field">
          <span>Auf Coop und Migros aufteilen erst ab einer Ersparnis von (CHF)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={settings.splitThreshold}
            onChange={(e) => updateSettings({ splitThreshold: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
      </section>

      <section className="card stack-sm">
        <h2>No-Go-Zutaten</h2>
        <p className="small muted no-margin">Rezepte mit diesen Zutaten werden nie geplant.</p>
        <div className="chips">
          {settings.noGo.map((id) => (
            <button
              key={id}
              className="chip on"
              onClick={() => updateSettings({ noGo: settings.noGo.filter((x) => x !== id) })}
              aria-label={`${INGREDIENTS_BY_ID.get(id)?.name} entfernen`}
            >
              {INGREDIENTS_BY_ID.get(id)?.name} ✕
            </button>
          ))}
          {settings.noGo.length === 0 && <span className="small muted">Keine</span>}
        </div>
        <div className="row">
          <select value={noGoPick} onChange={(e) => setNoGoPick(e.target.value)} aria-label="Zutat als No-Go wählen">
            <option value="">Zutat wählen …</option>
            {CATEGORIES.map((c) => (
              <optgroup key={c} label={CATEGORY_LABELS[c]}>
                {INGREDIENTS.filter((i) => i.category === c && !settings.noGo.includes(i.id)).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            className="btn"
            disabled={!noGoPick}
            onClick={() => {
              updateSettings({ noGo: [...settings.noGo, noGoPick] });
              setNoGoPick('');
            }}
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
      </section>

      <section className="card stack-sm">
        <h2>Daten</h2>
        <p className="small muted no-margin">
          Alles wird nur in diesem Browser gespeichert. Mit dem Backup überträgst du Plan, Vorräte, eigene Rezepte und Preise
          zwischen Laptop und Handy.
        </p>
        <div className="row wrap">
          <button className="btn" onClick={download}>
            <Icon name="download" size={18} /> Backup exportieren
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={18} /> Backup importieren
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </div>
        {message && <div className={`alert ${message.ok ? 'info' : 'danger'}`}>{message.text}</div>}
        <button
          className="btn danger"
          onClick={() => {
            if (window.confirm('Wirklich alles löschen? Plan, Vorräte, eigene Rezepte und angepasste Preise gehen verloren.')) {
              resetAll();
              setMessage({ ok: true, text: 'Alles zurückgesetzt.' });
            }
          }}
        >
          <Icon name="trash" size={18} /> Alles zurücksetzen
        </button>
      </section>
    </div>
  );
}
