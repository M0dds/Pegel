import { useState, type FormEvent } from 'react';
import {
  allPresets,
  effectivePreamp,
  formatDb,
  formatHz,
  validPresetName,
  type EqAction,
} from '@shared/eq';
import {
  BUILTIN_PRESETS,
  CUSTOM_PRESET_NAME,
  EQ_FREQUENCIES,
  EQ_PREAMP_MAX,
  EQ_PREAMP_MIN,
  EQ_STEP,
} from '@shared/presets';
import type { EqSettings } from '@shared/types';
import { Switch } from '../Switch';
import { BandSlider } from './BandSlider';
import { Curve } from './Curve';

const dispatch = (action: EqAction) => window.pegel.eqAction(action);

type NameForm = { mode: 'save' } | { mode: 'rename'; from: string };

export function EqPanel({ eq, open }: { eq: EqSettings; open: boolean }) {
  const [form, setForm] = useState<NameForm | null>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCustomActive = eq.customPresets.some((p) => p.name === eq.preset);
  const chips = [
    ...allPresets(eq.customPresets).map((p) => p.name),
    ...(eq.preset === CUSTOM_PRESET_NAME ? [CUSTOM_PRESET_NAME] : []),
  ];
  const preamp = effectivePreamp(eq);

  const openForm = (next: NameForm) => {
    setForm(next);
    setName(next.mode === 'rename' ? next.from : '');
    setConfirmDelete(false);
  };

  const validName = validPresetName(name);
  const overwrites =
    form?.mode === 'save' &&
    validName !== null &&
    eq.customPresets.some((p) => p.name.toLowerCase() === validName.toLowerCase());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!validName || !form) return;
    if (form.mode === 'save') dispatch({ type: 'savePreset', name: validName });
    else dispatch({ type: 'renamePreset', from: form.from, to: validName });
    setForm(null);
  };

  return (
    <aside
      className={`eq${open ? ' open' : ''}${eq.enabled ? '' : ' off'}`}
      aria-hidden={!open}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'width') {
          window.pegel.eqPanelAnimationDone(open);
        }
      }}
    >
      <div className="eq-inner">
        <div className="eq-head">
          <h3>Equalizer</h3>
          <Switch
            checked={eq.enabled}
            label="Equalizer an/aus"
            onChange={(enabled) => dispatch({ type: 'setEnabled', enabled })}
          />
        </div>

        <div>
          <div className="field-label">Preset</div>
          <div className="presets">
            {chips.map((n) => (
              <button
                key={n}
                aria-pressed={n === eq.preset}
                onClick={() =>
                  n !== CUSTOM_PRESET_NAME && dispatch({ type: 'applyPreset', name: n })
                }
              >
                {n}
              </button>
            ))}
          </div>
          {isCustomActive && !form && (
            <div className="preset-tools">
              <button
                className="link"
                onClick={() => openForm({ mode: 'rename', from: eq.preset })}
              >
                Umbenennen
              </button>
              <span aria-hidden="true">·</span>
              <button
                className="link"
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  dispatch({ type: 'deletePreset', name: eq.preset });
                  setConfirmDelete(false);
                }}
                onBlur={() => setConfirmDelete(false)}
              >
                {confirmDelete ? `„${eq.preset}“ wirklich löschen?` : 'Löschen'}
              </button>
            </div>
          )}
        </div>

        <Curve gains={eq.gains} />

        <div className="bands">
          <div className="scale">
            <span>+12</span>
            <span>0</span>
            <span>−12</span>
          </div>
          {EQ_FREQUENCIES.map((f, i) => (
            <BandSlider
              key={f}
              label={formatHz(f)}
              value={eq.gains[i] ?? 0}
              onChange={(gain) => dispatch({ type: 'setBand', index: i, gain })}
            />
          ))}
        </div>

        <div>
          <div className="field-label field-row">
            Vorverstärkung
            <label className="check">
              <input
                type="checkbox"
                checked={eq.autoPreamp}
                onChange={(e) => dispatch({ type: 'setAutoPreamp', auto: e.target.checked })}
              />
              Automatisch
            </label>
          </div>
          <div className="preamp">
            <input
              type="range"
              aria-label="Vorverstärkung"
              min={EQ_PREAMP_MIN}
              max={EQ_PREAMP_MAX}
              step={EQ_STEP}
              value={preamp}
              onChange={(e) => dispatch({ type: 'setPreamp', preamp: Number(e.target.value) })}
              onDoubleClick={() => dispatch({ type: 'setAutoPreamp', auto: true })}
            />
            <span>{formatDb(preamp, true)} dB</span>
          </div>
        </div>

        {form ? (
          <form className="eq-actions name-form" onSubmit={submit}>
            <input
              autoFocus
              value={name}
              maxLength={30}
              placeholder="Name des Presets"
              aria-label="Name des Presets"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setForm(null)}
            />
            <div className="row-buttons">
              <button type="button" className="btn" onClick={() => setForm(null)}>
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={!validName}
                title={
                  validName
                    ? undefined
                    : `Bitte einen eigenen Namen wählen (nicht ${BUILTIN_PRESETS.map((p) => p.name).join(', ')} oder ${CUSTOM_PRESET_NAME})`
                }
              >
                {overwrites ? 'Überschreiben' : form.mode === 'save' ? 'Speichern' : 'Umbenennen'}
              </button>
            </div>
          </form>
        ) : (
          <div className="eq-actions">
            <button className="btn" onClick={() => dispatch({ type: 'reset' })}>
              Zurücksetzen
            </button>
            <button className="btn primary" onClick={() => openForm({ mode: 'save' })}>
              Als Preset speichern
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
