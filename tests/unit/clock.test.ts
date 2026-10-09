import { describe, expect, it } from 'vitest';
import {
  afterMove,
  createClock,
  flaggedAt,
  formatClock,
  isPaused,
  msUntilFlag,
  pauseClock,
  remainingAt,
  resumeClock,
  stopClock,
  timeControlLabel,
  timeControlPgn,
} from '../../src/core/clock';

const T0 = 1_000_000;

describe('clock', () => {
  it('untimed clocks never run or flag', () => {
    const c = createClock({ minutes: null, incrementSeconds: 5 });
    expect(c.incrementMs).toBe(0);
    expect(afterMove(c, 'w', T0, false)).toBe(c);
    expect(remainingAt(c, 'w', T0)).toBe(Infinity);
    expect(flaggedAt(c, T0 + 1e9)).toBeNull();
  });

  it('starts after the first move and only runs for the side to move', () => {
    let c = createClock({ minutes: 3, incrementSeconds: 2 });
    expect(c.running).toBeNull();
    c = afterMove(c, 'w', T0, false);
    expect(c.running).toBe('b');
    expect(c.remaining.w).toBe(180_000);
    expect(remainingAt(c, 'b', T0 + 4_000)).toBe(176_000);
    expect(remainingAt(c, 'w', T0 + 4_000)).toBe(180_000);
  });

  it('deducts elapsed time and adds the increment after each completed move', () => {
    let c = createClock({ minutes: 3, incrementSeconds: 2 });
    c = afterMove(c, 'w', T0, false);
    c = afterMove(c, 'b', T0 + 5_000, false);
    expect(c.remaining.b).toBe(180_000 - 5_000 + 2_000);
    expect(c.running).toBe('w');
    c = afterMove(c, 'w', T0 + 12_500, false);
    expect(c.remaining.w).toBe(180_000 - 7_500 + 2_000);
  });

  it('uses timestamps, so long gaps (background tabs) are measured exactly', () => {
    let c = createClock({ minutes: 1, incrementSeconds: 0 });
    c = afterMove(c, 'w', T0, false);
    expect(remainingAt(c, 'b', T0 + 59_999)).toBe(1);
    expect(flaggedAt(c, T0 + 59_999)).toBeNull();
    expect(flaggedAt(c, T0 + 60_000)).toBe('b');
    expect(msUntilFlag(c, T0 + 30_000)).toBe(30_000);
  });

  it('does not add increment to a flagged player', () => {
    let c = createClock({ minutes: 1, incrementSeconds: 10 });
    c = afterMove(c, 'w', T0, false);
    c = afterMove(c, 'b', T0 + 61_000, false);
    expect(c.remaining.b).toBe(0);
  });

  it('pauses and resumes without losing time', () => {
    let c = createClock({ minutes: 5, incrementSeconds: 0 });
    c = afterMove(c, 'w', T0, false);
    c = pauseClock(c, T0 + 10_000);
    expect(isPaused(c)).toBe(true);
    expect(c.running).toBeNull();
    expect(remainingAt(c, 'b', T0 + 999_999)).toBe(290_000);
    c = resumeClock(c, T0 + 500_000);
    expect(remainingAt(c, 'b', T0 + 501_000)).toBe(289_000);
  });

  it('stops on game end', () => {
    let c = createClock({ minutes: 5, incrementSeconds: 3 });
    c = afterMove(c, 'w', T0, false);
    c = afterMove(c, 'b', T0 + 1_000, true);
    expect(c.running).toBeNull();
    expect(c.remaining.b).toBe(302_000);
    c = afterMove(createClock({ minutes: 5, incrementSeconds: 0 }), 'w', T0, false);
    c = stopClock(c, T0 + 2_000);
    expect(c.remaining.b).toBe(298_000);
  });

  it('formats times and labels', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(61_001)).toBe('1:02');
    expect(formatClock(9_450)).toBe('0:09.4');
    expect(formatClock(-5)).toBe('0:00.0');
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(timeControlLabel({ minutes: 3, incrementSeconds: 2 })).toBe('3 min + 2 s');
    expect(timeControlLabel({ minutes: null, incrementSeconds: 0 })).toBe('Untimed');
    expect(timeControlPgn({ minutes: 10, incrementSeconds: 0 })).toBe('600');
    expect(timeControlPgn({ minutes: 1, incrementSeconds: 1 })).toBe('60+1');
  });
});
