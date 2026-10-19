import { useEffect, useRef, useState, type FormEvent } from 'react';
import { normalizeFriendCode } from '@shared/party-sync';
import type { SocialState } from '@shared/social';
import { CheckIcon, CopyIcon } from '../icons';

interface Props {
  code: SocialState['code'];
  online: boolean;
  onClose(): void;
}

/** "heute um 18:30" / "morgen um 16:24". */
function validUntil(ms: number): string {
  const date = new Date(ms);
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const day = date.toDateString() === today.toDateString() ? 'heute' : 'morgen';
  return `${day} um ${time} Uhr`;
}

/** Overlay over the Social panel: show the own code, or enter a friend's. */
export function AddFriendDialog({ code, online, onClose }: Props) {
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // A fresh code right away; the old one (if any) is replaced on the server.
    if (!code && online) window.pegel.createFriendCode();
    field.current?.focus();
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalized = normalizeFriendCode(input);
  const error = touched && !normalized ? 'Ein Code hat 8 Zeichen, z. B. K7Q2-M9XD.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!normalized) return;
    window.pegel.redeemFriendCode(normalized);
    onClose();
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused; the code is still readable.
    }
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
        aria-labelledby="friend-dialog-title"
        onSubmit={submit}
      >
        <h4 id="friend-dialog-title">Freund hinzufügen</h4>

        <div>
          <div className="field-label">Dein Code</div>
          <div className="friend-code">
            <span className={code ? 'code' : 'code pending'}>
              {code ? code.code : online ? '····-····' : 'offline'}
            </span>
            <button
              type="button"
              className="icon-btn"
              disabled={!code}
              aria-label="Code kopieren"
              title={copied ? 'Kopiert' : 'Kopieren'}
              onClick={() => void copy()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <p className="hint">
            {code
              ? `Schick ihn deinem Freund. Gültig bis ${validUntil(code.expiresAt)}, nur einmal.`
              : 'Ein Code gilt 24 Stunden und nur einmal.'}
          </p>
        </div>

        <label className="field">
          <span className="field-label">Code von deinem Freund</span>
          <input
            ref={field}
            value={input}
            maxLength={12}
            placeholder="XXXX-XXXX"
            spellCheck={false}
            aria-invalid={!!error}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
          />
          {error && <span className="field-error">{error}</span>}
        </label>

        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Schließen
          </button>
          <button type="submit" className="btn primary" disabled={!online || !input.trim()}>
            Hinzufügen
          </button>
        </div>
      </form>
    </div>
  );
}
