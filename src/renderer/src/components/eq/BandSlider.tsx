import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { formatDb } from '@shared/eq';
import { EQ_GAIN_MAX, EQ_GAIN_MIN, EQ_STEP } from '@shared/presets';

const KEY_STEPS: Record<string, number> = {
  ArrowUp: EQ_STEP,
  ArrowRight: EQ_STEP,
  ArrowDown: -EQ_STEP,
  ArrowLeft: -EQ_STEP,
  PageUp: 3,
  PageDown: -3,
};

const RANGE = EQ_GAIN_MAX - EQ_GAIN_MIN;
const clamp = (v: number) => Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, v));
const round = (v: number) => Math.round(v / EQ_STEP) * EQ_STEP;

interface Props {
  label: string;
  value: number;
  onChange(value: number): void;
}

/** Vertical band slider: drag, arrow keys ±0.5 dB, Page Up/Down ±3 dB, double-click = 0 dB. */
export function BandSlider({ label, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const percent = ((EQ_GAIN_MAX - value) / RANGE) * 100;

  const setFromPointer = (clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const v = clamp(round(EQ_GAIN_MAX - ((clientY - rect.top) / rect.height) * RANGE));
    if (v !== value) onChange(v);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setFromPointer(e.clientY);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromPointer(e.clientY);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[e.key];
    if (e.key === 'Home' || e.key === 'End') {
      onChange(e.key === 'Home' ? EQ_GAIN_MAX : EQ_GAIN_MIN);
    } else if (step !== undefined) {
      onChange(clamp(value + step));
    } else {
      return;
    }
    e.preventDefault();
  };

  return (
    <div className="band">
      <span className="val">{formatDb(value)}</span>
      <div
        ref={ref}
        className="slider"
        tabIndex={0}
        role="slider"
        aria-label={`${label} Hz`}
        aria-orientation="vertical"
        aria-valuemin={EQ_GAIN_MIN}
        aria-valuemax={EQ_GAIN_MAX}
        aria-valuenow={value}
        aria-valuetext={`${formatDb(value)} dB`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
        onDoubleClick={() => onChange(0)}
      >
        <div className="track" />
        <div className="zero" />
        <div
          className="fill"
          style={{ top: `${Math.min(percent, 50)}%`, height: `${Math.abs(percent - 50)}%` }}
        />
        <div className="thumb" style={{ top: `${percent}%` }} />
      </div>
      <span className="hz">{label}</span>
    </div>
  );
}
