import { describe, expect, it } from 'vitest';
import { ChessGame } from '../../src/core/rules/game';
import { legalUci, play } from './helpers';

describe('basic movement and turn order', () => {
  it('starts with the standard position and 20 legal moves', () => {
    const g = new ChessGame();
    expect(g.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(g.legalMoves()).toHaveLength(20);
    expect(g.turn()).toBe('w');
  });

  it('enforces turn order', () => {
    const g = new ChessGame();
    expect(g.moveUci('e7e5')).toBeNull();
    expect(g.moveUci('e2e4')).not.toBeNull();
    expect(g.moveUci('d2d4')).toBeNull();
    expect(g.turn()).toBe('b');
  });

  it('rejects illegal piece movement', () => {
    const g = new ChessGame();
    for (const bad of ['e2e5', 'b1b3', 'f1c4', 'a1a3', 'd1d3', 'e1e2', 'e2d3', 'a2a2', 'h9h8', '']) {
      expect(g.moveUci(bad), bad).toBeNull();
    }
    expect(g.ply()).toBe(0);
  });

  it('generates correct moves for each piece type on an open board', () => {
    const g = new ChessGame('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1');
    expect(g.legalMovesFrom('d4')).toHaveLength(27);
    expect(new ChessGame('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1').legalMovesFrom('d4')).toHaveLength(14);
    expect(new ChessGame('4k3/8/8/8/3B4/8/8/4K3 w - - 0 1').legalMovesFrom('d4')).toHaveLength(13);
    expect(new ChessGame('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1').legalMovesFrom('d4')).toHaveLength(8);
    expect(new ChessGame('4k3/8/8/8/3K4/8/8/8 w - - 0 1').legalMovesFrom('d4')).toHaveLength(8);
    expect(new ChessGame('4k3/8/8/8/8/8/3P4/4K3 w - - 0 1').legalMovesFrom('d2').map((m) => m.to).sort()).toEqual(['d3', 'd4']);
  });

  it('pawns cannot capture forwards or move through pieces', () => {
    const g = new ChessGame('4k3/8/8/8/8/3p4/3P4/4K3 w - - 0 1');
    expect(g.legalMovesFrom('d2')).toHaveLength(0);
  });
});

describe('self-check prevention', () => {
  it('a pinned piece cannot leave the pin line', () => {
    const g = new ChessGame('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1');
    expect(g.legalMovesFrom('e2')).toHaveLength(0);
  });

  it('the king cannot step into an attacked square', () => {
    const g = new ChessGame('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1');
    const kingTargets = g.legalMovesFrom('e1').map((m) => m.to).sort();
    expect(kingTargets).toEqual(['d2', 'f1']);
  });

  it('when in check only evasions are legal', () => {
    const g = new ChessGame('4k3/8/8/8/8/8/8/R3K2q w - - 0 1');
    expect(g.inCheck()).toBe(true);
    expect(legalUci(g)).toEqual(['e1d2', 'e1e2', 'e1f2']); // verified with python-chess
  });
});

describe('castling', () => {
  it('allows both castles when the path is clear and safe', () => {
    const g = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const castles = g.legalMoves().filter((m) => m.castle);
    expect(castles.map((m) => m.san).sort()).toEqual(['O-O', 'O-O-O']);
    const rec = g.moveUci('e1g1')!;
    expect(rec.castle).toBe('k');
    expect(g.fen()).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  });

  it('forbids castling through an attacked square', () => {
    const g = new ChessGame('r3kr2/8/8/8/8/8/8/R3K2R w KQq - 0 1');
    expect(legalUci(g)).not.toContain('e1g1');
    expect(legalUci(g)).toContain('e1c1');
  });

  it('forbids castling into check', () => {
    const g = new ChessGame('r3k1r1/8/8/8/8/8/8/R3K2R w KQq - 0 1');
    expect(legalUci(g)).not.toContain('e1g1');
  });

  it('forbids castling out of check', () => {
    const g = new ChessGame('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(g.inCheck()).toBe(true);
    expect(g.legalMoves().some((m) => m.castle)).toBe(false);
  });

  it('allows queenside castling when only b1 is attacked', () => {
    const g = new ChessGame('1r2k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(legalUci(g)).toContain('e1c1');
  });

  it('forbids castling when a piece is in between', () => {
    const g = new ChessGame('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1');
    expect(legalUci(g)).not.toContain('e1c1');
    expect(legalUci(g)).toContain('e1g1');
  });

  it('loses rights after the king or rook moves, even if it returns', () => {
    const g = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    play(g, ['Kf1', 'Kf8', 'Ke1', 'Ke8']);
    expect(g.fen().split(' ')[2]).toBe('-');
    const h = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    play(h, ['Rb1', 'Rb8', 'Ra1']);
    expect(h.fen().split(' ')[2]).toBe('Kk');
  });

  it('loses the right when the rook is captured', () => {
    const g = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    g.moveUci('a1a8');
    expect(g.fen().split(' ')[2]).toBe('Kk');
  });
});

describe('en passant', () => {
  it('is available immediately after the double step', () => {
    const g = play(new ChessGame(), ['e4', 'a6', 'e5', 'd5']);
    expect(g.fen().split(' ')[3]).toBe('d6');
    const rec = g.moveUci('e5d6')!;
    expect(rec.enPassant).toBe(true);
    expect(rec.san).toBe('exd6');
    expect(g.board()[4 * 8 + 3]).toBeNull(); // d5 pawn removed
  });

  it('expires if not used on the very next move', () => {
    const g = play(new ChessGame(), ['e4', 'a6', 'e5', 'd5', 'a3', 'a5']);
    expect(legalUci(g)).not.toContain('e5d6');
  });

  it('is illegal when it would expose the king along the rank', () => {
    const g = new ChessGame('8/8/8/KPp4r/8/8/8/7k w - c6 0 1');
    expect(legalUci(g)).not.toContain('b5c6');
    expect(g.fen().split(' ')[3]).toBe('-');
  });
});

describe('promotion', () => {
  it('offers all four promotion pieces with correct SAN', () => {
    const g = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const promos = g.legalMovesFrom('a7');
    expect(promos.map((m) => m.san).sort()).toEqual(['a8=B', 'a8=N', 'a8=Q+', 'a8=R+']);
  });

  it('supports underpromotion to a knight', () => {
    const g = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const rec = g.move({ from: 'a7', to: 'a8', promotion: 'n' })!;
    expect(rec.promotion).toBe('n');
    expect(g.board()[56]).toEqual({ color: 'w', type: 'n' });
  });

  it('requires a promotion piece for promotion moves', () => {
    const g = new ChessGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
    expect(g.move({ from: 'a7', to: 'a8' })).toBeNull();
  });

  it('handles capture-promotion', () => {
    const g = new ChessGame('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
    const rec = g.moveSan('axb8=R+');
    expect(rec?.captured).toBe('r');
  });
});

describe('checkmate and stalemate', () => {
  it("detects fool's mate", () => {
    const g = play(new ChessGame(), ['f3', 'e5', 'g4', 'Qh4#']);
    expect(g.isCheckmate()).toBe(true);
    expect(g.history()[3]!.san).toBe('Qh4#');
    expect(g.automaticOutcome()).toEqual({ winner: 'b', termination: 'checkmate' });
    expect(g.legalMoves()).toHaveLength(0);
  });

  it('detects stalemate', () => {
    const g = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(g.isStalemate()).toBe(true);
    expect(g.automaticOutcome()).toEqual({ winner: null, termination: 'stalemate' });
  });

  it('uses disambiguation in SAN', () => {
    const g = new ChessGame('4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
    expect(g.legalMoves().filter((m) => m.to === 'd1' && m.piece === 'r').map((m) => m.san).sort()).toEqual(['Rad1', 'Rhd1']);
    const h = new ChessGame('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1');
    expect(h.legalMoves().filter((m) => m.to === 'a3').map((m) => m.san).sort()).toEqual(['R1a3', 'R5a3']);
  });

  it('undo restores the previous position exactly', () => {
    const g = play(new ChessGame(), ['e4', 'd5', 'exd5', 'Qxd5']);
    const fens = g.history().map((m) => m.fenAfter);
    g.undo();
    expect(g.fen()).toBe(fens[2]);
    g.undo();
    g.undo();
    g.undo();
    expect(g.fen()).toBe(g.startFen);
    expect(g.undo()).toBeNull();
  });
});
