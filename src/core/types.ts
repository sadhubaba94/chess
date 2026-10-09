export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type Rank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
export type Square = `${File}${Rank}`;

export interface Piece {
  color: Color;
  type: PieceType;
}

export const FILES: readonly File[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS: readonly Rank[] = ['1', '2', '3', '4', '5', '6', '7', '8'];
export const PROMOTION_PIECES: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export function colorName(color: Color): 'White' | 'Black' {
  return color === 'w' ? 'White' : 'Black';
}

export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** Index 0 = a1, 7 = h1, 56 = a8, 63 = h8. */
export function squareToIndex(square: Square): number {
  return (square.charCodeAt(1) - 49) * 8 + (square.charCodeAt(0) - 97);
}

export function indexToSquare(index: number): Square {
  return `${FILES[index % 8]}${RANKS[Math.floor(index / 8)]}` as Square;
}

export type Termination =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'fivefold_repetition'
  | 'seventyfive_moves'
  | 'threefold_repetition'
  | 'fifty_moves'
  | 'resignation'
  | 'agreement'
  | 'timeout'
  | 'timeout_insufficient_material'
  | 'imported';

export interface GameResult {
  /** null means draw. */
  winner: Color | null;
  termination: Termination;
}

export function resultToPgn(result: GameResult | null): '1-0' | '0-1' | '1/2-1/2' | '*' {
  if (!result) return '*';
  if (result.winner === 'w') return '1-0';
  if (result.winner === 'b') return '0-1';
  return '1/2-1/2';
}

export function describeResult(result: GameResult): { headline: string; reason: string } {
  const headline = result.winner ? `${colorName(result.winner)} wins` : 'Draw';
  const loser = result.winner ? colorName(opposite(result.winner)) : '';
  const reasons: Record<Termination, string> = {
    checkmate: 'by checkmate',
    stalemate: 'by stalemate',
    insufficient_material: 'by insufficient material (no checkmate is possible)',
    fivefold_repetition: 'by fivefold repetition',
    seventyfive_moves: 'by the 75-move rule',
    threefold_repetition: 'by threefold repetition (claimed)',
    fifty_moves: 'by the 50-move rule (claimed)',
    resignation: `${loser} resigned`,
    agreement: 'by agreement',
    timeout: `${loser} ran out of time`,
    timeout_insufficient_material:
      'on time: the flag fell, but the opponent could not checkmate by any legal sequence',
    imported: 'as recorded in the imported PGN',
  };
  return { headline, reason: reasons[result.termination] };
}
