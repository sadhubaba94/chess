import { describe, expect, it } from 'vitest';
import { createGameRecord, isEngineTurn, reduceGame, replay, undoPlies, type GameConfig, type GameRecord } from '../../src/core/session';

const T0 = 5_000_000;
const local: GameConfig = { mode: 'local', humanColor: 'w', difficulty: 'easy', timeControl: { minutes: null, incrementSeconds: 0 } };
const vsEngine: GameConfig = { ...local, mode: 'computer', difficulty: 'hard' };
const timed: GameConfig = { ...local, timeControl: { minutes: 1, incrementSeconds: 1 } };

function make(config: GameConfig, extra: Partial<Parameters<typeof createGameRecord>[1]> = {}): GameRecord {
  return createGameRecord(config, { id: 'test-game-1', now: T0, ...extra });
}

function moves(record: GameRecord, ucis: string[], start = T0): GameRecord {
  let r = record;
  ucis.forEach((uci, i) => {
    const next = reduceGame(r, { type: 'move', uci, now: start + (i + 1) * 1000 });
    if (next === r) throw new Error(`move ${uci} rejected`);
    r = next;
  });
  return r;
}

describe('game state transitions', () => {
  it('applies legal moves and ignores illegal ones without mutating state', () => {
    const r0 = make(local);
    const r1 = reduceGame(r0, { type: 'move', uci: 'e2e4', now: T0 + 1 });
    expect(r1.moves).toEqual(['e2e4']);
    expect(r0.moves).toEqual([]);
    expect(reduceGame(r1, { type: 'move', uci: 'e2e4', now: T0 + 2 })).toBe(r1);
    expect(reduceGame(r1, { type: 'move', uci: 'garbage', now: T0 + 2 })).toBe(r1);
  });

  it('records checkmate and refuses further moves', () => {
    const r = moves(make(local), ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(r.result).toEqual({ winner: 'b', termination: 'checkmate' });
    expect(reduceGame(r, { type: 'move', uci: 'a2a3', now: T0 + 9e3 })).toBe(r);
  });

  it('undoes one ply in local mode', () => {
    const r = moves(make(local), ['e2e4', 'e7e5']);
    expect(undoPlies(r, replay(r))).toBe(1);
    expect(reduceGame(r, { type: 'undo', now: T0 }).moves).toEqual(['e2e4']);
  });

  it('undoes the engine reply and the human move together against the computer', () => {
    const r = moves(make(vsEngine), ['e2e4', 'e7e5']);
    expect(undoPlies(r, replay(r))).toBe(2);
    expect(reduceGame(r, { type: 'undo', now: T0 }).moves).toEqual([]);
    const thinking = moves(make(vsEngine), ['e2e4']);
    expect(isEngineTurn(thinking, replay(thinking))).toBe(true);
    expect(reduceGame(thinking, { type: 'undo', now: T0 }).moves).toEqual([]);
  });

  it('does not undo the engine first move when the human plays Black', () => {
    const r = moves(make({ ...vsEngine, humanColor: 'b' }), ['e2e4']);
    expect(undoPlies(r, replay(r))).toBe(0);
    expect(reduceGame(r, { type: 'undo', now: T0 })).toBe(r);
  });

  it('disables undo in timed games and after resignation', () => {
    const t = moves(make(timed), ['e2e4']);
    expect(undoPlies(t, replay(t))).toBe(0);
    const resigned = reduceGame(moves(make(local), ['e2e4']), { type: 'resign', color: 'b', now: T0 });
    expect(undoPlies(resigned, replay(resigned))).toBe(0);
  });

  it('undo after checkmate reopens the game', () => {
    const r = moves(make(local), ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const u = reduceGame(r, { type: 'undo', now: T0 });
    expect(u.result).toBeNull();
    expect(u.moves).toHaveLength(3);
  });

  it('handles resignation', () => {
    const r = reduceGame(make(local), { type: 'resign', color: 'w', now: T0 });
    expect(r.result).toEqual({ winner: 'b', termination: 'resignation' });
    expect(reduceGame(r, { type: 'resign', color: 'b', now: T0 })).toBe(r);
  });

  it('handles draw offers in local mode only', () => {
    const r = reduceGame(make(local), { type: 'offerDraw', color: 'w' });
    expect(r.drawOffer).toBe('w');
    expect(reduceGame(r, { type: 'acceptDraw', now: T0 }).result).toEqual({ winner: null, termination: 'agreement' });
    expect(reduceGame(r, { type: 'declineDraw' }).drawOffer).toBeNull();
    const vs = make(vsEngine);
    expect(reduceGame(vs, { type: 'offerDraw', color: 'w' })).toBe(vs);
  });

  it('an offer lapses when the opponent moves instead of accepting', () => {
    let r = moves(make(local), ['e2e4']);
    r = reduceGame(r, { type: 'offerDraw', color: 'b' });
    r = reduceGame(r, { type: 'move', uci: 'e7e5', now: T0 + 10_000 });
    expect(r.drawOffer).toBe('b');
    r = reduceGame(r, { type: 'move', uci: 'g1f3', now: T0 + 11_000 });
    expect(r.drawOffer).toBeNull();
  });

  it('allows claiming a threefold repetition only when eligible', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const two = moves(make(local), shuffle);
    expect(reduceGame(two, { type: 'claimDraw', now: T0 })).toBe(two);
    const three = moves(make(local), [...shuffle, ...shuffle]);
    expect(reduceGame(three, { type: 'claimDraw', now: T0 }).result).toEqual({ winner: null, termination: 'threefold_repetition' });
  });

  it('restart clears moves, result and clocks', () => {
    const r = moves(make(timed), ['e2e4', 'e7e5']);
    const restarted = reduceGame(r, { type: 'restart', now: T0 + 50_000 });
    expect(restarted.moves).toEqual([]);
    expect(restarted.clock.remaining).toEqual({ w: 60_000, b: 60_000 });
    expect(restarted.clock.running).toBeNull();
  });
});

describe('clocks inside the game state', () => {
  it('switches clocks and applies increments', () => {
    let r = make(timed);
    r = reduceGame(r, { type: 'move', uci: 'e2e4', now: T0 });
    expect(r.clock.running).toBe('b');
    r = reduceGame(r, { type: 'move', uci: 'e7e5', now: T0 + 3_000 });
    expect(r.clock.remaining.b).toBe(60_000 - 3_000 + 1_000);
    expect(r.clock.running).toBe('w');
  });

  it('declares a timeout when the flag falls', () => {
    let r = moves(make(timed), ['e2e4'], T0 - 1000);
    expect(reduceGame(r, { type: 'flag', now: T0 + 59_000 })).toBe(r);
    r = reduceGame(r, { type: 'flag', now: T0 + 60_001 });
    expect(r.result).toEqual({ winner: 'w', termination: 'timeout' });
    expect(r.clock.remaining.b).toBe(0);
  });

  it('a move submitted after the flag fell loses on time', () => {
    const r = moves(make(timed), ['e2e4'], T0 - 1000);
    const late = reduceGame(r, { type: 'move', uci: 'e7e5', now: T0 + 70_000 });
    expect(late.result?.termination).toBe('timeout');
    expect(late.moves).toEqual(['e2e4']);
  });

  it('timeout is a draw when the opponent cannot checkmate', () => {
    let r = make(timed, { startFen: '4k3/8/8/8/8/8/8/3QK3 b - - 0 1' });
    r = reduceGame(r, { type: 'move', uci: 'e8f7', now: T0 });
    r = reduceGame(r, { type: 'flag', now: T0 + 61_000 });
    expect(r.result).toEqual({ winner: null, termination: 'timeout_insufficient_material' });
  });

  it('blocks moves while paused and resumes cleanly', () => {
    let r = moves(make(timed), ['e2e4'], T0 - 1000);
    r = reduceGame(r, { type: 'pause', now: T0 + 2_000 });
    expect(reduceGame(r, { type: 'move', uci: 'e7e5', now: T0 + 3_000 }).moves).toEqual(['e2e4']);
    r = reduceGame(r, { type: 'resume', now: T0 + 100_000 });
    r = reduceGame(r, { type: 'move', uci: 'e7e5', now: T0 + 101_000 });
    expect(r.clock.remaining.b).toBe(60_000 - 2_000 - 1_000 + 1_000);
  });
});
