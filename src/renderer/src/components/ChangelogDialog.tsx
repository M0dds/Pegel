import { useEffect, useRef, useState } from 'react';
import { CHANGELOG, formatReleaseDate, isExpandedByDefault } from '@shared/changelog';

interface Props {
  /** The installed version, marked in the list. */
  current: string | undefined;
  onClose(): void;
}

/**
 * "Was ist neu": all versions, newest first (click on the version in the
 * settings). The newest minor version and its patches are open, older ones
 * start collapsed.
 */
export function ChangelogDialog({ current, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(
    () => new Set(CHANGELOG.filter((e) => isExpandedByDefault(e.version)).map((e) => e.version)),
  );

  useEffect(() => closeRef.current?.focus(), []);

  const toggle = (version: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(version)) next.add(version);
      return next;
    });

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
          {CHANGELOG.map((entry) => {
            const expanded = open.has(entry.version);
            const listId = `changelog-${entry.version.replaceAll('.', '-')}`;
            return (
              <section key={entry.version} className="changelog-entry">
                <button
                  type="button"
                  className="changelog-head"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => toggle(entry.version)}
                >
                  <svg className="changelog-chevron" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M3 2l3.5 3L3 8" />
                  </svg>
                  <b>Pegel {entry.version}</b>
                  {entry.version === current && (
                    <span className="changelog-badge">installiert</span>
                  )}
                  <small>{formatReleaseDate(entry.date)}</small>
                </button>
                {expanded && (
                  <ul id={listId}>
                    {entry.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
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
