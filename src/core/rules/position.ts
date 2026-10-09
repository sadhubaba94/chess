/**
 * Low-level chess position on a 0x88 board.
 *
 * This module is the single source of truth for chess rules in Kingside. It is
 * UI-independent and is verified by perft node counts and by differential tests
 * against python-chess (see tests/unit/rules.differential.test.ts).
 *
 * Square index: rank * 16 + file (a1 = 0, h1 = 7, a8 = 112, h8 = 119).
 * Piece code: color | type, color WHITE = 0 / BLACK = 8, type 1..6 (P N B R Q K), 0 = empty.
 * Move code (integer): from | to << 7 | promo << 14 | flag << 17.
 */

export const WHITE = 0;
export const BLACK = 8;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const FLAG_QUIET = 0;
export const FLAG_CAPTURE = 1;
export const FLAG_DOUBLE = 2;
export const FLAG_EP = 3;
export const FLAG_CASTLE_K = 4;
export const FLAG_CASTLE_Q = 5;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

const KNIGHT_STEPS = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_STEPS = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_DIRS = [15, 17, -15, -17];
const ROOK_DIRS = [1, -1, 16, -16];

const PIECE_CHARS = ' pnbrqk';

export function moveFrom(m: number): number {
  return m & 127;
}
export function moveTo(m: number): number {
  return (m >> 7) & 127;
}
export function movePromo(m: number): number {
  return (m >> 14) & 7;
}
export function moveFlag(m: number): number {
  return (m >> 17) & 7;
}
export function encodeMove(from: number, to: number, promo: number, flag: number): number {
  return from | (to << 7) | (promo << 14) | (flag << 17);
}

export function sqName(sq: number): string {
  return String.fromCharCode(97 + (sq & 7)) + String.fromCharCode(49 + (sq >> 4));
}
export function sqFromName(name: string): number {
  if (!/^[a-h][1-8]$/.test(name)) return -1;
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
}

export function moveToUci(m: number): string {
  const promo = movePromo(m);
  return sqName(moveFrom(m)) + sqName(moveTo(m)) + (promo ? PIECE_CHARS[promo] : '');
}

// ---------------------------------------------------------------------------
// Zobrist hashing (two independent 32-bit halves, deterministic seed)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
}
const rnd = mulberry32(0x5eed1234);
export const Z_PIECE_LO = new Int32Array(16 * 128);
export const Z_PIECE_HI = new Int32Array(16 * 128);
for (let i = 0; i < Z_PIECE_LO.length; i++) {
  Z_PIECE_LO[i] = rnd();
  Z_PIECE_HI[i] = rnd();
}
export const Z_SIDE_LO = rnd();
export const Z_SIDE_HI = rnd();
export const Z_CASTLE_LO = new Int32Array(16);
export const Z_CASTLE_HI = new Int32Array(16);
for (let i = 0; i < 16; i++) {
  Z_CASTLE_LO[i] = rnd();
  Z_CASTLE_HI[i] = rnd();
}
export const Z_EP_LO = new Int32Array(8);
export const Z_EP_HI = new Int32Array(8);
for (let i = 0; i < 8; i++) {
  Z_EP_LO[i] = rnd();
  Z_EP_HI[i] = rnd();
}

const CASTLE_MASK = new Int32Array(128).fill(15);
CASTLE_MASK[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[0] = 15 & ~CASTLE_WQ;
CASTLE_MASK[7] = 15 & ~CASTLE_WK;
CASTLE_MASK[116] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CASTLE_MASK[112] = 15 & ~CASTLE_BQ;
CASTLE_MASK[119] = 15 & ~CASTLE_BK;

export class FenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FenError';
  }
}

export class Position {
  board = new Int8Array(128);
  turn = WHITE;
  castling = 0;
  ep = -1;
  halfmove = 0;
  fullmove = 1;
  kings = [-1, -1];
  hashLo = 0;
  hashHi = 0;
  private undoStack: number[] = [];

  static fromFen(fen: string): Position {
    const pos = new Position();
    pos.loadFen(fen);
    return pos;
  }

