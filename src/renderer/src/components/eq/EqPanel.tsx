import { useState, type CSSProperties } from 'react';
import {
  allPresets,
  effectivePreamp,
  formatDb,
  formatHz,
  isBuiltinPreset,
  isDirty,
  type EqAction,
} from '@shared/eq';
import { EQ_FREQUENCIES, EQ_PREAMP_MAX, EQ_PREAMP_MIN, EQ_STEP } from '@shared/presets';
import type { EqSettings } from '@shared/types';
import { Switch } from '../Switch';
import { BandSlider } from './BandSlider';
import { Curve } from './Curve';
import { PresetDialog, type DialogMode } from './PresetDialog';

const dispatch = (action: EqAction) => window.pegel.eqAction(action);

/** Track fill from 0 dB to the value, see input[type='range'] in global.css. */
function rangeFill(value: number, min: number, max: number): CSSProperties {
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const zero = Math.min(max, Math.max(min, 0));
  return {
    '--from': pos(Math.min(value, zero)),
    '--to': pos(Math.max(value, zero)),
  } as CSSProperties;
}

export function EqPanel({ eq, open }: { eq: EqSettings; open: boolean }) {
  const [dialog, setDialog] = useState<DialogMode | null>(null);

  const presets = allPresets(eq.customPresets);
  const activeExists = presets.some((p) => p.name === eq.preset);
  const dirty = isDirty(eq);
  // Built-in presets are read-only: changes can only become a new preset.
  const canSave = activeExists && !isBuiltinPreset(eq.preset);
  const preamp = effectivePreamp(eq);

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
            {presets.map((p) => {
              const active = p.name === eq.preset;
              const custom = !isBuiltinPreset(p.name);
              return (
                <button
                  key={p.name}
                  aria-pressed={active}
                  title={
                    custom
                      ? 'Doppelklick: umbenennen oder löschen'
                      : active && dirty
                        ? 'Geändert'
                        : undefined
                  }
                  onClick={() => dispatch({ type: 'applyPreset', name: p.name })}
                  onDoubleClick={() => custom && setDialog({ kind: 'edit', name: p.name })}
                >
                  {p.name}
                  {active && dirty && <span className="dot" aria-label="(geändert)" />}
                </button>
              );
            })}
            <button
              className="add"
              onClick={() =>
                setDialog({ kind: 'create', template: activeExists && !dirty ? eq.preset : null })
              }
            >
              + Preset
            </button>
          </div>
          {canSave && !dialog && (
            <div className="preset-tools">
              <button className="link" onClick={() => setDialog({ kind: 'edit', name: eq.preset })}>
                Umbenennen oder löschen
              </button>
            </div>
          )}
        </div>

        <Curve gains={eq.gains} />

        <div className="bands">
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
              style={rangeFill(preamp, EQ_PREAMP_MIN, EQ_PREAMP_MAX)}
              onChange={(e) => dispatch({ type: 'setPreamp', preamp: Number(e.target.value) })}
              onDoubleClick={() => dispatch({ type: 'setAutoPreamp', auto: true })}
            />
            <span>{formatDb(preamp, true)} dB</span>
          </div>
        </div>

        {dirty && (
          <div className="eq-changes" role="status">
            <span className="changes-label">
              {activeExists ? `${eq.preset} · geändert` : 'Nicht gespeicherte Einstellung'}
            </span>
            <div className="eq-actions">
              {activeExists && (
                <button className="btn" onClick={() => dispatch({ type: 'discardChanges' })}>
                  Verwerfen
                </button>
              )}
              <button
                className={canSave ? 'btn' : 'btn primary'}
                onClick={() => setDialog({ kind: 'create', template: null })}
              >
                Als neues Preset
              </button>
              {canSave && (
                <button className="btn primary" onClick={() => dispatch({ type: 'saveChanges' })}>
                  Speichern
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {dialog && (
        <PresetDialog eq={eq} mode={dialog} onClose={() => setDialog(null)} dispatch={dispatch} />
      )}
    </aside>
  );
}
