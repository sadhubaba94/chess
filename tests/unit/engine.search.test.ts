import { describe, expect, it } from 'vitest';
import { ChessGame } from '../../src/core/rules/game';
import { DIFFICULTIES } from '../../src/core/session';
import { LEVELS, budgetForMove } from '../../src/engine/levels';
import { MATE, evaluate, searchBestMove } from '../../src/engine/search';
import { Position } from '../../src/core/rules/position';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const POSITIONS: { name: string; fen: string; moves?: string[] }[] = [
  { name: 'start (engine White)', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'after 1.e4 (engine Black)', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: ['e2e4'] },
  { name: 'Kiwipete middlegame', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' },
  { name: 'rook endgame (Black)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 0 1' },
  { name: 'promotion race', fen: '8/P6k/8/8/8/8/6Kp/8 w - - 0 1' },
];

describe('engine produces legal moves at every level', () => {
  for (const difficulty of DIFFICULTIES) {
    for (const p of POSITIONS) {
      it(`${difficulty}: ${p.name}`, () => {
        const level = LEVELS[difficulty];
        const result = searchBestMove(p.fen, p.moves ?? [], level, { timeLimitMs: Math.min(level.moveTimeMs, 600), random: seeded(7) });
        const game = ChessGame.fromUciMoves(p.fen, p.moves ?? []);
        expect(game.legalMoves().map((m) => m.uci)).toContain(result.bestMove);
      });
    }
  }
});

describe('engine strength characteristics', () => {
  it('Medium, Hard and Expert find mate in one', () => {
    for (const d of ['medium', 'hard', 'expert'] as const) {
      const r1 = searchBestMove('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', [], LEVELS[d], { timeLimitMs: 800, random: seeded(1) });
      expect(r1.bestMove, d).toBe('d1d8');
      expect(r1.score).toBeGreaterThan(MATE - 10);
      const r2 = searchBestMove('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', [], LEVELS[d], { timeLimitMs: 800, random: seeded(2) });
      expect(r2.bestMove, d).toBe('h5f7');
    }
  });

  it('Hard and Expert find a forced mate in two', () => {
    // Back-rank mate in two (verified with python-chess): 1.Re8+ Rxe8 2.Rxe8#
    const fen = '2r3k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1';
    for (const d of ['hard', 'expert'] as const) {
      const r = searchBestMove(fen, [], LEVELS[d], { timeLimitMs: 1500 });
      expect(r.bestMove, d).toBe('e2e8');
      expect(r.score, d).toBeGreaterThan(MATE - 10);
    }
  });

  it('Hard and Expert win a hanging queen', () => {
    for (const d of ['hard', 'expert'] as const) {
      const r = searchBestMove('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', [], LEVELS[d], { timeLimitMs: 800 });
      expect(r.bestMove, d).toBe('d2d5');
    }
  });

  it('Easy varies its choices with randomness while Expert is deterministic', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const easy = new Set<string>();
    for (let s = 1; s <= 12; s++) easy.add(searchBestMove(fen, [], LEVELS.easy, { timeLimitMs: 400, random: seeded(s) }).bestMove);
    expect(easy.size).toBeGreaterThan(2);
    const hard = new Set<string>();
    for (let s = 1; s <= 3; s++) hard.add(searchBestMove(fen, [], LEVELS.hard, { timeLimitMs: 5000, random: seeded(s) }).bestMove);
    expect(hard.size).toBe(1);
  });

  it('levels are configured with increasing search effort', () => {
    const depth = DIFFICULTIES.map((d) => LEVELS[d].maxDepth);
    const time = DIFFICULTIES.map((d) => LEVELS[d].moveTimeMs);
    expect(depth).toEqual([...depth].sort((a, b) => a - b));
    expect(time).toEqual([...time].sort((a, b) => a - b));
    expect(LEVELS.easy.blunderChance).toBeGreaterThan(LEVELS.medium.blunderChance);
    expect(LEVELS.hard.blunderChance).toBe(0);
    expect(LEVELS.expert.nullMovePruning && LEVELS.expert.lateMoveReductions).toBe(true);
  });

  it('respects the time limit', () => {
    const start = Date.now();
    const r = searchBestMove('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [], LEVELS.expert, { timeLimitMs: 300 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1500);
    expect(r.depth).toBeGreaterThanOrEqual(1);
  });

  it('returns the only legal move immediately', () => {
    const start = Date.now();
    const only = searchBestMove('7k/8/8/8/8/8/6q1/7K w - - 0 1', [], LEVELS.expert, { timeLimitMs: 3000 });
    expect(only.bestMove).toBe('h1g2');
    expect(only.depth).toBe(0);
    expect(Date.now() - start).toBeLessThan(500);
    const evasion = searchBestMove('4k3/8/8/8/8/8/8/R3K2q w - - 0 1', [], LEVELS.expert, { timeLimitMs: 300 });
    expect(['e1d2', 'e1e2', 'e1f2']).toContain(evasion.bestMove);
  });

  it('rejects illegal move histories and positions without moves', () => {
    expect(() => searchBestMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e5'], LEVELS.easy, { timeLimitMs: 100 })).toThrow(/Illegal move/);
    expect(() => searchBestMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', [], LEVELS.easy, { timeLimitMs: 100 })).toThrow(/No legal moves/);
  });

  it('evaluates material symmetrically', () => {
    expect(evaluate(Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'))).toBe(0);
    expect(evaluate(Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1'))).toBeLessThan(-700);
    expect(evaluate(Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1'))).toBeGreaterThan(700);
  });

  it('budgets time from the remaining clock', () => {
    expect(budgetForMove(LEVELS.expert, null, 0)).toBe(3500);
    expect(budgetForMove(LEVELS.expert, 30_000, 0)).toBe(1000);
    expect(budgetForMove(LEVELS.expert, 1_000, 0)).toBe(33);
    expect(budgetForMove(LEVELS.easy, 600_000, 0)).toBe(400);
  });
});
