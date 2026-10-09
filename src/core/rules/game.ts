import {
  BLACK,
  FLAG_CASTLE_K,
  FLAG_CASTLE_Q,
  FLAG_EP,
  PAWN,
  Position,
  WHITE,
  moveFlag,
  moveFrom,
  movePromo,
  moveTo,
  moveToUci,
  sqName,
} from './position';
import {
  START_FEN,
  type Color,
  type GameResult,
  type Piece,
  type PieceType,
  type PromotionPiece,
  type Square,
} from '../types';

const TYPE_CHARS = ' pnbrqk';

export interface MoveInfo {
  uci: string;
  san: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PromotionPiece;
  castle?: 'k' | 'q';
  enPassant: boolean;
  check: boolean;
  mate: boolean;
}

export interface MoveRecord extends MoveInfo {
  fenAfter: string;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

function colorOf(code: number): Color {
  return code & BLACK ? 'b' : 'w';
}

/**
 * Game-level rules: move history, SAN, repetition tracking and rule-based outcomes.
 * Built on Position, which is perft- and differentially-tested.
 */
export class ChessGame {
  readonly startFen: string;
  private pos: Position;
  private codes: number[] = [];
  private records: MoveRecord[] = [];
  /** Repetition keys for every position in the game (index = ply). */
  private keys: string[] = [];
  private legalCache: { codes: number[]; infos: MoveInfo[] } | null = null;

  constructor(startFen: string = START_FEN) {
    this.pos = Position.fromFen(startFen);
    this.startFen = this.pos.fen();
    this.keys.push(this.repetitionKey());
  }

  /** Rebuilds a game from a start FEN and UCI moves; throws if any move is illegal. */
  static fromUciMoves(startFen: string, moves: readonly string[]): ChessGame {
    const game = new ChessGame(startFen);
    moves.forEach((uci, i) => {
      if (!game.moveUci(uci)) {
        throw new IllegalMoveError(`Stored move ${i + 1} (${uci}) is not legal in its position.`);
      }
    });
    return game;
  }

  private repetitionKey(): string {
    return this.pos.fen().split(' ').slice(0, 4).join(' ');
  }

  fen(): string {
    return this.pos.fen();
  }

  turn(): Color {
    return this.pos.turn === WHITE ? 'w' : 'b';
  }

  ply(): number {
    return this.records.length;
  }

  halfmoveClock(): number {
    return this.pos.halfmove;
  }

  history(): readonly MoveRecord[] {
    return this.records;
  }

  uciMoves(): string[] {
    return this.records.map((r) => r.uci);
  }

  /** 64-entry board, index 0 = a1 ... 63 = h8. */
  board(): (Piece | null)[] {
    return boardFromPosition(this.pos);
  }

  /** Board after `ply` half-moves (0 = start position) for read-only review. */
  boardAt(ply: number): (Piece | null)[] {
    if (ply >= this.records.length) return this.board();
    const fen = ply <= 0 ? this.startFen : this.records[ply - 1]!.fenAfter;
    return boardFromPosition(Position.fromFen(fen));
  }

  fenAt(ply: number): string {
    if (ply >= this.records.length) return this.fen();
    return ply <= 0 ? this.startFen : this.records[ply - 1]!.fenAfter;
  }

  inCheck(): boolean {
    return this.pos.inCheck();
  }

  kingSquare(color: Color): Square {
    return sqName(this.pos.kings[color === 'w' ? 0 : 1]!) as Square;
  }

  private legal(): { codes: number[]; infos: MoveInfo[] } {
    if (!this.legalCache) {
      const codes = this.pos.legalMoves();
      const infos = codes.map((c) => this.describe(c, codes));
      this.legalCache = { codes, infos };
    }
    return this.legalCache;
  }

  legalMoves(): readonly MoveInfo[] {
    return this.legal().infos;
  }

  legalMovesFrom(square: Square): MoveInfo[] {
    return this.legal().infos.filter((m) => m.from === square);
  }

