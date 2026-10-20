import { useEffect, useRef } from 'react';
import { CHANGELOG, formatReleaseDate } from '@shared/changelog';

interface Props {
  /** The installed version, marked in the list. */
  current: string | undefined;
  onClose(): void;
}

/** "Was ist neu": all versions, newest first (click on the version in the settings). */
export function ChangelogDialog({ current, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div
      className="eq-overlay changelog-overlay"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Esc would otherwise also leave the settings page.
          e.stopPropagation();
          onClose();
        }
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="eq-dialog changelog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
      >
        <h4 id="changelog-title">Was ist neu</h4>
        <div className="changelog-list">
          {CHANGELOG.map((entry) => (
            <section key={entry.version} className="changelog-entry">
              <div className="changelog-head">
                <b>Pegel {entry.version}</b>
                {entry.version === current && <span className="changelog-badge">installiert</span>}
                <small>{formatReleaseDate(entry.date)}</small>
              </div>
              <ul>
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="dialog-actions">
          <span className="spacer" />
          <button ref={closeRef} type="button" className="btn" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
