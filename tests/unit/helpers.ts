import { ChessGame } from '../../src/core/rules/game';

export function play(game: ChessGame, sans: string[]): ChessGame {
  for (const san of sans) {
    if (!game.moveSan(san)) throw new Error(`Test setup: illegal move ${san} in ${game.fen()}`);
  }
  return game;
}

export function legalUci(game: ChessGame): string[] {
  return game.legalMoves().map((m) => m.uci).sort();
}
