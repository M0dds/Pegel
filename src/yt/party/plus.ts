import type { PlusMode } from '@shared/social';
import type { SuggestedTrack } from '@shared/social-protocol';
import { SELECTORS } from '../selectors';

const BUTTON_CLASS = 'pegel-plus';
const DONE_CLASS = 'pegel-plus-done';
const SCAN_DELAY_MS = 250;
/** "Added" tick stays this long. */
const DONE_MS = 1400;

const LABEL: Record<Exclude<PlusMode, null>, string> = {
  queue: 'Zur Party-Warteschlange',
  suggest: 'Dem Host vorschlagen',
};

/** Album pages show plays instead of the artist in that column. */
const PLAYS = /^\d[\d.,\s]*\s*(k|m|mio\.?|tsd\.?|mrd\.?)?\s*(plays|views|wiedergaben|aufrufe)/i;

const SVG_NS = 'http://www.w3.org/2000/svg';
const PLUS_PATH = 'M12 5v14M5 12h14';
const CHECK_PATH = 'm5 12.5 4.5 4.5L19 7.5';

/** Icon built with DOM calls: YT enforces Trusted Types, so HTML strings would throw. */
function setIcon(button: HTMLButtonElement, d: string): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  button.replaceChildren(svg);
}

function css(): string {
  const row = SELECTORS.listItem;
  return `
.${BUTTON_CLASS} {
  display: none; place-items: center; flex: none; align-self: center;
  width: 32px; height: 32px; margin: 0 2px; padding: 0;
  border: 0; border-radius: 50%; background: transparent; cursor: pointer;
  color: var(--ytmusic-text-primary, #fff);
}
${row}:hover .${BUTTON_CLASS}, .${BUTTON_CLASS}:focus-visible, .${BUTTON_CLASS}.${DONE_CLASS} { display: grid; }
.${BUTTON_CLASS}:hover { background: rgba(255, 255, 255, 0.1); }
.${BUTTON_CLASS}.${DONE_CLASS} { color: var(--ytmusic-brand-link-text, #3ea6ff); }
`;
}

/**
 * During a party: a "+" in every track row of YT's lists (playlists, albums,
 * search, library), right before the ⋮ menu. A click adds the track to the
 * party queue (or suggests it) instead of playing it, so the music goes on.
 * Rows are recycled by YT, so the track is read at click time. If YT changes
 * its rows, the "+" simply does not appear; nothing else breaks.
 */
export class PlusButtons {
  private mode: PlusMode = null;
  private observer: MutationObserver | null = null;
  private style: HTMLStyleElement | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly onAdd: (track: SuggestedTrack) => void) {}

  setMode(mode: PlusMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!mode) return this.removeAll();
    // The party state can arrive before YT's page has a body.
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => this.start(), { once: true });
      return;
    }
    this.start();
  }

  private start(): void {
    const mode = this.mode;
    if (!mode || !document.body) return;
    if (!this.style) {
      this.style = document.createElement('style');
      this.style.textContent = css();
      (document.head ?? document.documentElement).append(this.style);
    }
    if (!this.observer) {
      this.observer = new MutationObserver(() => this.scheduleScan());
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>(`.${BUTTON_CLASS}`)) {
      button.title = LABEL[mode];
      button.setAttribute('aria-label', LABEL[mode]);
    }
    this.scan();
  }

  private scheduleScan(): void {
    if (this.scanTimer) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scan();
    }, SCAN_DELAY_MS);
  }

  private scan(): void {
    if (!this.mode) return;
    for (const row of document.querySelectorAll<HTMLElement>(SELECTORS.listItem)) {
      if (row.querySelector(`:scope > .${BUTTON_CLASS}`)) continue;
      // Only songs and videos (artists, albums and playlists have no watch link).
      if (!row.querySelector(SELECTORS.watchLink)) continue;
      const menu = row.querySelector(`:scope > ${SELECTORS.listItemMenu}`);
      if (!menu) continue;
      row.insertBefore(this.button(row), menu);
    }
  }

  private button(row: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    setIcon(button, PLUS_PATH);
    const label = this.mode ? LABEL[this.mode] : '';
    button.title = label;
    button.setAttribute('aria-label', label);
    // The row plays the track on click; the "+" must not.
    for (const type of ['mousedown', 'pointerdown']) {
      button.addEventListener(type, (e) => e.stopPropagation());
    }
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const track = readRow(row);
      if (!track) return;
      this.onAdd(track);
      button.classList.add(DONE_CLASS);
      setIcon(button, CHECK_PATH);
      setTimeout(() => {
        button.classList.remove(DONE_CLASS);
        setIcon(button, PLUS_PATH);
      }, DONE_MS);
    });
    return button;
  }

  private removeAll(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
    for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) button.remove();
    this.style?.remove();
    this.style = null;
  }
}

/** Track of a row: id from its watch link, title and artist from its text. */
function readRow(row: HTMLElement): SuggestedTrack | null {
  const href = row.querySelector(SELECTORS.watchLink)?.getAttribute('href');
  if (!href) return null;
  const videoId = new URL(href, location.origin).searchParams.get('v');
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const title = row.querySelector(SELECTORS.listItemTitle)?.textContent?.trim() ?? '';
  const byline = row.querySelector(SELECTORS.listItemByline)?.textContent?.trim() ?? '';
  return { videoId, title: title.slice(0, 300), artist: artistFrom(byline).slice(0, 300) };
}

/** Search rows say "Song • Artist • 3.6bn plays", album rows only the plays: keep the artist. */
const KIND = /^(song|video|lied|single|album|ep|episode|folge|podcast)$/i;
function artistFrom(byline: string): string {
  const parts = byline.split(/\s+[•·]\s+/).map((p) => p.trim());
  return parts.find((p) => p && !KIND.test(p) && !PLAYS.test(p) && !/^\d+:\d{2}/.test(p)) ?? '';
}
