/**
 * Pure sync maths for the listening party (no I/O, unit-tested):
 * the shared clock, where the party is right now, and how a guest corrects.
 */

/** One ping round trip: client send time, server time, client receive time. */
export interface ClockSample {
  c0: number;
  s: number;
  c1: number;
}

/** How many recent samples the clock keeps; the one with the shortest round trip wins. */
export const CLOCK_SAMPLES = 8;

/**
 * Offset = server time − client time. The sample with the smallest round trip
 * has the least queueing delay, so its midpoint estimate is the most precise.
 */
export function estimateOffset(
  samples: readonly ClockSample[],
): { offsetMs: number; rttMs: number } | null {
  let best: ClockSample | null = null;
  for (const sample of samples) {
    if (sample.c1 < sample.c0) continue;
    if (!best || sample.c1 - sample.c0 < best.c1 - best.c0) best = sample;
  }
  if (!best) return null;
  const rttMs = best.c1 - best.c0;
  return { offsetMs: best.s - (best.c0 + rttMs / 2), rttMs };
}

/** Keeps the last samples and the current offset. */
export class ClockSync {
  private samples: ClockSample[] = [];
  private estimate: { offsetMs: number; rttMs: number } | null = null;

  add(sample: ClockSample): void {
    this.samples.push(sample);
    if (this.samples.length > CLOCK_SAMPLES) this.samples.shift();
    this.estimate = estimateOffset(this.samples);
  }

  get ready(): boolean {
    return this.estimate !== null;
  }

  get rttMs(): number | null {
    return this.estimate?.rttMs ?? null;
  }

  /** Server time → local time. Without samples the clocks are assumed equal. */
  toLocal(serverMs: number): number {
    return serverMs - (this.estimate?.offsetMs ?? 0);
  }

  toServer(localMs: number): number {
    return localMs + (this.estimate?.offsetMs ?? 0);
  }

  reset(): void {
    this.samples = [];
    this.estimate = null;
  }
}

/** Where the party is at `nowMs`, given a position measured at `atMs` (same clock). */
export function expectedPositionMs(
  target: { positionMs: number; atMs: number; playing: boolean },
  nowMs: number,
): number {
  if (!target.playing) return target.positionMs;
  return target.positionMs + Math.max(0, nowMs - target.atMs);
}

/** Below this the guest counts as in sync and nothing is touched. */
export const SYNC_TOLERANCE_MS = 30;
/** From here on a jump is quicker (and less audible) than catching up via tempo. */
export const SEEK_THRESHOLD_MS = 800;
/** Tempo correction never goes further than ±4 %. */
export const MAX_RATE_DELTA = 0.04;
/** The tempo is chosen so the gap closes in about this time. */
export const CATCH_UP_MS = 2000;

export type Correction = { kind: 'none' } | { kind: 'rate'; rate: number } | { kind: 'seek' };

/**
 * `driftMs` = own position − party position. Positive: ahead, so slow down.
 * Within the tolerance the rate returns to 1.
 */
export function correctionFor(driftMs: number): Correction {
  const abs = Math.abs(driftMs);
  if (abs < SYNC_TOLERANCE_MS) return { kind: 'none' };
  if (abs >= SEEK_THRESHOLD_MS) return { kind: 'seek' };
  const delta = Math.max(-MAX_RATE_DELTA, Math.min(MAX_RATE_DELTA, driftMs / CATCH_UP_MS));
  return { kind: 'rate', rate: Math.round((1 - delta) * 1000) / 1000 };
}

/**
 * How long a jump takes until the media plays again. Learned as a moving
 * average so a guest jumps a bit ahead and lands on the party's position.
 */
export class SeekLead {
  private value: number;

  constructor(
    initialMs = 150,
    private readonly weight = 0.3,
    private readonly maxMs = 1500,
  ) {
    this.value = initialMs;
  }

  get ms(): number {
    return this.value;
  }

  /** `missMs`: drift right after a jump (negative: landed behind, jump further next time). */
  learn(missMs: number): void {
    if (!Number.isFinite(missMs) || Math.abs(missMs) > 3000) return;
    const next = this.value - missMs;
    this.value = Math.max(0, Math.min(this.maxMs, this.value + this.weight * (next - this.value)));
  }
}

/** Longest time the party waits per track for guests watching an ad. */
export const AD_WAIT_MS = 30_000;

/**
 * Host side: should the party hold for guests with an ad? `adUsers` are the
 * guests that currently see one; `waitedMs` is how long the party already
 * held during this track. Returns the users to wait for (empty: go on).
 */
export function adHoldUsers(adUsers: readonly string[], waitedMs: number): string[] {
  return waitedMs < AD_WAIT_MS ? [...adUsers] : [];
}

// ---------- Friend codes ----------

/** Crockford base32: no I, L, O, U, so codes read and type unambiguously. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;

/** A fresh code from random bytes, formatted `XXXX-XXXX`. */
export function makeFriendCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < CODE_LENGTH) throw new Error('need 8 random bytes');
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomBytes[i]! & 31];
  return formatFriendCode(code);
}

/**
 * Normalises what someone typed: case, spaces and dashes do not matter, and
 * the letters that look like digits count as those digits. Null if invalid.
 */
export function normalizeFriendCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;
  return formatFriendCode(cleaned);
}

function formatFriendCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