  clone(): Position {
    const p = new Position();
    p.board.set(this.board);
    p.turn = this.turn;
    p.castling = this.castling;
    p.ep = this.ep;
    p.halfmove = this.halfmove;
    p.fullmove = this.fullmove;
    p.kings = [...this.kings];
    p.hashLo = this.hashLo;
    p.hashHi = this.hashHi;
    return p;
  }

  /** Parses and fully validates a FEN string. Throws FenError with a readable message. */
  loadFen(fenInput: string): void {
    const fen = fenInput.trim().replace(/\s+/g, ' ');
    if (!fen) throw new FenError('The FEN is empty.');
    const parts = fen.split(' ');
    if (parts.length !== 6) {
      throw new FenError(
        `A FEN needs 6 space-separated fields (placement, side, castling, en passant, halfmove clock, move number); found ${parts.length}.`,
      );
    }
    const [placement, side, castling, ep, half, full] = parts as [string, string, string, string, string, string];
    const rows = placement.split('/');
    if (rows.length !== 8) throw new FenError(`The piece placement must have 8 ranks separated by "/"; found ${rows.length}.`);
    this.board.fill(0);
    this.kings = [-1, -1];
    const counts: Record<string, number> = {};
    for (let r = 0; r < 8; r++) {
      const rank = 7 - r;
      let file = 0;
      for (const ch of rows[r]!) {
        if (/[1-8]/.test(ch)) {
          file += Number(ch);
        } else {
          const lower = ch.toLowerCase();
          const type = PIECE_CHARS.indexOf(lower);
          if (type < 1) throw new FenError(`Unknown piece character "${ch}" on rank ${rank + 1}.`);
          if (file > 7) throw new FenError(`Rank ${rank + 1} has more than 8 squares.`);
          const color = ch === lower ? BLACK : WHITE;
          const sq = rank * 16 + file;
          this.board[sq] = color | type;
          counts[ch] = (counts[ch] ?? 0) + 1;
          if (type === KING) {
            if (this.kings[color >> 3]! >= 0) throw new FenError(`${color === WHITE ? 'White' : 'Black'} has more than one king.`);
            this.kings[color >> 3] = sq;
          }
          if (type === PAWN && (rank === 0 || rank === 7)) throw new FenError(`A pawn cannot stand on rank ${rank + 1}.`);
          file += 1;
        }
      }
      if (file !== 8) throw new FenError(`Rank ${rank + 1} describes ${file} squares instead of 8.`);
    }
    if (this.kings[0]! < 0) throw new FenError('White has no king.');
    if (this.kings[1]! < 0) throw new FenError('Black has no king.');
    for (const [label, pawnCh, pieces] of [
      ['White', 'P', 'PNBRQK'],
      ['Black', 'p', 'pnbrqk'],
    ] as const) {
      if ((counts[pawnCh] ?? 0) > 8) throw new FenError(`${label} has more than 8 pawns.`);
      const total = [...pieces].reduce((s, c) => s + (counts[c] ?? 0), 0);
      if (total > 16) throw new FenError(`${label} has more than 16 pieces.`);
    }
    if (side !== 'w' && side !== 'b') throw new FenError(`Side to move must be "w" or "b", not "${side}".`);
    this.turn = side === 'w' ? WHITE : BLACK;

    if (!/^(-|K?Q?k?q?)$/.test(castling) || castling === '') {
      throw new FenError(`Castling field "${castling}" is invalid. Use "-" or a combination of K, Q, k, q in that order.`);
    }
    this.castling = 0;
    const need = (cond: boolean, msg: string) => {
      if (!cond) throw new FenError(msg);
    };
    if (castling.includes('K')) {
      need(this.board[4] === (WHITE | KING) && this.board[7] === (WHITE | ROOK), 'Castling right "K" requires the white king on e1 and a white rook on h1.');
      this.castling |= CASTLE_WK;
    }
    if (castling.includes('Q')) {
      need(this.board[4] === (WHITE | KING) && this.board[0] === (WHITE | ROOK), 'Castling right "Q" requires the white king on e1 and a white rook on a1.');
      this.castling |= CASTLE_WQ;
    }
    if (castling.includes('k')) {
      need(this.board[116] === (BLACK | KING) && this.board[119] === (BLACK | ROOK), 'Castling right "k" requires the black king on e8 and a black rook on h8.');
      this.castling |= CASTLE_BK;
    }
    if (castling.includes('q')) {
      need(this.board[116] === (BLACK | KING) && this.board[112] === (BLACK | ROOK), 'Castling right "q" requires the black king on e8 and a black rook on a8.');
      this.castling |= CASTLE_BQ;
    }

    this.ep = -1;
    if (ep !== '-') {
      const sq = sqFromName(ep);
      if (sq < 0) throw new FenError(`En passant field "${ep}" is not a square.`);
      const rank = sq >> 4;
      const expectedRank = this.turn === WHITE ? 5 : 2;
      if (rank !== expectedRank) {
        throw new FenError(`En passant square ${ep} is impossible with ${this.turn === WHITE ? 'White' : 'Black'} to move (it must be on rank ${expectedRank + 1}).`);
      }
      const dir = this.turn === WHITE ? -16 : 16; // towards the pawn that just moved
      const them = this.turn ^ 8;
      if (this.board[sq] !== 0 || this.board[sq - dir] !== 0 || this.board[sq + dir] !== (them | PAWN)) {
        throw new FenError(`En passant square ${ep} is inconsistent: no pawn could have just made a two-square move past it.`);
      }
      this.ep = sq;
    }

    if (!/^\d+$/.test(half)) throw new FenError(`Halfmove clock "${half}" must be a non-negative whole number.`);
    if (!/^\d+$/.test(full) || Number(full) < 1) throw new FenError(`Move number "${full}" must be a whole number of at least 1.`);
    this.halfmove = Number(half);
    this.fullmove = Number(full);

    const k0 = this.kings[0]!;
    const k1 = this.kings[1]!;
    if (Math.abs((k0 >> 4) - (k1 >> 4)) <= 1 && Math.abs((k0 & 7) - (k1 & 7)) <= 1) {
      throw new FenError('The two kings cannot stand on adjacent squares.');
    }
    if (this.isAttacked(this.kings[(this.turn ^ 8) >> 3]!, this.turn)) {
      throw new FenError(`The side not to move (${this.turn === WHITE ? 'Black' : 'White'}) is in check, which is impossible.`);
    }
    this.undoStack = [];
    this.computeHash();
  }

