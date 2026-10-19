import { toPlayerState } from '@shared/player';
import type { PlayerState } from '@shared/types';

let current: PlayerState | null = null;
let selectorIssues: string[] = [];
const stateListeners = new Set<(state: PlayerState | null) => void>();
const issueListeners = new Set<(issues: string[]) => void>();

export function getPlayerState(): PlayerState | null {
  return current;
}

export function getSelectorIssues(): string[] {
  return selectorIssues;
}

/** Called with what the YT preload reports; invalid states are ignored. */
export function setPlayerState(raw: unknown): void {
  const state = toPlayerState(raw);
  if (!state) return;
  current = state;
  for (const listener of stateListeners) listener(state);
}

/** The YT page is gone (reload, offline): nothing is known about playback. */
export function clearPlayerState(): void {
  if (!current) return;
  current = null;
  for (const listener of stateListeners) listener(null);
}

export function setSelectorIssues(raw: unknown): void {
  if (!Array.isArray(raw)) return;
  selectorIssues = raw.filter((f): f is string => typeof f === 'string').slice(0, 20);
  for (const listener of issueListeners) listener(selectorIssues);
}

export function onPlayerState(listener: (state: PlayerState | null) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function onSelectorIssues(listener: (issues: string[]) => void): () => void {
  issueListeners.add(listener);
  return () => issueListeners.delete(listener);
}
