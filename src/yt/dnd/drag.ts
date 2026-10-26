import type { PlaylistDropReport, PlaylistTrack } from '@shared/playlist-drop';
import { largestArtwork } from '@shared/player';
import { readTrackInfo } from '../player/bridge';
import { SELECTORS } from '../selectors';
import { addToPlaylist, isSignedIn, queryPlaylists, readBrowseIds, readRowData } from './api';
import type { AddResult, PlaylistOption } from './innertube';
import {
  bezier,
  easeInCubic,
  easeInOutCubic,
  flightControl,
  FOLLOW,
  isSettled,
  magnetize,
  RETURN,
  SOFT,
  stepSpring,
  tiltFor,
  type Point,
  type Spring,
} from './motion';
import { DND } from './styles';
import { playlistIdFromBrowseId, sizedCover, videoIdFromHref, type DraggedTrack } from './track';

/**
 * Drag a track from YT's lists (or the player bar) onto one of the user's
 * playlists in YT's sidebar, like in Spotify. YT Music has no such thing.
 *
 * Pointer based, not HTML5 drag and drop: only that allows a card that
 * follows the cursor on springs, condenses over a playlist and flies into it.
 * A press without movement stays YT's click; nothing is prevented until the
 * pointer has moved past a threshold. Where YT drags the row itself (queue
 * reordering), YT keeps the gesture until the row is pulled out of its list
 * to the side; then Pegel takes over and ends YT's drag where it started.
 */

/** Movement before a press becomes a drag (px). */
const THRESHOLD_PX = 6;
/** A press held this long shows the grabbing hand, even before it moves (ms). */
const HOLD_MS = 150;
/** How far a row YT is reordering must leave its list sideways before Pegel takes it (px). */
const PULL_OUT_PX = 28;
/** The card's anchor (cover centre) relative to its top left corner. */
const ANCHOR = 30;
/** Cover size the card asks for (2× its largest use). */
const COVER_PX = 120;
/** Distance of the landing spot (and tick) from the right end of a playlist row (px). */
const CONFIRM_INSET = 66;
/** Drop flight duration (ms). */
const FLIGHT_MS = 460;
/** Sidebar auto-scroll: zone at the top and bottom edge (px) and top speed (px/s). */
const SCROLL_ZONE = 56;
const SCROLL_SPEED = 900;
/** Playlists whose browse id YT shows in the sidebar but that do not take tracks this way. */
const NOT_DROPPABLE = new Set(['LM', 'SE']);

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A small line or filled icon, built as DOM: YT's page enforces Trusted
 * Types, so innerHTML with a string is refused.
 */
