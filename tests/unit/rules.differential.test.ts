import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/differential-games.json';
import { ChessGame } from '../../src/core/rules/game';

interface Snapshot {
  fen: string;
  legal: string[];
  check: boolean;
  checkmate: boolean;
  stalemate: boolean;
  insufficient: boolean;
  whiteInsufficient: boolean;
  blackInsufficient: boolean;
  threefold: boolean;
  fivefold: boolean;
  fifty: boolean;
  seventyfive: boolean;
}
interface Ply extends Snapshot {
  uci: string;
  san: string;
}

function compare(game: ChessGame, snap: Snapshot, where: string) {
  expect(game.fen(), `${where} fen`).toBe(snap.fen);
  expect(game.legalMoves().map((m) => m.uci).sort(), `${where} legal moves`).toEqual(snap.legal);
  expect(
    {
      check: game.inCheck(),
      checkmate: game.isCheckmate(),
      stalemate: game.isStalemate(),
      insufficient: game.isInsufficientMaterial(),
      whiteInsufficient: game.hasInsufficientMaterial('w'),
      blackInsufficient: game.hasInsufficientMaterial('b'),
      threefold: game.canClaimThreefold(),
      fivefold: game.isFivefoldRepetition(),
      fifty: game.canClaimFiftyMoves(),
      seventyfive: game.isSeventyFiveMoves(),
    },
    `${where} status flags`,
  ).toEqual({
    check: snap.check,
    checkmate: snap.checkmate,
    stalemate: snap.stalemate,
    insufficient: snap.insufficient,
    whiteInsufficient: snap.whiteInsufficient,
    blackInsufficient: snap.blackInsufficient,
    threefold: snap.threefold,
    fivefold: snap.fivefold,
    fifty: snap.fifty,
    seventyfive: snap.seventyfive,
  });
}

const games = (fixture as { generator: string; games: { start: string; initial: Snapshot; plies: Ply[] }[] }).games;

describe(`differential test against ${(fixture as { generator: string }).generator}`, () => {
  it('fixture is non-trivial', () => {
    expect(games.length).toBeGreaterThan(50);
    expect(games.reduce((n, g) => n + g.plies.length, 0)).toBeGreaterThan(5000);
  });

  games.forEach((g, gi) => {
    it(`game ${gi + 1}: ${g.plies.length} plies match python-chess`, () => {
      const game = new ChessGame(g.start);
      compare(game, g.initial, `game ${gi + 1} start`);
      g.plies.forEach((ply, pi) => {
        const san = game.legalMoves().find((m) => m.uci === ply.uci)?.san;
        expect(san, `game ${gi + 1} ply ${pi + 1} SAN`).toBe(ply.san);
        expect(game.moveUci(ply.uci), `game ${gi + 1} ply ${pi + 1} legal`).not.toBeNull();
        compare(game, ply, `game ${gi + 1} ply ${pi + 1}`);
      });
    });
  });
});
