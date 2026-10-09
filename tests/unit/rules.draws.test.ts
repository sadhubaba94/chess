import { describe, expect, it } from 'vitest';
import { ChessGame } from '../../src/core/rules/game';
import { play } from './helpers';

const SHUFFLE = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];

describe('repetition', () => {
  it('allows a threefold claim but does not end the game automatically', () => {
    const g = play(new ChessGame(), [...SHUFFLE, ...SHUFFLE]);
    expect(g.repetitionCount()).toBe(3);
    expect(g.canClaimThreefold()).toBe(true);
    expect(g.automaticOutcome()).toBeNull();
    expect(g.claimDraw()).toEqual({ winner: null, termination: 'threefold_repetition' });
  });

  it('cannot claim after only two occurrences', () => {
    const g = play(new ChessGame(), SHUFFLE);
    expect(g.canClaimThreefold()).toBe(false);
    expect(g.claimDraw()).toBeNull();
  });

  it('ends the game automatically on fivefold repetition', () => {
    const g = play(new ChessGame(), [...SHUFFLE, ...SHUFFLE, ...SHUFFLE, ...SHUFFLE]);
    expect(g.repetitionCount()).toBe(5);
    expect(g.automaticOutcome()).toEqual({ winner: null, termination: 'fivefold_repetition' });
  });

  it('does not treat positions with different castling rights as repetitions', () => {
    const g = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    play(g, ['Ke2', 'Ke7', 'Ke1', 'Ke8', 'Ke2', 'Ke7', 'Ke1', 'Ke8']);
    expect(g.repetitionCount()).toBe(2);
    expect(g.canClaimThreefold()).toBe(false);
  });

  it('does not treat positions with a legal en passant capture as identical to ones without', () => {
    const g = play(new ChessGame('4k3/8/8/8/5p2/8/4P3/4K1N1 w - - 0 1'), ['e4']);
    const keyWithEp = g.fen();
    expect(keyWithEp.split(' ')[3]).toBe('e3');
    play(g, ['Kd7', 'Nf3', 'Ke8', 'Ng1', 'Kd7', 'Nf3', 'Ke8', 'Ng1']);
    // Same placement and side to move as after 1.e4, but en passant is no longer possible.
    expect(g.repetitionCount()).toBe(2);
  });
});

describe('move-count rules', () => {
  it('allows a 50-move claim at 100 halfmoves', () => {
    const g = new ChessGame('7k/8/8/8/8/8/8/R6K w - - 99 80');
    expect(g.canClaimFiftyMoves()).toBe(false);
    g.moveSan('Ra2');
    expect(g.halfmoveClock()).toBe(100);
    expect(g.canClaimFiftyMoves()).toBe(true);
    expect(g.automaticOutcome()).toBeNull();
    expect(g.claimDraw()).toEqual({ winner: null, termination: 'fifty_moves' });
  });

  it('resets the halfmove clock on pawn moves and captures', () => {
    const g = new ChessGame('4k3/8/8/8/8/8/4P3/4K2R w - - 60 80');
    g.moveSan('Rh2');
    expect(g.halfmoveClock()).toBe(61);
    g.moveSan('Kd7');
    g.moveSan('e4');
    expect(g.halfmoveClock()).toBe(0);
  });

  it('ends the game automatically at 150 halfmoves (75-move rule)', () => {
    const g = new ChessGame('7k/8/8/8/8/8/8/R6K w - - 149 120');
    g.moveSan('Ra2');
    expect(g.automaticOutcome()).toEqual({ winner: null, termination: 'seventyfive_moves' });
  });

  it('gives checkmate precedence over the 75-move rule', () => {
    const g = new ChessGame('7k/8/6K1/8/8/8/8/R7 w - - 149 120');
    g.moveSan('Ra8#');
    expect(g.halfmoveClock()).toBe(150);
    expect(g.automaticOutcome()).toEqual({ winner: 'w', termination: 'checkmate' });
  });
});

describe('dead positions (insufficient material)', () => {
  const cases: [string, string, boolean][] = [
    ['K v K', '8/8/4k3/8/8/4K3/8/8 w - - 0 1', true],
    ['K+N v K', '8/8/4k3/8/8/4K3/8/6N1 w - - 0 1', true],
    ['K+B v K', '8/8/4k3/8/8/4K3/8/2B5 w - - 0 1', true],
    ['K+B v K+B same colour', '5b2/8/4k3/8/8/4K3/8/2B5 w - - 0 1', true],
    ['K+B v K+B opposite colour', '2b5/8/4k3/8/8/4K3/8/2B5 w - - 0 1', false],
    ['K+N+N v K', '8/8/4k3/8/8/4K3/8/1N4N1 w - - 0 1', false],
    ['K+P v K', '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', false],
    ['K+R v K', '8/8/4k3/8/8/4K3/8/7R w - - 0 1', false],
  ];
  for (const [name, fen, insufficient] of cases) {
    it(`${name}: ${insufficient ? 'draw' : 'play continues'}`, () => {
      const g = new ChessGame(fen);
      expect(g.isInsufficientMaterial()).toBe(insufficient);
      expect(g.automaticOutcome()?.termination === 'insufficient_material').toBe(insufficient);
    });
  }

  it('a lone knight can still win when the opponent has blocking material', () => {
    const g = new ChessGame('8/8/4k3/4p3/8/4K3/8/6N1 w - - 0 1');
    expect(g.hasInsufficientMaterial('w')).toBe(false);
    expect(g.hasInsufficientMaterial('b')).toBe(false);
  });
});

describe('timeout outcomes', () => {
  it('the opponent wins on time when they have mating material', () => {
    const g = new ChessGame('4k3/8/8/8/8/8/8/3QK3 b - - 0 1');
    expect(g.timeoutResult('b')).toEqual({ winner: 'w', termination: 'timeout' });
  });

  it('is a draw when the opponent cannot possibly checkmate', () => {
    const g = new ChessGame('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    expect(g.timeoutResult('w')).toEqual({ winner: null, termination: 'timeout_insufficient_material' });
    const h = new ChessGame('4k3/8/8/8/8/8/8/2N1K2R w - - 0 1');
    // Black flags; White (rook) can mate.
    expect(h.timeoutResult('b').winner).toBe('w');
  });
});
