import type { Color } from './types';

/**
 * Chess clock as pure data + pure functions. Time is always derived from
 * wall-clock timestamps (Date.now()), never from counting interval ticks, so the
 * clock stays exact when the tab is backgrounded or timers are throttled.
 */
export interface ClockState {
  /** null = untimed game. */
  initialMs: number | null;
  incrementMs: number;
  /** Remaining time committed at the start of the current turn. */
  remaining: Record<Color, number>;
  /** The colour whose clock is running, or null when stopped/paused. */
  running: Color | null;
  /** Wall-clock timestamp (ms) when `running` started. */
  startedAt: number | null;
  /** The colour whose clock should run when resumed after a pause. */
  pausedFor: Color | null;
}

export interface TimeControl {
  /** Minutes per player; null = untimed. */
  minutes: number | null;
  incrementSeconds: number;
}

export const TIME_CONTROL_MINUTES = [null, 1, 3, 5, 10, 15] as const;
export const INCREMENT_SECONDS = [0, 1, 2, 3, 5, 10] as const;

export function createClock(tc: TimeControl): ClockState {
  const initialMs = tc.minutes === null ? null : tc.minutes * 60_000;
  return {
    initialMs,
    incrementMs: tc.minutes === null ? 0 : tc.incrementSeconds * 1000,
    remaining: { w: initialMs ?? 0, b: initialMs ?? 0 },
    running: null,
    startedAt: null,
    pausedFor: null,
  };
}

export function isTimed(clock: ClockState): boolean {
  return clock.initialMs !== null;
}

/** Remaining time for `color` at wall time `now`. */
export function remainingAt(clock: ClockState, color: Color, now: number): number {
  if (!isTimed(clock)) return Infinity;
  const base = clock.remaining[color];
  if (clock.running === color && clock.startedAt !== null) {
    return Math.max(0, base - Math.max(0, now - clock.startedAt));
  }
  return Math.max(0, base);
}

/** The colour whose flag has fallen at `now`, if any. */
export function flaggedAt(clock: ClockState, now: number): Color | null {
  if (!isTimed(clock) || !clock.running) return null;
  return remainingAt(clock, clock.running, now) <= 0 ? clock.running : null;
}

/** Milliseconds until the running side's flag falls (for scheduling a precise timeout). */
export function msUntilFlag(clock: ClockState, now: number): number | null {
  if (!isTimed(clock) || !clock.running) return null;
  return remainingAt(clock, clock.running, now);
}

/**
 * Called after `mover` completes a move. Deducts elapsed time, adds the increment
 * (only if the mover had time left) and starts the opponent's clock.
 * The very first move of the game only starts the opponent's clock (no deduction, no increment).
 */
export function afterMove(clock: ClockState, mover: Color, now: number, gameOver: boolean): ClockState {
  if (!isTimed(clock)) return clock;
  const opponent: Color = mover === 'w' ? 'b' : 'w';
  const remaining = { ...clock.remaining };
  if (clock.running === mover) {
    remaining[mover] = remainingAt(clock, mover, now);
    // Increment is earned only for moves made while the mover's clock was running.
    if (remaining[mover] > 0) remaining[mover] += clock.incrementMs;
  }
  if (gameOver) {
    return { ...clock, remaining, running: null, startedAt: null, pausedFor: null };
  }
  if (clock.pausedFor) {
    return { ...clock, remaining, running: null, startedAt: null, pausedFor: opponent };
  }
  return { ...clock, remaining, running: opponent, startedAt: now, pausedFor: null };
}

/** Stops the clock permanently (game over), committing elapsed time. */
export function stopClock(clock: ClockState, now: number): ClockState {
  if (!isTimed(clock)) return clock;
  const remaining = { ...clock.remaining };
  if (clock.running) remaining[clock.running] = remainingAt(clock, clock.running, now);
  return { ...clock, remaining, running: null, startedAt: null, pausedFor: null };
}

/** Pauses the running clock (used on page hide / refresh). */
export function pauseClock(clock: ClockState, now: number): ClockState {
  if (!isTimed(clock) || !clock.running) return clock;
  const remaining = { ...clock.remaining };
  remaining[clock.running] = remainingAt(clock, clock.running, now);
  return { ...clock, remaining, running: null, startedAt: null, pausedFor: clock.running };
}

export function resumeClock(clock: ClockState, now: number): ClockState {
  if (!isTimed(clock) || !clock.pausedFor) return clock;
  return { ...clock, running: clock.pausedFor, startedAt: now, pausedFor: null };
}

export function isPaused(clock: ClockState): boolean {
  return clock.pausedFor !== null;
}

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return '∞';
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    const s = Math.floor(clamped / 1000);
    const tenths = Math.floor((clamped % 1000) / 100);
    return `0:0${s}.${tenths}`;
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function timeControlLabel(tc: TimeControl): string {
  if (tc.minutes === null) return 'Untimed';
  return `${tc.minutes} min${tc.incrementSeconds ? ` + ${tc.incrementSeconds} s` : ''}`;
}

/** PGN TimeControl tag value (seconds + increment) or "-" when untimed. */
export function timeControlPgn(tc: TimeControl): string {
  if (tc.minutes === null) return '-';
  return `${tc.minutes * 60}${tc.incrementSeconds ? `+${tc.incrementSeconds}` : ''}`;
}
