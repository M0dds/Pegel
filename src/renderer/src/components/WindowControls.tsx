import { useEffect, useState } from 'react';

/**
 * Minimize, maximize/restore and close for Windows/Linux, drawn by Pegel so
 * they hover like the other title bar buttons. Thin 1 px glyphs in the style
 * of the Windows caption buttons.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.pegel.isMaximized().then(setMaximized);
    return window.pegel.onMaximizedChanged(setMaximized);
  }, []);

  return (
    <div className="win-controls">
      <button
        className="tb-btn win-btn"
        aria-label="Minimieren"
        title="Minimieren"
        onClick={() => window.pegel.windowControl('minimize')}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button
        className="tb-btn win-btn"
        aria-label={maximized ? 'Verkleinern' : 'Maximieren'}
        title={maximized ? 'Verkleinern' : 'Maximieren'}
        onClick={() => window.pegel.windowControl('toggleMaximize')}
      >
        {maximized ? (
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M.5.5h9v9h-9z" />
          </svg>
        )}
      </button>
      <button
        className="tb-btn win-btn win-close"
        aria-label="Schließen"
        title="Schließen"
        onClick={() => window.pegel.windowControl('close')}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </div>
  );
}
