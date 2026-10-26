/**
 * Motion maths for the drag card: damped springs, the drop flight and the
 * magnetic pull. Pure, so it is tested without a page.
 */

export interface SpringConfig {
  /** Pull towards the target (per unit mass). Higher = snappier. */
  stiffness: number;
  /** Friction. `2 * sqrt(stiffness)` is critically damped (no overshoot). */
  damping: number;
}

export interface Spring {
  value: number;
  velocity: number;
}

/** Fixed internal step, so the motion is the same at 60, 120 or 144 Hz. */
const STEP_S = 1 / 240;

/** Frames longer than this (tab in the background, a hitch) are not caught up. */
const MAX_DT_S = 1 / 20;

/** Advances a spring towards `target` by `dt` seconds (semi-implicit Euler). */
export function stepSpring(spring: Spring, target: number, config: SpringConfig, dt: number): void {
  let left = Math.min(Math.max(dt, 0), MAX_DT_S);
  while (left > 1e-9) {
    const h = Math.min(STEP_S, left);
    const accel = -config.stiffness * (spring.value - target) - config.damping * spring.velocity;
    spring.velocity += accel * h;
    spring.value += spring.velocity * h;
    left -= h;
  }
}

export function isSettled(spring: Spring, target: number, epsilon = 0.01): boolean {
  return Math.abs(spring.value - target) < epsilon && Math.abs(spring.velocity) < epsilon * 10;
}

/** Damping ratio 1: as fast as possible without overshoot. */
export function criticalDamping(stiffness: number): number {
  return 2 * Math.sqrt(stiffness);
}

/** Card following the pointer: quick, with only a hint of overshoot. */
export const FOLLOW: SpringConfig = { stiffness: 620, damping: 0.86 * criticalDamping(620) };
/** Lift, tilt and the badge: a little softer, a little bounce. */
export const SOFT: SpringConfig = { stiffness: 360, damping: 0.72 * criticalDamping(360) };
/** Cancelled drag: back to where the track came from. */
export const RETURN: SpringConfig = { stiffness: 260, damping: 0.8 * criticalDamping(260) };

export interface Point {
  x: number;
  y: number;
}

/**
 * Where the card is drawn while over a drop target: the pointer, pulled a
 * little into the target's lane (vertically more than horizontally), so the
 * card visibly "locks onto" the playlist without leaving the cursor behind.
 */
export function magnetize(
  pointer: Point,
  target: { left: number; top: number; width: number; height: number },
  strength = 0.45,
): Point {
  const cy = target.top + target.height / 2;
  return {
    x: pointer.x,
    y: pointer.y + (cy - pointer.y) * strength,
  };
}

/** Quadratic Bézier between `a` and `b` with control point `c`. */
export function bezier(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

/**
 * Control point for the drop flight: lifted above the straight line, so the
 * card arcs into the playlist instead of sliding.
 */
export function flightControl(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const lift = Math.min(90, distance * 0.35);
  return { x: from.x + dx * 0.5, y: Math.min(from.y, to.y) + dy * 0.2 - lift };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Tilt of the card from its horizontal speed (px/s): leans into the motion, at most ±`max`°. */
export function tiltFor(velocityX: number, base: number, max = 7): number {
  const lean = Math.max(-max, Math.min(max, velocityX / 160));
  return base + lean;
}
