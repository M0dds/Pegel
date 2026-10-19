import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CheckIcon, ChevronIcon } from './icons';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectGroup {
  /** Group heading; omitted for ungrouped options. */
  label?: string;
  options: SelectOption[];
}

interface Props {
  value: string;
  groups: SelectGroup[];
  onChange(value: string): void;
  'aria-label'?: string;
  id?: string;
}

/**
 * Dropdown in Pegel's own style (a native <select> opens an OS-styled list).
 * Button + listbox pattern: arrows, Home/End, Enter/Space, Esc, type-ahead.
 */
export function Select({ value, groups, onChange, id, ...aria }: Props) {
  const [open, setOpen] = useState(false);
  const options = groups.flatMap((g) => g.options);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [active, setActive] = useState(selectedIndex);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const baseId = useId();
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const openList = () => {
    setActive(selectedIndex);
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const choose = (i: number) => {
    const option = options[i];
    if (option && option.value !== value) onChange(option.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // optionId only depends on the stable baseId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  /** Jump to the next option starting with the typed letters. */
  const typeAhead = (key: string, now: number) => {
    typed.current = {
      text: (now - typed.current.at < 700 ? typed.current.text : '') + key.toLowerCase(),
      at: now,
    };
    const match = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
    if (match >= 0) setActive(match);
  };

  const onButtonKey = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, () => number> = {
      ArrowDown: () => Math.min(last, active + 1),
      ArrowUp: () => Math.max(0, active - 1),
      Home: () => 0,
      End: () => last,
      PageDown: () => Math.min(last, active + 5),
      PageUp: () => Math.max(0, active - 5),
    };
    if (moves[e.key]) {
      setActive(moves[e.key]!());
    } else if (e.key === 'Enter' || e.key === ' ') {
      choose(active);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // close only the list, not the surrounding dialog
      close();
    } else if (e.key === 'Tab') {
      close(false);
      return;
    } else if (e.key.length === 1) {
      typeAhead(e.key, e.timeStamp);
    } else {
      return;
    }
    e.preventDefault();
  };

  let index = -1;
  return (
    <div className={`select${open ? ' open' : ''}`} ref={root}>
      <button
        ref={button}
        id={id}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        {...aria}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
      >
        <span className="select-value">{options[selectedIndex]?.label}</span>
        <ChevronIcon />
      </button>
      {open && (
        <ul
          ref={list}
          className="select-list"
          role="listbox"
          tabIndex={-1}
          aria-label={aria['aria-label']}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKey}
        >
          {groups.map((group, g) => (
            <li key={group.label ?? g} role="presentation">
              {group.label && (
                <div className="select-group" role="presentation">
                  {group.label}
                </div>
              )}
              <ul role="group" aria-label={group.label}>
                {group.options.map((option) => {
                  index++;
                  const i = index;
                  const selected = option.value === value;
                  return (
                    <li
                      key={option.value}
                      id={optionId(i)}
                      role="option"
                      aria-selected={selected}
                      className={`select-option${i === active ? ' active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(i)}
                    >
                      <span>{option.label}</span>
                      {selected && <CheckIcon />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
