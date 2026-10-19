import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MoreIcon } from '../icons';

interface Props {
  name: string;
  active: boolean;
  dirty: boolean;
  /** Custom presets get the ⋯ menu (rename, delete); built-in ones are read-only. */
  custom: boolean;
  onApply(): void;
  onRename(): void;
  onDelete(): void;
}

/** Preset chip; custom ones carry a ⋯ button and a context menu with rename/delete. */
export function PresetChip({ name, active, dirty, custom, onApply, onRename, onDelete }: Props) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  const close = () => {
    setMenu(false);
    setConfirm(false);
  };

  useEffect(() => {
    if (!menu) return;
    first.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  const label = (
    <>
      {name}
      {active && dirty && <span className="dot" aria-label="(geändert)" />}
    </>
  );

  if (!custom) {
    return (
      <button
        className="chip"
        aria-pressed={active}
        title={active && dirty ? 'Geändert' : undefined}
        onClick={onApply}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      ref={root}
      className={`chip-group${active ? ' active' : ''}${menu ? ' menu-open' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      <button className="chip" aria-pressed={active} onClick={onApply} onDoubleClick={onRename}>
        {label}
      </button>
      <button
        className="chip-more"
        aria-label={`${name}: weitere Aktionen`}
        aria-haspopup="menu"
        aria-expanded={menu}
        title="Umbenennen oder löschen"
        onClick={() => (menu ? close() : setMenu(true))}
      >
        <MoreIcon />
      </button>
      {menu && (
        <div className="chip-menu" role="menu" onKeyDown={onMenuKey}>
          <button
            ref={first}
            role="menuitem"
            onClick={() => {
              close();
              onRename();
            }}
          >
            Umbenennen
          </button>
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              if (!confirm) return setConfirm(true);
              close();
              onDelete();
            }}
          >
            {confirm ? 'Wirklich löschen?' : 'Löschen'}
          </button>
        </div>
      )}
    </div>
  );
}
