import { describe, expect, it } from 'vitest';
import { PgnError, exportPgn, parsePgn } from '../../src/core/pgn';
import { ChessGame, validateFen } from '../../src/core/rules/game';
import { FenError } from '../../src/core/rules/position';
import { play } from './helpers';

const exportOf = (game: ChessGame, extra: Partial<Parameters<typeof exportPgn>[0]> = {}) =>
  exportPgn({ game, result: game.automaticOutcome(), white: 'Alice', black: 'Bob', date: new Date(2026, 9, 9), timeControl: '300+2', ...extra });

describe('PGN export', () => {
  it('writes the seven tag roster, move numbers and result', () => {
    const g = play(new ChessGame(), ['f3', 'e5', 'g4', 'Qh4#']);
    const pgn = exportOf(g);
    expect(pgn).toContain('[Event "Casual game"]');
    expect(pgn).toContain('[Date "2026.10.09"]');
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('[TimeControl "300+2"]');
    expect(pgn).toContain('1. f3 e5 2. g4 Qh4#');
    expect(pgn.trim().endsWith('0-1')).toBe(true);
    expect(pgn).not.toContain('[FEN');
  });

  it('includes SetUp/FEN tags and "N..." for games starting with Black to move', () => {
    const g = new ChessGame('4k3/8/8/8/8/8/4P3/4K3 b - - 0 30');
    play(g, ['Kd7', 'e4']);
    const pgn = exportOf(g);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain('[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 30"]');
    expect(pgn).toContain('30... Kd7 31. e4');
    expect(pgn).toContain('[Result "*"]');
  });

  it('escapes quotes in tag values and wraps long movetext', () => {
    const g = play(new ChessGame(), ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nc3', 'Nc6', 'Nb1', 'Nb8', 'e4', 'e5', 'd4', 'd5']);
    const pgn = exportOf(g, { white: 'The "Best"' });
    expect(pgn).toContain('[White "The \\"Best\\""]');
    for (const line of pgn.split('\n')) expect(line.length).toBeLessThanOrEqual(80);
  });

  it('round-trips through the parser', () => {
    const g = play(new ChessGame(), ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2', 'e5', 'Nb3', 'Be7', 'O-O', 'O-O']);
    const parsed = parsePgn(exportOf(g));
    expect(parsed.moves).toEqual(g.uciMoves());
    expect(parsed.headers.White).toBe('Alice');
    expect(parsed.result).toBeNull();
  });
});

describe('PGN import', () => {
  it('ignores comments, NAGs, variations, annotations and move-number styles', () => {
    const text = `[Event "Test"]
[Site "?"]

1. e4 {best by test} e5 2. Nf3!? $1 (2. f4 exf4 (2... d5) 3. Nf3) Nc6 ; a comment
3.Bb5 a6 4. Ba4 Nf6 5. 0-0 Be7 6...? 6. Re1 b5 7. Bb3 d6 *`;
    const parsed = parsePgn(text);
    expect(parsed.moves.slice(0, 4)).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    expect(parsed.moves).toContain('e1g1');
    expect(parsed.moves).toHaveLength(14);
  });

  it('accepts promotions written without "="', () => {
    const parsed = parsePgn('[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]\n\n1. a8Q+ *');
    expect(parsed.moves).toEqual(['a7a8q']);
  });

  it('detects checkmate from the moves', () => {
    const parsed = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
    expect(parsed.result).toEqual({ winner: 'b', termination: 'checkmate' });
  });

  it('keeps a decisive result that happened off the board', () => {
    const parsed = parsePgn('[Result "1-0"]\n\n1. e4 e5 1-0');
    expect(parsed.result).toEqual({ winner: 'w', termination: 'imported' });
  });

  it('reports illegal moves with move number and side', () => {
    expect(() => parsePgn('1. e4 e5 2. Ke3 Nc6 *')).toThrow(/Move 2\. Ke3 is not legal/);
    expect(() => parsePgn('1. e4 Nf6 2. d4 Nxe4 3. Bd3 Nxf2 4. Bxh7 Nxd1 5. Kxd1 Rxh7 6. Qh5 *')).toThrow(/Move 6\. Qh5/);
    expect(() => parsePgn('1. e4 e4 *')).toThrow(/Move 1\.\.\. e4/);
  });

  it('reports ambiguous moves', () => {
    expect(() => parsePgn('[FEN "4k3/8/8/8/8/8/4K3/R6R w - - 0 1"]\n\n1. Rd1 *')).toThrow(PgnError);
  });

  it('rejects malformed input with readable messages', () => {
    expect(() => parsePgn('')).toThrow('The PGN is empty.');
    expect(() => parsePgn('1. e4 {unclosed')).toThrow(/never closed/);
    expect(() => parsePgn('1. e4 (1. d4')).toThrow(/never closed/);
    expect(() => parsePgn('[Event "x"\n1. e4')).toThrow(/Malformed tag/);
    expect(() => parsePgn('[FEN "not a fen"]\n\n*')).toThrow(/The FEN tag is invalid/);
    expect(() => parsePgn('hello world')).toThrow(PgnError);
  });

  it('reads only the first game of a multi-game file', () => {
    const parsed = parsePgn('[Event "A"]\n\n1. e4 *\n\n[Event "B"]\n\n1. d4 d5 *');
    expect(parsed.moves).toEqual(['e2e4']);
  });
});

describe('FEN validation', () => {
  const bad: [string, RegExp][] = [
    ['', /empty/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', /6 space-separated fields/],
    ['rnbqkbnr/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', /8 ranks/],
    ['rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', /Unknown piece|describes/],
    ['rnbqkbnr/pppppppp/7/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', /describes 7 squares/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQXBNR w KQkq - 0 1', /Unknown piece character "X"/],
    ['rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1', /Black has no king/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKKNR w KQkq - 0 1', /more than one king/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/PNBQKBNR w kq - 0 1', /pawn cannot stand on rank 1/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1', /Side to move/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w KQkq - 0 1', /"K" requires/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e3 0 1', /impossible|inconsistent/],
    ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e4 0 1', /impossible/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - x 1', /Halfmove clock/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 0', /Move number/],
    ['8/8/8/8/8/8/8/kK6 w - - 0 1', /adjacent/],
    ['4k3/4R3/8/8/8/8/8/4K3 w - - 0 1', /not to move \(Black\) is in check/],
    ['4k3/8/8/8/8/8/PPPPPPPP/PPPPK3 w - - 0 1', /pawn cannot stand|more than 8 pawns/],
  ];
  for (const [fen, message] of bad) {
    it(`rejects "${fen || '(empty)'}"`, () => {
      expect(() => new ChessGame(fen)).toThrow(FenError);
      expect(validateFen(fen)).toMatch(message);
    });
  }

  it('accepts and normalises valid FEN (extra whitespace, irrelevant en passant square)', () => {
    expect(validateFen('  rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR   b KQkq e3 0 1 ')).toBeNull();
    const g = new ChessGame('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(g.fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('FEN round-trips for every position of a game', () => {
    const g = play(new ChessGame(), ['e4', 'd5', 'exd5', 'c6', 'dxc6', 'Nf6', 'cxb7', 'e5', 'bxa8=N', 'Bc5']);
    for (const m of g.history()) expect(new ChessGame(m.fenAfter).fen()).toBe(m.fenAfter);
  });
});
