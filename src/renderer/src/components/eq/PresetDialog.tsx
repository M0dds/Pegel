import { useEffect, useRef, useState, type FormEvent } from 'react';
import { findPreset, presetNameError, PRESET_NAME_MAX, type EqAction } from '@shared/eq';
import { BUILTIN_PRESETS } from '@shared/presets';
import type { EqSettings } from '@shared/types';
import { Select } from '../Select';
import { Curve } from './Curve';

/** `template: null` means "the current slider values". */
export type DialogMode =
  { kind: 'create'; template: string | null } | { kind: 'edit'; name: string };

const CURRENT = '__current__';

interface Props {
  eq: EqSettings;
  mode: DialogMode;
  onClose(): void;
  dispatch(action: EqAction): void;
}

/** Overlay over the EQ panel to create, rename or delete a preset. */
export function PresetDialog({ eq, mode, onClose, dispatch }: Props) {
  const editing = mode.kind === 'edit' ? mode.name : undefined;
  const [name, setName] = useState(editing ?? '');
  const [template, setTemplate] = useState(
    mode.kind === 'create' ? (mode.template ?? CURRENT) : CURRENT,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const error = presetNameError(name, eq.customPresets, editing);
  const previewGains =
    mode.kind === 'edit'
      ? (findPreset(eq, mode.name)?.gains ?? eq.gains)
      : template === CURRENT
        ? eq.gains
        : (findPreset(eq, template)?.gains ?? eq.gains);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    if (mode.kind === 'create') {
      dispatch({ type: 'createPreset', name, from: template === CURRENT ? null : template });
    } else if (name.trim() !== mode.name) {
      dispatch({ type: 'renamePreset', from: mode.name, to: name });
    }
    onClose();
  };

  return (
    <div
      className="eq-overlay"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="eq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-dialog-title"
        onSubmit={submit}
      >
        <h4 id="preset-dialog-title">
          {mode.kind === 'create' ? 'Neues Preset' : 'Preset bearbeiten'}
        </h4>

        <label className="field">
          <span className="field-label">Name</span>
          <input
            ref={input}
            value={name}
            maxLength={PRESET_NAME_MAX + 10}
            placeholder="z. B. Kopfhörer abends"
            aria-invalid={touched && !!error}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
            }}
          />
          {touched && error && <span className="field-error">{error}</span>}
        </label>

        {mode.kind === 'create' && (
          <div className="field">
            <span className="field-label" id="preset-template-label">
              Vorlage
            </span>
            <Select
              value={template}
              onChange={setTemplate}
              aria-label="Vorlage"
              groups={[
                { options: [{ value: CURRENT, label: 'Aktuelle Einstellung' }] },
                {
                  label: 'Standard',
                  options: BUILTIN_PRESETS.map((p) => ({ value: p.name, label: p.name })),
                },
                ...(eq.customPresets.length > 0
                  ? [
                      {
                        label: 'Eigene',
                        options: eq.customPresets.map((p) => ({ value: p.name, label: p.name })),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}

        <Curve gains={previewGains} compact />

        <div className="dialog-actions">
          {mode.kind === 'edit' && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                dispatch({ type: 'deletePreset', name: mode.name });
                onClose();
              }}
            >
              {confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn primary" disabled={touched && !!error}>
            {mode.kind === 'create' ? 'Anlegen' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}