  private describe(code: number, legal: number[]): MoveInfo {
    const pos = this.pos;
    const from = moveFrom(code);
    const to = moveTo(code);
    const flag = moveFlag(code);
    const promo = movePromo(code);
    const piece = pos.board[from]!;
    const type = piece & 7;
    const capturedCode = flag === FLAG_EP ? PAWN : pos.board[to]! & 7;
    let san: string;
    if (flag === FLAG_CASTLE_K) san = 'O-O';
    else if (flag === FLAG_CASTLE_Q) san = 'O-O-O';
    else {
      const isCapture = capturedCode !== 0;
      if (type === PAWN) {
        san = isCapture ? sqName(from)[0] + 'x' : '';
        san += sqName(to);
        if (promo) san += '=' + TYPE_CHARS[promo]!.toUpperCase();
      } else {
        san = TYPE_CHARS[type]!.toUpperCase();
        const rivals = legal.filter(
          (o) => o !== code && moveTo(o) === to && (pos.board[moveFrom(o)]! & 7) === type,
        );
        if (rivals.length) {
          const sameFile = rivals.some((o) => (moveFrom(o) & 7) === (from & 7));
          const sameRank = rivals.some((o) => moveFrom(o) >> 4 === from >> 4);
          if (!sameFile) san += sqName(from)[0];
          else if (!sameRank) san += sqName(from)[1];
          else san += sqName(from);
        }
        if (isCapture) san += 'x';
        san += sqName(to);
      }
    }
    pos.make(code);
    const check = pos.inCheck();
    const mate = check && pos.legalMoves().length === 0;
    pos.unmake(code);
    if (mate) san += '#';
    else if (check) san += '+';
    return {
      uci: moveToUci(code),
      san,
      from: sqName(from) as Square,
      to: sqName(to) as Square,
      color: colorOf(piece),
      piece: TYPE_CHARS[type] as PieceType,
      captured: capturedCode ? (TYPE_CHARS[capturedCode] as PieceType) : undefined,
      promotion: promo ? (TYPE_CHARS[promo] as PromotionPiece) : undefined,
      castle: flag === FLAG_CASTLE_K ? 'k' : flag === FLAG_CASTLE_Q ? 'q' : undefined,
      enPassant: flag === FLAG_EP,
      check,
      mate,
    };
  }

  private play(index: number): MoveRecord {
    const { codes, infos } = this.legal();
    const code = codes[index]!;
    const info = infos[index]!;
    this.pos.make(code);
    this.codes.push(code);
    this.legalCache = null;
    const record: MoveRecord = { ...info, fenAfter: this.pos.fen() };
    this.records.push(record);
    this.keys.push(this.repetitionKey());
    return record;
  }

  /** Returns the move record, or null if the move is illegal. Never throws for bad input. */
  move(input: MoveInput): MoveRecord | null {
    const { infos } = this.legal();
    const index = infos.findIndex(
      (m) => m.from === input.from && m.to === input.to && (m.promotion ?? undefined) === (input.promotion ?? undefined),
    );
    return index >= 0 ? this.play(index) : null;
  }

  moveUci(uci: string): MoveRecord | null {
    const { infos } = this.legal();
    const index = infos.findIndex((m) => m.uci === uci.toLowerCase());
    return index >= 0 ? this.play(index) : null;
  }

  /** Parses SAN leniently (accepts missing/extra check marks, "0-0", "e8Q", over-disambiguation). */
  moveSan(sanInput: string): MoveRecord | null {
    const index = this.findSan(sanInput);
    return index >= 0 ? this.play(index) : null;
  }

