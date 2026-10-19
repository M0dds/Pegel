import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreIcon } from '../icons';

export interface RowMenuItem {
  label: string;
  danger?: boolean;
  /** Asks once more ("Wirklich …?") before running. */
  confirm?: string;
  onSelect(): void;
}

interface Props {
  label: string;
  items: RowMenuItem[];
  children?: ReactNode;
}

/** ⋯ button with a small menu (same look as the preset chip menu). */
export function RowMenu({ label, items }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    setConfirming(null);
  };

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="row-menu" ref={root}>
      <button
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          className="chip-menu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={i === 0 ? first : undefined}
              role="menuitem"
              className={item.danger ? 'danger' : undefined}
              onClick={() => {
                if (item.confirm && confirming !== item.label) return setConfirming(item.label);
                close();
                item.onSelect();
              }}
            >
              {item.confirm && confirming === item.label ? item.confirm : item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
