import { useMemo } from 'react';
import { EQ_FREQUENCIES } from '@shared/presets';
import { CURVE_FREQS, frequencyResponse } from './response';

const W = 332;
const H = 86;
const RANGE_DB = 15;

const xForFreq = (f: number) => (Math.log(f / 20) / Math.log(1000)) * W;

export function Curve({ gains }: { gains: readonly number[] }) {
  const path = useMemo(() => {
    const db = frequencyResponse(gains);
    return db
      .map((value, i) => {
        const clamped = Math.max(-RANGE_DB, Math.min(RANGE_DB, value));
        const x = xForFreq(CURVE_FREQS[i]!);
        const y = H / 2 - (clamped / RANGE_DB) * (H / 2 - 6);
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join('');
  }, [gains]);

  return (
    <div className="curve">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {EQ_FREQUENCIES.map((f) => (
          <line
            key={f}
            x1={xForFreq(f)}
            x2={xForFreq(f)}
            y1="0"
            y2={H}
            stroke="var(--text-dim)"
            strokeOpacity=".12"
          />
        ))}
        <line
          x1="0"
          x2={W}
          y1={H / 2}
          y2={H / 2}
          stroke="var(--text-dim)"
          strokeOpacity=".3"
          strokeDasharray="3 3"
        />
        <path d={`${path} L${W} ${H} L0 ${H}Z`} fill="var(--accent)" fillOpacity=".12" />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