  private findSan(sanInput: string): number {
    const { infos } = this.legal();
    const clean = sanInput.replace(/[+#!?]+$/g, '').replace(/0/g, 'O').trim();
    if (clean === 'O-O' || clean === 'O-O-O') {
      return infos.findIndex((m) => m.castle === (clean === 'O-O' ? 'k' : 'q'));
    }
    const exact = infos.findIndex((m) => m.san.replace(/[+#]$/, '') === clean);
    if (exact >= 0) return exact;
    const match = /^([NBRQK])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([NBRQnbrq]))?$/.exec(clean);
    if (!match) return -1;
    const [, pieceCh, file, rank, dest, promo] = match;
    const piece = (pieceCh ?? 'P').toLowerCase();
    const candidates = infos
      .map((m, i) => ({ m, i }))
      .filter(
        ({ m }) =>
          m.piece === piece &&
          m.to === dest &&
          (!file || m.from[0] === file) &&
          (!rank || m.from[1] === rank) &&
          (m.promotion ?? '') === (promo ? promo.toLowerCase() : ''),
      );
    return candidates.length === 1 ? candidates[0]!.i : -1;
  }

  /** Validates SAN without playing it. */
  isLegalSan(san: string): boolean {
    return this.findSan(san) >= 0;
  }

  undo(): MoveRecord | null {
    const code = this.codes.pop();
    if (code === undefined) return null;
    this.pos.unmake(code);
    this.keys.pop();
    this.legalCache = null;
    return this.records.pop() ?? null;
  }

  // ---------------------------------------------------------------- outcomes
  isCheckmate(): boolean {
    return this.inCheck() && this.legal().codes.length === 0;
  }

  isStalemate(): boolean {
    return !this.inCheck() && this.legal().codes.length === 0;
  }

  isInsufficientMaterial(): boolean {
    return this.pos.isInsufficientMaterial();
  }

  /** True if `color` cannot checkmate by any legal sequence (material heuristic, see docs). */
  hasInsufficientMaterial(color: Color): boolean {
    return this.pos.hasInsufficientMaterial(color === 'w' ? WHITE : BLACK);
  }

  repetitionCount(): number {
    const key = this.keys[this.keys.length - 1];
    return this.keys.filter((k) => k === key).length;
  }

  canClaimThreefold(): boolean {
    return this.repetitionCount() >= 3;
  }

  canClaimFiftyMoves(): boolean {
    return this.pos.halfmove >= 100 && this.legal().codes.length > 0;
  }

  canClaimDraw(): boolean {
    return !this.automaticOutcome() && (this.canClaimThreefold() || this.canClaimFiftyMoves());
  }

  isFivefoldRepetition(): boolean {
    return this.repetitionCount() >= 5;
  }

  isSeventyFiveMoves(): boolean {
    return this.pos.halfmove >= 150 && this.legal().codes.length > 0;
  }

  /** Rule-enforced game end. Checkmate always takes precedence. */
  automaticOutcome(): GameResult | null {
    if (this.isCheckmate()) return { winner: this.turn() === 'w' ? 'b' : 'w', termination: 'checkmate' };
    if (this.isInsufficientMaterial()) return { winner: null, termination: 'insufficient_material' };
    if (this.isStalemate()) return { winner: null, termination: 'stalemate' };
    if (this.isSeventyFiveMoves()) return { winner: null, termination: 'seventyfive_moves' };
    if (this.isFivefoldRepetition()) return { winner: null, termination: 'fivefold_repetition' };
    return null;
  }

  /** Result of a draw claim by the side to move, or null if no claim is available. */
  claimDraw(): GameResult | null {
    if (this.automaticOutcome()) return null;
    if (this.canClaimThreefold()) return { winner: null, termination: 'threefold_repetition' };
    if (this.canClaimFiftyMoves()) return { winner: null, termination: 'fifty_moves' };
    return null;
  }

  /** Result when `flagged` runs out of time (FIDE 6.9). */
  timeoutResult(flagged: Color): GameResult {
    const opponent: Color = flagged === 'w' ? 'b' : 'w';
    if (this.hasInsufficientMaterial(opponent)) return { winner: null, termination: 'timeout_insufficient_material' };
    return { winner: opponent, termination: 'timeout' };
  }

  /** Pieces captured from each colour (relative to the start position material). */
  capturedPieces(): Record<Color, PieceType[]> {
    const out: Record<Color, PieceType[]> = { w: [], b: [] };
    for (const r of this.records) {
      if (r.captured) out[r.color === 'w' ? 'b' : 'w'].push(r.captured);
    }
    return out;
  }
}

export function boardFromPosition(pos: Position): (Piece | null)[] {
  const out: (Piece | null)[] = new Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    const p = pos.board[(i >> 3) * 16 + (i & 7)]!;
    if (p) out[i] = { color: colorOf(p), type: TYPE_CHARS[p & 7] as PieceType };
  }
  return out;
}

export function validateFen(fen: string): string | null {
  try {
    Position.fromFen(fen);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid FEN.';
  }
}

export function normalizeFen(fen: string): string {
  return Position.fromFen(fen).fen();
}

