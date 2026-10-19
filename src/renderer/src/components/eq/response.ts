import { approximateResponse, bandFilterType, curveFrequencies } from '@shared/eq';
import { EQ_FREQUENCIES, EQ_Q } from '@shared/presets';

export const CURVE_POINTS = 128;
export const CURVE_FREQS = curveFrequencies(CURVE_POINTS);

let filters: BiquadFilterNode[] | null = null;

/** Same filters as the audio engine, on an offline context (never plays anything). */
function getFilters(): BiquadFilterNode[] {
  if (filters) return filters;
  const ctx = new OfflineAudioContext(1, 1, 48000);
  filters = EQ_FREQUENCIES.map((frequency, i) => {
    const filter = ctx.createBiquadFilter();
    filter.type = bandFilterType(i);
    filter.frequency.value = frequency;
    filter.Q.value = EQ_Q;
    return filter;
  });
  return filters;
}

/**
 * Real total response in dB from BiquadFilterNode.getFrequencyResponse.
 * Falls back to the mockup's approximation if Web Audio is unavailable.
 */
export function frequencyResponse(gains: readonly number[]): number[] {
  try {
    const nodes = getFilters();
    const total = new Float32Array(CURVE_POINTS);
    const mag = new Float32Array(CURVE_POINTS);
    const phase = new Float32Array(CURVE_POINTS);
    nodes.forEach((filter, i) => {
      filter.gain.value = gains[i] ?? 0;
      filter.getFrequencyResponse(CURVE_FREQS, mag, phase);
      for (let p = 0; p < CURVE_POINTS; p++) total[p]! += 20 * Math.log10(mag[p]!);
    });
    return Array.from(total);
  } catch {
    return approximateResponse(gains, CURVE_FREQS);
  }
}