  computeHash(): void {
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = this.board[sq]!;
      if (p) {
        lo ^= Z_PIECE_LO[p * 128 + sq]!;
        hi ^= Z_PIECE_HI[p * 128 + sq]!;
      }
    }
    lo ^= Z_CASTLE_LO[this.castling]!;
    hi ^= Z_CASTLE_HI[this.castling]!;
    if (this.turn === BLACK) {
      lo ^= Z_SIDE_LO;
      hi ^= Z_SIDE_HI;
    }
    this.hashLo = lo;
    this.hashHi = hi;
  }

  /** FEN; the en passant square is written only when an en passant capture is legal. */
  fen(): string {
    return `${this.placementFen()} ${this.turn === WHITE ? 'w' : 'b'} ${this.castlingFen()} ${this.legalEpSquare() >= 0 ? sqName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  placementFen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.board[rank * 16 + file]!;
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          row += empty;
          empty = 0;
        }
        const ch = PIECE_CHARS[p & 7]!;
        row += p & BLACK ? ch : ch.toUpperCase();
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return rows.join('/');
  }

  castlingFen(): string {
    let s = '';
    if (this.castling & CASTLE_WK) s += 'K';
    if (this.castling & CASTLE_WQ) s += 'Q';
    if (this.castling & CASTLE_BK) s += 'k';
    if (this.castling & CASTLE_BQ) s += 'q';
    return s || '-';
  }

  /** Returns the en passant target square only if a legal en passant capture exists, else -1. */
  legalEpSquare(): number {
    if (this.ep < 0) return -1;
    const us = this.turn;
    const back = us === WHITE ? -16 : 16;
    for (const side of [-1, 1]) {
      const from = this.ep + back + side;
      if (from & 0x88) continue;
      if (this.board[from] !== (us | PAWN)) continue;
      const m = encodeMove(from, this.ep, 0, FLAG_EP);
      this.make(m);
      const legal = !this.isAttacked(this.kings[us >> 3]!, this.turn);
      this.unmake(m);
      if (legal) return this.ep;
    }
    return -1;
  }

  isAttacked(sq: number, by: number): boolean {
    const b = this.board;
    if (by === WHITE) {
      const a = sq - 15;
      const c = sq - 17;
      if (!(a & 0x88) && b[a] === (WHITE | PAWN)) return true;
      if (!(c & 0x88) && b[c] === (WHITE | PAWN)) return true;
    } else {
      const a = sq + 15;
      const c = sq + 17;
      if (!(a & 0x88) && b[a] === (BLACK | PAWN)) return true;
      if (!(c & 0x88) && b[c] === (BLACK | PAWN)) return true;
    }
    const knight = by | KNIGHT;
    for (let i = 0; i < 8; i++) {
      const t = sq + KNIGHT_STEPS[i]!;
      if (!(t & 0x88) && b[t] === knight) return true;
    }
    const king = by | KING;
    for (let i = 0; i < 8; i++) {
      const t = sq + KING_STEPS[i]!;
      if (!(t & 0x88) && b[t] === king) return true;
    }
    const rook = by | ROOK;
    const bishop = by | BISHOP;
    const queen = by | QUEEN;
    for (let i = 0; i < 4; i++) {
      const d = ROOK_DIRS[i]!;
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t]!;
        if (p) {
          if (p === rook || p === queen) return true;
          break;
        }
        t += d;
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_DIRS[i]!;
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t]!;
        if (p) {
          if (p === bishop || p === queen) return true;
          break;
        }
        t += d;
      }
    }
    return false;
  }

  inCheck(): boolean {
    return this.isAttacked(this.kings[this.turn >> 3]!, this.turn ^ 8);
  }

  /** Pseudo-legal move generation. capturesOnly also includes queen promotions. */
  generatePseudo(out: number[], capturesOnly = false): void {
    const b = this.board;
    const us = this.turn;
    const them = us ^ 8;
    const fwd = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const promoRank = us === WHITE ? 7 : 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = b[sq]!;
      if (!p || (p & 8) !== us) continue;
      const type = p & 7;
      if (type === PAWN) {
        const t = sq + fwd;
        if (!(t & 0x88) && b[t] === 0) {
          if (t >> 4 === promoRank) {
            out.push(encodeMove(sq, t, QUEEN, FLAG_QUIET));
            if (!capturesOnly) {
              out.push(encodeMove(sq, t, ROOK, FLAG_QUIET));
              out.push(encodeMove(sq, t, BISHOP, FLAG_QUIET));
              out.push(encodeMove(sq, t, KNIGHT, FLAG_QUIET));
            }
          } else if (!capturesOnly) {
            out.push(encodeMove(sq, t, 0, FLAG_QUIET));
            const t2 = t + fwd;
            if (sq >> 4 === startRank && b[t2] === 0) out.push(encodeMove(sq, t2, 0, FLAG_DOUBLE));
          }
        }
        for (const side of [-1, 1]) {
          const c = sq + fwd + side;
          if (c & 0x88) continue;
          const target = b[c]!;
          if (target && (target & 8) === them) {
            if (c >> 4 === promoRank) {
              out.push(encodeMove(sq, c, QUEEN, FLAG_CAPTURE));
              out.push(encodeMove(sq, c, ROOK, FLAG_CAPTURE));
              out.push(encodeMove(sq, c, BISHOP, FLAG_CAPTURE));
              out.push(encodeMove(sq, c, KNIGHT, FLAG_CAPTURE));
            } else {
              out.push(encodeMove(sq, c, 0, FLAG_CAPTURE));
            }
          } else if (c === this.ep) {
            out.push(encodeMove(sq, c, 0, FLAG_EP));
          }
        }
      } else if (type === KNIGHT || type === KING) {
        const steps = type === KNIGHT ? KNIGHT_STEPS : KING_STEPS;
        for (let i = 0; i < 8; i++) {
          const t = sq + steps[i]!;
          if (t & 0x88) continue;
          const target = b[t]!;
          if (!target) {
            if (!capturesOnly) out.push(encodeMove(sq, t, 0, FLAG_QUIET));
          } else if ((target & 8) === them) {
            out.push(encodeMove(sq, t, 0, FLAG_CAPTURE));
          }
        }
      } else {
        const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : KING_STEPS;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i]!;
          let t = sq + d;
          while (!(t & 0x88)) {
            const target = b[t]!;
            if (!target) {
              if (!capturesOnly) out.push(encodeMove(sq, t, 0, FLAG_QUIET));
            } else {
              if ((target & 8) === them) out.push(encodeMove(sq, t, 0, FLAG_CAPTURE));
              break;
            }
            t += d;
          }
        }
      }
    }
    if (!capturesOnly) this.generateCastling(out);
  }

  private generateCastling(out: number[]): void {
    const us = this.turn;
    const them = us ^ 8;
    const b = this.board;
    const base = us === WHITE ? 0 : 112;
    const kRight = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const qRight = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
    if (!(this.castling & (kRight | qRight))) return;
    const e = base + 4;
    if (b[e] !== (us | KING)) return;
    if (this.isAttacked(e, them)) return;
    if (this.castling & kRight && b[base + 7] === (us | ROOK) && !b[base + 5] && !b[base + 6]) {
      if (!this.isAttacked(base + 5, them) && !this.isAttacked(base + 6, them)) {
        out.push(encodeMove(e, base + 6, 0, FLAG_CASTLE_K));
      }
    }
    if (this.castling & qRight && b[base] === (us | ROOK) && !b[base + 1] && !b[base + 2] && !b[base + 3]) {
      if (!this.isAttacked(base + 3, them) && !this.isAttacked(base + 2, them)) {
        out.push(encodeMove(e, base + 2, 0, FLAG_CASTLE_Q));
      }
    }
  }

  /** Fully legal moves for the side to move. */
  legalMoves(): number[] {
    const pseudo: number[] = [];
    this.generatePseudo(pseudo);
    const legal: number[] = [];
    const us = this.turn;
    for (const m of pseudo) {
      this.make(m);
      if (!this.isAttacked(this.kings[us >> 3]!, this.turn)) legal.push(m);
      this.unmake(m);
    }
    return legal;
  }

  /** Makes a (pseudo-legal) move. Returns false and restores the position if it leaves the mover in check. */
  makeLegal(m: number): boolean {
    const us = this.turn;
    this.make(m);
    if (this.isAttacked(this.kings[us >> 3]!, this.turn)) {
      this.unmake(m);
      return false;
    }
    return true;
  }

  make(m: number): void {
    const b = this.board;
    const from = m & 127;
    const to = (m >> 7) & 127;
    const promo = (m >> 14) & 7;
    const flag = (m >> 17) & 7;
    const piece = b[from]!;
    const us = this.turn;
    let capSq = to;
    if (flag === FLAG_EP) capSq = us === WHITE ? to - 16 : to + 16;
    const captured = b[capSq]!;
    this.undoStack.push(captured, this.castling, this.ep, this.halfmove, this.hashLo, this.hashHi);
    let lo = this.hashLo;
    let hi = this.hashHi;
    if (captured) {
      lo ^= Z_PIECE_LO[captured * 128 + capSq]!;
      hi ^= Z_PIECE_HI[captured * 128 + capSq]!;
      b[capSq] = 0;
    }
    lo ^= Z_PIECE_LO[piece * 128 + from]!;
    hi ^= Z_PIECE_HI[piece * 128 + from]!;
    b[from] = 0;
    const placed = promo ? us | promo : piece;
    b[to] = placed;
    lo ^= Z_PIECE_LO[placed * 128 + to]!;
    hi ^= Z_PIECE_HI[placed * 128 + to]!;
    if (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q) {
      const rFrom = flag === FLAG_CASTLE_K ? to + 1 : to - 2;
      const rTo = flag === FLAG_CASTLE_K ? to - 1 : to + 1;
      const rook = b[rFrom]!;
      b[rFrom] = 0;
      b[rTo] = rook;
      lo ^= Z_PIECE_LO[rook * 128 + rFrom]! ^ Z_PIECE_LO[rook * 128 + rTo]!;
      hi ^= Z_PIECE_HI[rook * 128 + rFrom]! ^ Z_PIECE_HI[rook * 128 + rTo]!;
    }
    if ((piece & 7) === KING) this.kings[us >> 3] = to;
    lo ^= Z_CASTLE_LO[this.castling]!;
    hi ^= Z_CASTLE_HI[this.castling]!;
    this.castling &= CASTLE_MASK[from]! & CASTLE_MASK[to]!;
    lo ^= Z_CASTLE_LO[this.castling]!;
    hi ^= Z_CASTLE_HI[this.castling]!;
    this.ep = flag === FLAG_DOUBLE ? (from + to) >> 1 : -1;
    this.halfmove = (piece & 7) === PAWN || captured ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = us ^ 8;
    this.hashLo = lo ^ Z_SIDE_LO;
    this.hashHi = hi ^ Z_SIDE_HI;
  }

  unmake(m: number): void {
    const b = this.board;
    const from = m & 127;
    const to = (m >> 7) & 127;
    const promo = (m >> 14) & 7;
    const flag = (m >> 17) & 7;
    const s = this.undoStack;
    this.hashHi = s.pop()!;
    this.hashLo = s.pop()!;
    this.halfmove = s.pop()!;
    this.ep = s.pop()!;
    this.castling = s.pop()!;
    const captured = s.pop()!;
    const us = this.turn ^ 8;
    this.turn = us;
    if (us === BLACK) this.fullmove--;
    const placed = b[to]!;
    const piece = promo ? us | PAWN : placed;
    b[from] = piece;
    b[to] = 0;
    if (flag === FLAG_EP) {
      b[us === WHITE ? to - 16 : to + 16] = captured;
    } else if (captured) {
      b[to] = captured;
    }
    if (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q) {
      const rFrom = flag === FLAG_CASTLE_K ? to + 1 : to - 2;
      const rTo = flag === FLAG_CASTLE_K ? to - 1 : to + 1;
      b[rFrom] = b[rTo]!;
      b[rTo] = 0;
    }
    if ((piece & 7) === KING) this.kings[us >> 3] = from;
  }

  makeNull(): void {
    this.undoStack.push(this.ep, this.hashLo, this.hashHi);
    this.ep = -1;
    this.turn ^= 8;
    this.hashLo ^= Z_SIDE_LO;
    this.hashHi ^= Z_SIDE_HI;
  }

  unmakeNull(): void {
    this.hashHi = this.undoStack.pop()!;
    this.hashLo = this.undoStack.pop()!;
    this.ep = this.undoStack.pop()!;
    this.turn ^= 8;
  }

  /**
   * True when `color` cannot possibly checkmate by any legal sequence based on material.
   * Mirrors the established python-chess heuristic:
   *  - pawns, rooks or queens => sufficient;
   *  - a lone knight (only piece besides the king) => insufficient unless the opponent
   *    has pawns, knights, bishops or rooks that could block their own king;
   *  - only bishops => insufficient if all bishops on the board share a square colour and
   *    there are no pawns or knights on the board;
   *  - bare king => insufficient.
   */
  hasInsufficientMaterial(color: number): boolean {
    const b = this.board;
    let ownKnights = 0;
    let ownBishops = 0;
    let ownCount = 0;
    let oppNonKingNonQueen = 0;
    let anyPawn = false;
    let anyKnight = false;
    let lightBishops = 0;
    let darkBishops = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = b[sq]!;
      if (!p) continue;
      const type = p & 7;
      const own = (p & 8) === color;
      if (type === PAWN) anyPawn = true;
      if (type === KNIGHT) anyKnight = true;
      if (type === BISHOP) {
        if (((sq >> 4) + (sq & 7)) % 2 === 0) darkBishops++;
        else lightBishops++;
      }
      if (own) {
        ownCount++;
        if (type === PAWN || type === ROOK || type === QUEEN) return false;
        if (type === KNIGHT) ownKnights++;
        if (type === BISHOP) ownBishops++;
      } else if (type !== KING && type !== QUEEN) {
        oppNonKingNonQueen++;
      }
    }
    if (ownKnights) return ownCount <= 2 && oppNonKingNonQueen === 0;
    if (ownBishops) {
      const sameColour = lightBishops === 0 || darkBishops === 0;
      return sameColour && !anyPawn && !anyKnight;
    }
    return true;
  }

  isInsufficientMaterial(): boolean {
    return this.hasInsufficientMaterial(WHITE) && this.hasInsufficientMaterial(BLACK);
  }
}

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    pos.make(m);
    n += perft(pos, depth - 1);
    pos.unmake(m);
  }
  return n;
}
