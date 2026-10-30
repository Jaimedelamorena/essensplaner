import { useRef, useState } from 'react';
import { WEEKDAYS } from '../../core/dates';
import { pastaTypes } from '../../core/recipes';
import { CATEGORIES, CATEGORY_LABELS, type NutritionGoal, type Persons, type Weekday } from '../../core/types';
import { INGREDIENTS } from '../../data';
import { INGREDIENTS_BY_ID } from '../../state/derive';
import { exportJSON, useStore } from '../../state/store';
import { ConfirmBox, Segmented } from '../components';
import { Icon } from '../Icon';

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const { updateSettings, importData, resetAll } = useStore.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [noGoPick, setNoGoPick] = useState('');
  const [exported, setExported] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const exportArea = useRef<HTMLTextAreaElement>(null);

  // Kopieren klappt überall; ein Datei-Download ist in manchen Umgebungen (z. B. eingebettet) gesperrt.
  const copyBackup = async () => {
    const text = exported ?? exportJSON();
    setExported(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ ok: true, text: 'Backup kopiert. Auf dem anderen Gerät unter «Backup einfügen» einfügen.' });
    } catch {
      exportArea.current?.select();
      setMessage({ ok: true, text: 'Text ist markiert – mit Strg+C bzw. «Kopieren» übernehmen.' });
    }
  };

  const saveFile = () => {
    try {
      const blob = new Blob([exported ?? exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `essensplaner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ ok: false, text: 'Speichern als Datei geht hier nicht – nutze «Kopieren».' });
    }
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
          <button className="btn" onClick={() => void copyBackup()}>
            <Icon name="download" size={18} /> Backup kopieren
          </button>
          <button className="btn" onClick={saveFile}>
            Als Datei speichern
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={18} /> Backup-Datei öffnen
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
        {exported && (
          <label className="field">
            <span>Dein Backup (markieren und kopieren)</span>
            <textarea id="backup-export" ref={exportArea} readOnly rows={4} value={exported} onFocus={(e) => e.target.select()} />
          </label>
        )}
        <label className="field">
          <span>Backup einfügen</span>
          <textarea
            id="backup-import"
            rows={3}
            placeholder="Kopiertes Backup hier einfügen …"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        </label>
        <button
          className="btn"
          disabled={!pasted.trim()}
          onClick={() => {
            const error = importData(pasted);
            setMessage(error ? { ok: false, text: error } : { ok: true, text: 'Backup importiert.' });
            if (!error) setPasted('');
          }}
        >
          Eingefügtes Backup übernehmen
        </button>
        {message && <div className={`alert ${message.ok ? 'info' : 'danger'}`}>{message.text}</div>}
        {confirmReset ? (
          <ConfirmBox
            danger
            question="Wirklich alles löschen? Plan, Vorräte, eigene Rezepte und angepasste Preise gehen verloren."
            confirmLabel="Alles löschen"
            onConfirm={() => {
              resetAll();
              setConfirmReset(false);
              setMessage({ ok: true, text: 'Alles zurückgesetzt.' });
            }}
            onCancel={() => setConfirmReset(false)}
          />
        ) : (
          <button className="btn danger" onClick={() => setConfirmReset(true)}>
            <Icon name="trash" size={18} /> Alles zurücksetzen
          </button>
        )}
      </section>
    </div>
  );
}
