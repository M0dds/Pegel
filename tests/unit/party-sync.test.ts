import { describe, expect, it } from 'vitest';
import {
  AD_WAIT_MS,
  ClockSync,
  adHoldUsers,
  correctionFor,
  estimateOffset,
  expectedPositionMs,
  makeFriendCode,
  normalizeFriendCode,
  SeekLead,
} from '@shared/party-sync';

describe('clock', () => {
  it('takes the sample with the shortest round trip', () => {
    // Server is 1000 ms ahead. Sample 2 has a slow return path (asymmetric), sample 3 is clean.
    const result = estimateOffset([
      { c0: 0, s: 1100, c1: 200 },
      { c0: 300, s: 1320, c1: 500 },
      { c0: 600, s: 1610, c1: 620 },
    ]);
    expect(result).toEqual({ offsetMs: 1000, rttMs: 20 });
  });

  it('ignores impossible samples and starts unsynced', () => {
    expect(estimateOffset([{ c0: 10, s: 5, c1: 5 }])).toBeNull();
    const clock = new ClockSync();
    expect(clock.ready).toBe(false);
    expect(clock.toLocal(5000)).toBe(5000);
  });

  it('converts between server and local time', () => {
    const clock = new ClockSync();
    clock.add({ c0: 100, s: 2110, c1: 120 }); // offset 2000
    expect(clock.toLocal(5000)).toBe(3000);
    expect(clock.toServer(3000)).toBe(5000);
    expect(clock.rttMs).toBe(20);
  });

  it('keeps only the last samples', () => {
    const clock = new ClockSync();
    clock.add({ c0: 0, s: 1005, c1: 10 }); // best, but will drop out
    for (let i = 1; i <= 8; i++) clock.add({ c0: i * 100, s: i * 100 + 1050, c1: i * 100 + 100 });
    expect(clock.rttMs).toBe(100);
  });
});

describe('expected position', () => {
  it('runs on while playing and stands still while paused', () => {
    expect(expectedPositionMs({ positionMs: 10_000, atMs: 1000, playing: true }, 1500)).toBe(
      10_500,
    );
    expect(expectedPositionMs({ positionMs: 10_000, atMs: 1000, playing: false }, 9000)).toBe(
      10_000,
    );
    // A measurement "from the future" (clock jitter) never moves backwards.
    expect(expectedPositionMs({ positionMs: 10_000, atMs: 2000, playing: true }, 1990)).toBe(
      10_000,
    );
  });
});

describe('correction', () => {
  it('leaves small drift alone', () => {
    expect(correctionFor(0)).toEqual({ kind: 'none' });
    expect(correctionFor(-29)).toEqual({ kind: 'none' });
  });

  it('slows down when ahead and speeds up when behind, at most 4 %', () => {
    expect(correctionFor(40)).toEqual({ kind: 'rate', rate: 0.98 });
    expect(correctionFor(-40)).toEqual({ kind: 'rate', rate: 1.02 });
    expect(correctionFor(500)).toEqual({ kind: 'rate', rate: 0.96 });
    expect(correctionFor(-799)).toEqual({ kind: 'rate', rate: 1.04 });
  });

  it('jumps for large drift', () => {
    expect(correctionFor(800)).toEqual({ kind: 'seek' });
    expect(correctionFor(-12_000)).toEqual({ kind: 'seek' });
  });

  it('learns how far ahead to jump', () => {
    const lead = new SeekLead(150, 0.5);
    lead.learn(-100); // landed 100 ms behind → jump further
    expect(lead.ms).toBe(200);
    lead.learn(40); // landed ahead → a bit less
    expect(lead.ms).toBe(180);
    lead.learn(Number.NaN);
    lead.learn(10_000); // nonsense samples are ignored
    expect(lead.ms).toBe(180);
  });
});

describe('ad hold', () => {
  it('waits for guests with ads up to 30 s per track', () => {
    expect(adHoldUsers(['a', 'b'], 0)).toEqual(['a', 'b']);
    expect(adHoldUsers(['a'], AD_WAIT_MS - 1)).toEqual(['a']);
    expect(adHoldUsers(['a'], AD_WAIT_MS)).toEqual([]);
  });
});

describe('friend codes', () => {
  it('formats eight Crockford characters', () => {
    const code = makeFriendCode(new Uint8Array([0, 1, 31, 32, 10, 18, 23, 27]));
    expect(code).toBe('01Z0-AJQV');
  });

  it('accepts sloppy input', () => {
    expect(normalizeFriendCode(' 01z0 ajqv ')).toBe('01Z0-AJQV');
    expect(normalizeFriendCode('oiz0-ajqv')).toBe('01Z0-AJQV'); // O→0, I→1
    expect(normalizeFriendCode('01Z0-AJQ')).toBeNull();
    expect(normalizeFriendCode('01Z0-AJQU')).toBeNull(); // U is not in the alphabet
  });
});