function icon(d: string, viewBox: number, filled: boolean, className?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewBox} ${viewBox}`);
  if (className) svg.setAttribute('class', className);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  if (filled) {
    svg.setAttribute('fill', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  svg.append(path);
  return svg;
}

const noteIcon = () => icon('M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z', 24, true);
const plusIcon = () => icon('M6 1.5v9M1.5 6h9', 12, false, 'plus');
const tickIcon = (className?: string) => icon('M2.2 6.3 4.8 8.8 9.8 3.4', 12, false, className);

interface Target {
  el: HTMLElement;
  playlistId: string;
  title: string;
  /** Already in there (from YT's "Save to playlist" list; undefined until known). */
  contains?: boolean;
}

interface Pending {
  pointerId: number;
  start: Point;
  /** Row (or player bar part) the press started on. */
  source: HTMLElement;
  /** The row's list before YT may move it (YT reparents the row it drags). */
  parent: HTMLElement | null;
  fromPlayer: boolean;
}

type Phase = 'idle' | 'pending' | 'deciding' | 'yt' | 'drag' | 'fly' | 'return';

function textOf(el: Element | null | undefined): string | undefined {
  const text = el?.textContent?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

/** A real image (YT keeps a 1×1 placeholder until a row was scrolled into view). */
function imageSrc(img: HTMLImageElement | null | undefined): string | undefined {
  const src = img?.currentSrc || img?.src;
  return src && src.startsWith('https://') ? src : undefined;
}

function visibleRect(el: Element | null | undefined): DOMRect | null {
  const rect = el?.getBoundingClientRect();
  return rect && rect.width > 0 && rect.height > 0 ? rect : null;
}

/**
 * Where the card lands in a playlist row and the tick appears: near its end,
 * clear of the play button YT shows there on hover.
 */
function confirmSpot(box: DOMRect): Point {
  return { x: box.right - CONFIRM_INSET, y: box.top + box.height / 2 };
}

/** The cover the page already shows, plus a sharper one to swap in. */
function setCover(track: DraggedTrack, url: string): void {
  track.coverUrl = url;
  const sharp = sizedCover(url, COVER_PX);
  if (sharp && sharp !== url) track.sharpCoverUrl = sharp;
}

function center(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The scrollable element around the sidebar entries (for auto-scroll). */
function scrollParent(el: Element | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

export class PlaylistDrag {
  private phase: Phase = 'idle';
  private pending: Pending | null = null;
  private holdTimer = 0;
  private track: DraggedTrack | null = null;
  private source: HTMLElement | null = null;
  /** Card anchor when the drag began; a cancelled drag returns there. */
  private home: Point = { x: 0, y: 0 };
  private pointer: Point = { x: 0, y: 0 };
  private velocityX = 0;
  private lastMove = 0;

  private readonly x: Spring = { value: 0, velocity: 0 };
  private readonly y: Spring = { value: 0, velocity: 0 };
  private readonly scale: Spring = { value: 1, velocity: 0 };
  private readonly tilt: Spring = { value: 0, velocity: 0 };

  private layer: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private frame = 0;
  private lastFrame = 0;

  private targets: Target[] = [];
  /** All sidebar playlists, whether they take the track or not (to know if any are visible). */
  private sidebarPlaylists = 0;
  private over: Target | null = null;
  private scroller: HTMLElement | null = null;
  /** Each drag gets a number, so late answers of an earlier one are ignored. */
  private dragNo = 0;
  /** Playlists YT offered last time: shown at once on the next drag, refreshed in the background. */
  private knownEditable: Set<string> | null = null;

  /** The last refused duplicate, for "Trotzdem hinzufügen". */
  private lastDuplicate: (PlaylistTrack & { el: HTMLElement; title?: string | undefined }) | null =
    null;
  /** The drag was taken over from YT's own row drag: YT must not see the rest of the gesture. */
  private tookOver = false;
  private flight: {
    from: Point;
    control: Point;
    to: Point;
    start: number;
    scale0: number;
    tilt0: number;
  } | null = null;
  private suppressClickUntil = 0;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly onReport: (report: PlaylistDropReport) => void) {}

  start(): void {
    const opts = { capture: true };
    window.addEventListener('pointerdown', this.onPointerDown, opts);
    window.addEventListener('pointermove', this.onPointerMove, opts);
    window.addEventListener('pointerup', this.onPointerUp, opts);
    window.addEventListener('pointercancel', this.onPointerCancel, opts);
    window.addEventListener('dragstart', this.onDragStart, opts);
    window.addEventListener('click', this.onClick, opts);
    window.addEventListener('keydown', this.onKeyDown, opts);
    window.addEventListener('mousemove', this.hideFromYt, opts);
    window.addEventListener('mouseup', this.hideFromYt, opts);
    window.addEventListener('blur', this.onBlur);
  }

  /** "Trotzdem hinzufügen" in the title bar: the refused track goes in a second time. */
  async addAnyway(track: PlaylistTrack): Promise<void> {
    const last = this.lastDuplicate;
    const same = last?.playlistId === track.playlistId && last.videoId === track.videoId;
    this.lastDuplicate = null;
    const result = await addToPlaylist(track.playlistId, track.videoId, true);
    const report: PlaylistDropReport = { result: result === 'added' ? 'added' : 'error' };
    if (same && last.title) report.playlist = last.title;
    if (same && last.el.isConnected) {
      if (result === 'added') this.confirmOn(last.el);
      else this.refuseOn(last.el);
    }
    this.onReport(report);
  }

  // ---- Gesture ----------------------------------------------------------

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'idle' || e.button !== 0 || !e.isPrimary || e.pointerType === 'touch')
      return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest(SELECTORS.rowNoDrag)) return;
    const row = target.closest<HTMLElement>(SELECTORS.songRow);
    const player = row ? null : target.closest<HTMLElement>(SELECTORS.playerBarTrack);
    const source = row ?? player;
    if (!source || !isSignedIn()) return;
    this.pending = {
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      source,
      parent: source.parentElement,
      fromPlayer: !row,
    };
    this.phase = 'pending';
    this.holdTimer = window.setTimeout(() => this.setHolding(true), HOLD_MS);
  };

  /** After taking over YT's row drag, the rest of the gesture is Pegel's alone. */
  private readonly hideFromYt = (e: Event): void => {
    if (this.tookOver && this.phase === 'drag') e.stopImmediatePropagation();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.hideFromYt(e);
    if (this.phase === 'idle' || this.phase === 'fly' || this.phase === 'return') return;
    const pending = this.pending;
    if (this.phase === 'drag') {
      if (e.buttons === 0) {
        // The release happened outside the page (another window, the title bar).
        this.cancel();
        return;
      }
      this.trackPointer(e);
      return;
    }
    if (!pending || e.pointerId !== pending.pointerId) return;
    if (e.buttons === 0) {
      this.reset();
      return;
    }
    if (this.phase === 'pending') {
      const moved = Math.hypot(e.clientX - pending.start.x, e.clientY - pending.start.y);
      if (moved < THRESHOLD_PX) return;
      // This listener runs before YT's own for the same event: whether YT lifts
      // the row for reordering is only known once YT has seen it.
      this.phase = 'deciding';
      this.setHolding(true);
      this.pointer = { x: e.clientX, y: e.clientY };
      requestAnimationFrame(() => {
        if (this.phase !== 'deciding' || this.pending !== pending) return;
        if (this.ytIsDragging(pending)) this.phase = 'yt';
        else if (!this.begin(pending, this.pointer, null)) this.reset();
      });
      return;
    }
    if (this.phase === 'deciding') {
      this.pointer = { x: e.clientX, y: e.clientY };
      return;
    }
    // phase 'yt': YT reorders the row; take it once it is pulled out of its list sideways.
    const list = visibleRect(pending.parent);
    if (!list) return;
    if (e.clientX < list.left - PULL_OUT_PX || e.clientX > list.right + PULL_OUT_PX) {
      const floating = visibleRect(this.ytFloatingRow() ?? pending.source);
      this.endYtDrag(pending);
      if (this.begin(pending, { x: e.clientX, y: e.clientY }, floating)) this.tookOver = true;
      else this.reset();
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.hideFromYt(e);
    if (this.phase === 'drag') {
      this.suppressClickUntil = performance.now() + 400;
      this.drop();
      return;
    }
    if (
      (this.phase === 'pending' || this.phase === 'deciding' || this.phase === 'yt') &&
      e.pointerId === this.pending?.pointerId
    ) {
      this.reset();
    }
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.phase === 'drag') this.cancel();
    else if (
      e.pointerId === this.pending?.pointerId &&
      this.phase !== 'fly' &&
      this.phase !== 'return'
    )
      this.reset();
  };

  /** Links and images in a row would start the browser's own drag (a grey ghost); not while ours runs. */
  private readonly onDragStart = (e: DragEvent): void => {
    if (this.phase !== 'pending' && this.phase !== 'deciding' && this.phase !== 'drag') return;
    const target = e.target instanceof Element ? e.target : null;
    // An element YT made draggable on purpose keeps its drag.
    if (target?.closest('[draggable="true"]')) {
      this.reset();
      return;
    }
    if (target && this.pending?.source.contains(target)) e.preventDefault();
  };

  /** The release after a drag must not count as a click (on the row or the playlist). */
  private readonly onClick = (e: MouseEvent): void => {
    if (performance.now() > this.suppressClickUntil) return;
    this.suppressClickUntil = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || this.phase !== 'drag') return;
    // Esc only cancels the drag; YT must not also close the player page.
    e.preventDefault();
    e.stopImmediatePropagation();
    this.cancel();
  };

  private readonly onBlur = (): void => {
    if (this.phase === 'drag') this.cancel();
    else if (this.phase === 'pending' || this.phase === 'deciding' || this.phase === 'yt')
      this.reset();
  };

  /**
   * YT drags rows it can reorder itself (queue, own playlists): it hides the
   * row and lets a copy of it float at the end of <body>.
   */
  private ytIsDragging(pending: Pending): boolean {
    const row = pending.source;
    return (
      this.ytFloatingRow() !== null ||
      row.parentElement !== pending.parent ||
      row.getClientRects().length === 0
    );
  }

  /** The copy of a row YT is dragging (a direct child of <body>). */
  private ytFloatingRow(): HTMLElement | null {
    for (const el of document.querySelectorAll<HTMLElement>(SELECTORS.songRow)) {
      if (el.parentElement === document.body) return el;
    }
    return null;
  }

  /**
   * Ends YT's own row drag without an effect: YT sees the pointer go back to
   * where it was pressed and released there, so the row returns to its place.
   * Later moves of this gesture are Pegel's (see the capture listeners).
   */
  private endYtDrag(pending: Pending): void {
    const at = document.elementFromPoint(pending.start.x, pending.start.y) ?? document.body;
    const base = {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: pending.start.x,
      clientY: pending.start.y,
      pointerId: pending.pointerId,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
    };
    this.phase = 'idle'; // our own listeners ignore these
    at.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 1 }));
    at.dispatchEvent(new MouseEvent('mousemove', { ...base, buttons: 1 }));
    at.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
    at.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
    this.phase = 'yt';
  }

  private reset(): void {
    this.pending = null;
    this.phase = 'idle';
    this.setHolding(false);
  }

  private setHolding(on: boolean): void {
    clearTimeout(this.holdTimer);
    document.documentElement.classList.toggle(DND.holding, on);
  }

  // ---- Start ------------------------------------------------------------

  /** Reads the track and starts the drag. False: not a track (album, artist row). */
  private begin(pending: Pending, at: Point, floating: DOMRect | null): boolean {
    const found = pending.fromPlayer ? this.playerTrack() : this.rowTrack(pending.source);
    if (!found) return false;
    const { track, cover } = found;
    this.track = track;
    this.source = pending.source;
    this.phase = 'drag';
    const no = ++this.dragNo;

    getSelection()?.removeAllRanges();
    const html = document.documentElement;
    html.classList.add(DND.dragging);
    html.classList.toggle(DND.reduced, this.reducedMotion.matches);
    if (!pending.fromPlayer) pending.source.classList.add(DND.source);

    // The card rises out of the row: its cover starts where the row's cover is
    // (or where YT's lifted row was, when taken over from YT's own drag).
    this.home = floating
      ? { x: floating.left + ANCHOR, y: floating.top + floating.height / 2 }
      : (this.homeOf(pending.source, cover) ?? at);
    this.pointer = at;
    this.velocityX = 0;
    this.lastMove = performance.now();
    const reduced = this.reducedMotion.matches;
    this.x.value = reduced ? this.pointer.x : this.home.x;
    this.y.value = reduced ? this.pointer.y : this.home.y;
    this.x.velocity = this.y.velocity = this.scale.velocity = this.tilt.velocity = 0;
    this.scale.value = cover || floating ? 1 : 0.86;
    this.tilt.value = 0;

    this.buildCard(track);
    this.collectTargets(no);
    this.loop();
    return true;
  }

  /** Where a cancelled card goes back to: the cover of its row, or the row's start. */
  private homeOf(source: HTMLElement, cover?: DOMRect | null): Point | null {
    const img = visibleRect(source.querySelector(SELECTORS.rowCover));
    const box = cover ?? (img && img.width > 20 ? img : null);
    if (box) return center(box);
    const row = visibleRect(source);
    return row ? { x: row.left + ANCHOR + 8, y: row.top + row.height / 2 } : null;
  }

  private rowTrack(row: HTMLElement): { track: DraggedTrack; cover: DOMRect | null } | null {
    const link = row.querySelector(SELECTORS.trackLink);
    let videoId = videoIdFromHref(link?.getAttribute('href'));
    // Queue items have no link; YT's own data behind the row has the id.
    const data = videoId ? null : readRowData(row);
    videoId ??= data?.videoId ?? null;
    if (!videoId) return null;
    const img = row.querySelector<HTMLImageElement>(SELECTORS.rowCover);
    let coverUrl = imageSrc(img) ?? data?.thumbnail;
    let artist = textOf(row.querySelector(SELECTORS.rowArtist)) ?? data?.artist;
    let cover = coverUrl ? visibleRect(img) : null;
    if (!coverUrl) {
      // Album tracks have no cover of their own: the album's, from the page header.
      coverUrl = imageSrc(document.querySelector<HTMLImageElement>(SELECTORS.pageCover));
      artist ??= textOf(document.querySelector(SELECTORS.pageArtist));
      cover = null;
    }
    const title = textOf(row.querySelector(SELECTORS.rowTitle)) ?? data?.title ?? 'Titel';
    const track: DraggedTrack = { videoId, title };
    if (artist) track.artist = artist;
    if (coverUrl) setCover(track, coverUrl);
    return { track, cover };
  }

  /** The playing track: id from YT's player, everything else from the media session. */
  private playerTrack(): { track: DraggedTrack; cover: DOMRect | null } | null {
    const videoId = readTrackInfo()?.videoId;
    const meta = navigator.mediaSession.metadata;
    if (!videoId || !meta?.title) return null;
    const track: DraggedTrack = { videoId, title: meta.title };
    if (meta.artist) track.artist = meta.artist;
    const img = document.querySelector<HTMLImageElement>(`${SELECTORS.playerBarTrack} img`);
    const art = imageSrc(img) ?? largestArtwork(meta.artwork);
    if (art) setCover(track, art);
    return { track, cover: visibleRect(img) };
  }

  private buildCard(track: DraggedTrack): void {
    this.layer?.remove();
    const layer = document.createElement('div');
    layer.id = DND.root;
    const card = document.createElement('div');
    card.className = 'card';
    const cover = () => {
      if (!track.coverUrl) {
        const box = document.createElement('div');
        box.append(noteIcon());
        return box;
      }
      const img = document.createElement('img');
      img.src = track.coverUrl;
      img.alt = '';
      img.draggable = false;
      return img;
    };
    const face = document.createElement('div');
    face.className = 'face';
    const faceCover = cover();
    faceCover.classList.add('cover');
    const text = document.createElement('div');
    text.className = 'text';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = track.title;
    text.append(title);
    if (track.artist) {
      const artist = document.createElement('div');
      artist.className = 'artist';
      artist.textContent = track.artist;
      text.append(artist);
    }
    face.append(faceCover, text);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.append(cover());
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.append(plusIcon(), tickIcon('tick'));
    card.append(face, chip, badge);
    // Swap in the sharper cover once it has loaded; until then the page's own.
    const sharp = track.sharpCoverUrl;
    if (sharp) {
      const pre = new Image();
      pre.onload = () => card.querySelectorAll('img').forEach((img) => (img.src = sharp));
      pre.src = sharp;
    }
    layer.append(card);
    // Next to (not inside) YT's app element, so YT never re-renders or removes it.
    document.body.append(layer);
    this.layer = layer;
    this.card = card;
    this.render();
    requestAnimationFrame(() => card.classList.add('shown'));
  }

  // ---- Targets ----------------------------------------------------------

  /** The user's playlists in the sidebar that can take the track. */
  private collectTargets(no: number): void {
    const entries = [...document.querySelectorAll<HTMLElement>(SELECTORS.guideEntry)];
    const browseIds = readBrowseIds(SELECTORS.guideEntry);
    const playlists: { el: HTMLElement; playlistId: string; title: string }[] = [];
    entries.forEach((el, i) => {
      const playlistId = playlistIdFromBrowseId(browseIds[i]);
      if (!playlistId || NOT_DROPPABLE.has(playlistId) || !visibleRect(el)) return;
      const title = textOf(el.querySelector(SELECTORS.guideEntryTitle)) ?? textOf(el) ?? '';
      playlists.push({ el, playlistId, title });
    });
    this.sidebarPlaylists = playlists.length;
    this.scroller = scrollParent(playlists[0]?.el ?? null);

    const apply = (editable: (id: string) => boolean, options?: Map<string, PlaylistOption>) => {
      if (no !== this.dragNo || this.phase !== 'drag') return;
      for (const t of this.targets) t.el.classList.remove(DND.target, DND.over, DND.has);
      this.targets = [];
      let i = 0;
      for (const p of playlists) {
        if (!editable(p.playlistId)) continue;
        const option = options?.get(p.playlistId);
        const target: Target = { ...p, title: p.title || option?.title || '' };
        if (option) target.contains = option.contains;
        p.el.style.setProperty(DND.indexVar, String(i++));
        p.el.classList.add(DND.target);
        p.el.classList.toggle(DND.has, target.contains === true);
        this.targets.push(target);
      }
      this.over = null;
      this.updateOver();
    };

    // Shown at once from the last drag, corrected by YT's answer for this track.
    const known = this.knownEditable;
    if (known) apply((id) => known.has(id));
    void queryPlaylists(this.track?.videoId ?? '').then((options) => {
      if (!options) {
        // YT could not be asked: offer every sidebar playlist, YT answers honestly on drop.
        if (!known) apply(() => true);
        return;
      }
      const byId = new Map(options.map((o) => [o.playlistId, o]));
      this.knownEditable = new Set(byId.keys());
      apply((id) => byId.has(id), byId);
    });
  }

  private hit(): Target | null {
    const { x, y } = this.pointer;
    // Entries scrolled out of the sidebar still have boxes; only its visible part counts.
    const clip = this.scroller?.getBoundingClientRect();
    if (clip && (y < clip.top || y > clip.bottom || x < clip.left || x > clip.right)) return null;
    // A little stickiness, so the highlight does not flicker at the edges.
    if (this.over) {
      const r = this.over.el.getBoundingClientRect();
      if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 4 && y <= r.bottom + 4)
        return this.over;
    }
    for (const t of this.targets) {
      const r = t.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return t;
    }
    return null;
  }

  private updateOver(): void {
    const next = this.hit();
    if (next === this.over) return;
    this.over?.el.classList.remove(DND.over);
    next?.el.classList.add(DND.over);
    this.over = next;
    this.card?.classList.toggle('over', !!next);
    this.card?.classList.toggle('has', next?.contains === true);
  }

  // ---- Frames -----------------------------------------------------------

  private trackPointer(e: PointerEvent): void {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMove) / 1000;
    const vx = (e.clientX - this.pointer.x) / dt;
    // Smoothed, so a single jumpy event does not swing the card.
    this.velocityX += (vx - this.velocityX) * Math.min(1, dt * 14);
    this.lastMove = now;
    this.pointer = { x: e.clientX, y: e.clientY };
    this.updateOver();
  }

  private loop(): void {
    if (this.frame) return;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      const keepGoing = this.step(now, dt);
      this.render();
      this.frame = keepGoing ? requestAnimationFrame(tick) : 0;
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** One frame. False when there is nothing left to animate. */
  private step(now: number, dt: number): boolean {
    const reduced = this.reducedMotion.matches;
    if (this.phase === 'drag') {
      // The lean dies down when the pointer rests.
      if (now - this.lastMove > 60) this.velocityX *= Math.exp(-dt * 10);
      this.autoScroll(dt);
      this.updateOver();
      const over = this.over;
      const goal =
        over && !reduced ? magnetize(this.pointer, over.el.getBoundingClientRect()) : this.pointer;
      if (reduced) {
        this.x.value = goal.x;
        this.y.value = goal.y;
        return true;
      }
      stepSpring(this.x, goal.x, FOLLOW, dt);
      stepSpring(this.y, goal.y, FOLLOW, dt);
      stepSpring(this.scale, over ? 1 : 1.04, SOFT, dt);
      stepSpring(
        this.tilt,
        over ? tiltFor(this.velocityX, 0, 4) : tiltFor(this.velocityX, -2),
        SOFT,
        dt,
      );
      return true;
    }
    if (this.phase === 'fly' && this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.start) / (reduced ? 160 : FLIGHT_MS));
      if (reduced) {
        if (this.card) this.card.style.opacity = String(1 - t);
      } else {
        const p = bezier(f.from, f.control, f.to, easeInOutCubic(t));
        this.x.value = p.x;
        this.y.value = p.y;
        this.scale.value = f.scale0 + (0.28 - f.scale0) * easeInCubic(t);
        this.tilt.value = f.tilt0 * (1 - t);
        if (this.card) this.card.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      }
      if (t < 1) return true;
      this.finish();
      return false;
    }
    if (this.phase === 'return') {
      if (reduced) return false; // handled by the fade in cancel()
      stepSpring(this.x, this.home.x, RETURN, dt);
      stepSpring(this.y, this.home.y, RETURN, dt);
      stepSpring(this.scale, 1, RETURN, dt);
      stepSpring(this.tilt, 0, RETURN, dt);
      const distance = Math.hypot(this.x.value - this.home.x, this.y.value - this.home.y);
      // Almost home: the row comes back while the card dissolves into it.
      if (distance < 48 && this.card && !this.card.classList.contains('fading')) {
        this.card.classList.add('fading');
        this.source?.classList.remove(DND.source);
        setTimeout(() => this.finish(), 170);
      }
      if (isSettled(this.x, this.home.x, 0.5) && isSettled(this.y, this.home.y, 0.5)) {
        this.finish();
        return false;
      }
      return this.phase === 'return';
    }
    return false;
  }

  private render(): void {
    if (!this.card) return;
    const x = this.x.value - ANCHOR;
    const y = this.y.value - ANCHOR;
    this.card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${this.tilt.value.toFixed(3)}deg) scale(${this.scale.value.toFixed(4)})`;
  }

  /** Scrolls the sidebar while the pointer rests near its top or bottom edge. */
  private autoScroll(dt: number): void {
    const box = this.scroller?.getBoundingClientRect();
    if (!this.scroller || !box) return;
    const { x, y } = this.pointer;
    if (x < box.left || x > box.right || y < box.top - 20 || y > box.bottom + 20) return;
    let speed = 0;
    if (y < box.top + SCROLL_ZONE) speed = -Math.min(1, (box.top + SCROLL_ZONE - y) / SCROLL_ZONE);
    else if (y > box.bottom - SCROLL_ZONE)
      speed = Math.min(1, (y - (box.bottom - SCROLL_ZONE)) / SCROLL_ZONE);
    if (speed) this.scroller.scrollTop += speed * speed * Math.sign(speed) * SCROLL_SPEED * dt;
  }

  // ---- End --------------------------------------------------------------

  private drop(): void {
    const target = this.over;
    const track = this.track;
    if (!target || !track) {
      if (this.sidebarPlaylists === 0) this.onReport({ result: 'unavailable' });
      this.cancel();
      return;
    }
    // The card arcs into the playlist and shrinks to the spot where the tick appears.
    const to = confirmSpot(target.el.getBoundingClientRect());
    const from = { x: this.x.value, y: this.y.value };
    this.flight = {
      from,
      control: flightControl(from, to),
      to,
      start: performance.now(),
      scale0: this.scale.value,
      tilt0: this.tilt.value,
    };
    this.phase = 'fly';
    this.card?.classList.add('flying');
    this.endHighlights(target.el);
    this.loop();

    const playlist = target.title || undefined;
    const confirm = (result: AddResult) => {
      target.el.classList.remove(DND.landing);
      if (result === 'added') {
        this.confirmOn(target.el);
        // The next drag of this track already knows.
      } else {
        this.refuseOn(target.el);
      }
      const report: PlaylistDropReport = { result };
      if (playlist) report.playlist = playlist;
      if (result === 'duplicate') {
        report.track = { playlistId: target.playlistId, videoId: track.videoId };
        this.lastDuplicate = { ...report.track, el: target.el, title: playlist };
      }
      this.onReport(report);
    };
    // Known duplicate: no request at all.
    const request: Promise<AddResult> =
      target.contains === true
        ? Promise.resolve('duplicate')
        : addToPlaylist(target.playlistId, track.videoId);
    const landed = new Promise((resolve) =>
      setTimeout(resolve, this.reducedMotion.matches ? 160 : FLIGHT_MS - 60),
    );
    void Promise.all([request, landed]).then(([result]) => confirm(result));
  }

  private cancel(): void {
    if (this.phase !== 'drag') return;
    this.phase = 'return';
    this.endHighlights();
    // The row may have moved meanwhile (YT put its lifted row back, the page scrolled).
    if (this.source) this.home = this.homeOf(this.source) ?? this.home;
    if (this.reducedMotion.matches || !this.card) {
      this.card?.classList.add('fading');
      this.source?.classList.remove(DND.source);
      setTimeout(() => this.finish(), 170);
      return;
    }
    this.card.classList.remove('over', 'has');
    this.loop();
  }

  /** Sidebar back to normal; the drop target (`landing`) stays lit until YT has answered. */
  private endHighlights(landing?: HTMLElement): void {
    document.documentElement.classList.remove(DND.dragging);
    this.setHolding(false);
    landing?.classList.add(DND.landing);
    for (const t of this.targets) {
      t.el.classList.remove(DND.target, DND.over, DND.has);
      t.el.style.removeProperty(DND.indexVar);
    }
    this.targets = [];
    this.over = null;
  }

  private finish(): void {
    if (this.phase !== 'fly' && this.phase !== 'return') return;
    this.source?.classList.remove(DND.source);
    this.card?.remove();
    this.card = null;
    this.flight = null;
    this.tookOver = false;
    this.track = null;
    this.source = null;
    this.reset();
    // The layer stays while a confirmation is showing on it.
    if (this.layer && !this.layer.childElementCount) {
      this.layer.remove();
      this.layer = null;
    }
  }

  /** A tick that draws itself at the playlist's end, and a soft pulse of the row. */
  private confirmOn(el: HTMLElement): void {
    this.pulse(el, DND.done, 900);
    const box = visibleRect(el);
    if (!box) return;
    let layer = this.layer;
    if (!layer || !layer.isConnected) {
      layer = document.createElement('div');
      layer.id = DND.root;
      document.body.append(layer);
      this.layer = layer;
    }
    const tick = document.createElement('div');
    tick.className = 'confirm';
    tick.append(tickIcon());
    const spot = confirmSpot(box);
    tick.style.left = `${Math.round(spot.x - 11)}px`;
    tick.style.top = `${Math.round(spot.y - 11)}px`;
    layer.append(tick);
    setTimeout(() => {
      tick.remove();
      if (this.layer && !this.layer.childElementCount && this.phase === 'idle') {
        this.layer.remove();
        this.layer = null;
      }
    }, 1600);
  }

  private refuseOn(el: HTMLElement): void {
    this.pulse(el, DND.nope, 450);
  }

  private pulse(el: HTMLElement, cls: string, ms: number): void {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }
}
