/**
 * Kingside engine: iterative-deepening alpha-beta (negamax, PVS) with quiescence search,
 * transposition table, MVV-LVA / killer / history move ordering, null-move pruning,
 * late-move reductions, check extension and a tapered piece-square evaluation.
 * Pure TypeScript, runs inside a Web Worker in the app and directly in Node for tests.
 */
import {
  BISHOP,
  BLACK,
  FLAG_EP,
  KING,
  PAWN,
  Position,
  QUEEN,
  WHITE,
  moveFlag,
  moveFrom,
  movePromo,
  moveTo,
  moveToUci,
} from '../core/rules/position';
import type { LevelConfig } from './levels';

export const MATE = 100_000;
const INF = 1_000_000;
const MAX_PLY = 128;

export interface SearchOptions {
  timeLimitMs: number;
  random?: () => number;
  now?: () => number;
}

export interface SearchResult {
  bestMove: string;
  /** Centipawns from the side to move's perspective (mate scores are ±(MATE - plies)). */
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

// ------------------------------------------------------------------ evaluation
const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
const PHASE_INC = [0, 0, 1, 1, 2, 4, 0];

// Piece-square tables, a8..h8 first (white's perspective), simplified evaluation values.
const PST_PAWN_MG = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0,
  0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_PAWN_EG = [
  0, 0, 0, 0, 0, 0, 0, 0, 90, 90, 90, 90, 90, 90, 90, 90, 50, 50, 50, 50, 50, 50, 50, 50, 30, 30, 30, 30, 30, 30, 30, 30,
  15, 15, 15, 15, 15, 15, 15, 15, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20,
  20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40,
  -30, -30, -30, -30, -40, -50,
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5,
  5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10,
  -10, -10, -10, -20,
];
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
  0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0,
  0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
];
const PST_KING_MG = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
];
const PST_KING_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10,
  30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0,
  -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
];
const PST_MG = [[], PST_PAWN_MG, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_MG];
const PST_EG = [[], PST_PAWN_EG, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_EG];

/** Static evaluation in centipawns from the side to move's perspective. */
export function evaluate(pos: Position): number {
  const b = pos.board;
  let mg = 0;
  let eg = 0;
  let phase = 0;
  let wBishops = 0;
  let bBishops = 0;
  const wPawnFiles = new Int8Array(8);
  const bPawnFiles = new Int8Array(8);
  const wPawnMaxRank = new Int8Array(8).fill(-1);
  const bPawnMinRank = new Int8Array(8).fill(8);
  const wPawnMinRank = new Int8Array(8).fill(8);
  const bPawnMaxRank = new Int8Array(8).fill(-1);
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq]!;
    if (!p) continue;
    const type = p & 7;
    const rank = sq >> 4;
    const file = sq & 7;
    phase += PHASE_INC[type]!;
    if (p & BLACK) {
      const idx = rank * 8 + file;
      mg -= MG_VALUE[type]! + PST_MG[type]![idx]!;
      eg -= EG_VALUE[type]! + PST_EG[type]![idx]!;
      if (type === BISHOP) bBishops++;
      if (type === PAWN) {
        bPawnFiles[file]!++;
        if (rank < bPawnMinRank[file]!) bPawnMinRank[file] = rank;
        if (rank > bPawnMaxRank[file]!) bPawnMaxRank[file] = rank;
      }
    } else {
      const idx = (7 - rank) * 8 + file;
      mg += MG_VALUE[type]! + PST_MG[type]![idx]!;
      eg += EG_VALUE[type]! + PST_EG[type]![idx]!;
      if (type === BISHOP) wBishops++;
      if (type === PAWN) {
        wPawnFiles[file]!++;
        if (rank > wPawnMaxRank[file]!) wPawnMaxRank[file] = rank;
        if (rank < wPawnMinRank[file]!) wPawnMinRank[file] = rank;
      }
    }
  }
  if (wBishops >= 2) {
    mg += 30;
    eg += 45;
  }
  if (bBishops >= 2) {
    mg -= 30;
    eg -= 45;
  }
  // Pawn structure: doubled, isolated and passed pawns.
  for (let f = 0; f < 8; f++) {
    const wl = f > 0 ? wPawnFiles[f - 1]! : 0;
    const wr = f < 7 ? wPawnFiles[f + 1]! : 0;
    const bl = f > 0 ? bPawnFiles[f - 1]! : 0;
    const br = f < 7 ? bPawnFiles[f + 1]! : 0;
    if (wPawnFiles[f]! > 1) {
      mg -= 10 * (wPawnFiles[f]! - 1);
      eg -= 20 * (wPawnFiles[f]! - 1);
    }
    if (bPawnFiles[f]! > 1) {
      mg += 10 * (bPawnFiles[f]! - 1);
      eg += 20 * (bPawnFiles[f]! - 1);
    }
    if (wPawnFiles[f]! && !wl && !wr) {
      mg -= 12;
      eg -= 15;
    }
    if (bPawnFiles[f]! && !bl && !br) {
      mg += 12;
      eg += 15;
    }
    if (wPawnFiles[f]!) {
      const r = wPawnMaxRank[f]!;
      let passed = true;
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
        if (bPawnFiles[ff]! && bPawnMaxRank[ff]! > r) passed = false;
      }
      if (passed) {
        mg += 5 + r * 4;
        eg += 10 + r * r * 4;
      }
    }
    if (bPawnFiles[f]!) {
      const r = bPawnMinRank[f]!;
      let passed = true;
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
        if (wPawnFiles[ff]! && wPawnMinRank[ff]! < r) passed = false;
      }
      if (passed) {
        const adv = 7 - r;
        mg -= 5 + adv * 4;
        eg -= 10 + adv * adv * 4;
      }
    }
  }
  const ph = Math.min(phase, 24);
  const score = Math.round((mg * ph + eg * (24 - ph)) / 24);
  return pos.turn === WHITE ? score : -score;
}

// ------------------------------------------------------------------ search
class AbortSearch extends Error {}

const VICTIM = [0, 100, 320, 330, 500, 900, 0];

export class Searcher {
  private pos: Position;
  private level: LevelConfig;
  private deadline = 0;
  private now: () => number;
  private random: () => number;
  nodes = 0;
  private ttMask: number;
  private ttHi: Int32Array;
  private ttMove: Int32Array;
  private ttScore: Int32Array;
  private ttDepth: Int8Array;
  private ttFlag: Uint8Array;
  private killers = new Int32Array(MAX_PLY * 2);
  private history = new Int32Array(16 * 128);
  private histLo: number[] = [];
  private histHi: number[] = [];

  constructor(pos: Position, level: LevelConfig, gameHashes: { lo: number[]; hi: number[] }, opts: SearchOptions) {
    this.pos = pos;
    this.level = level;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    const size = 1 << level.ttBits;
    this.ttMask = size - 1;
    this.ttHi = new Int32Array(size);
    this.ttMove = new Int32Array(size);
    this.ttScore = new Int32Array(size);
    this.ttDepth = new Int8Array(size).fill(-1);
    this.ttFlag = new Uint8Array(size);
    this.histLo = [...gameHashes.lo];
    this.histHi = [...gameHashes.hi];
  }

  private checkTime(): void {
    if ((this.nodes & 1023) === 0 && this.now() > this.deadline) throw new AbortSearch();
  }

  private isRepetition(): boolean {
    const n = this.histLo.length;
    const lo = this.pos.hashLo;
    const hi = this.pos.hashHi;
    const limit = Math.max(0, n - 1 - this.pos.halfmove);
    for (let i = n - 3; i >= limit; i -= 2) {
      if (this.histLo[i] === lo && this.histHi[i] === hi) return true;
    }
    return false;
  }

  private hasNonPawnMaterial(color: number): boolean {
    const b = this.pos.board;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const p = b[sq]!;
      if (p && (p & 8) === color) {
        const t = p & 7;
        if (t !== PAWN && t !== KING) return true;
      }
    }
    return false;
  }

  private scoreMoves(moves: number[], ttMove: number, ply: number): Int32Array {
    const scores = new Int32Array(moves.length);
    const b = this.pos.board;
    const k1 = this.killers[ply * 2]!;
    const k2 = this.killers[ply * 2 + 1]!;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]!;
      if (m === ttMove) {
        scores[i] = 2_000_000;
        continue;
      }
      const to = moveTo(m);
      const from = moveFrom(m);
      const victim = moveFlag(m) === FLAG_EP ? PAWN : b[to]! & 7;
      const promo = movePromo(m);
      if (victim || promo) {
        scores[i] = 1_000_000 + VICTIM[victim]! * 10 - (b[from]! & 7) + (promo === QUEEN ? 800_000 : promo ? -500_000 : 0);
      } else if (m === k1) scores[i] = 900_000;
      else if (m === k2) scores[i] = 800_000;
      else scores[i] = this.history[b[from]! * 128 + to]!;
    }
    return scores;
  }

  private pickNext(moves: number[], scores: Int32Array, start: number): number {
    let best = start;
    for (let i = start + 1; i < moves.length; i++) if (scores[i]! > scores[best]!) best = i;
    if (best !== start) {
      const m = moves[start]!;
      moves[start] = moves[best]!;
      moves[best] = m;
      const s = scores[start]!;
      scores[start] = scores[best]!;
      scores[best] = s;
    }
    return moves[start]!;
  }

  private quiesce(alpha: number, beta: number, ply: number): number {
    this.nodes++;
    this.checkTime();
    const pos = this.pos;
    const inCheck = pos.inCheck();
    if (ply >= MAX_PLY - 1) return evaluate(pos);
    let standPat = -INF;
    if (!inCheck) {
      standPat = evaluate(pos);
      if (standPat >= beta) return standPat;
      if (standPat > alpha) alpha = standPat;
    }
    const moves: number[] = [];
    pos.generatePseudo(moves, !inCheck);
    const scores = this.scoreMoves(moves, 0, ply);
    let legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = this.pickNext(moves, scores, i);
      if (!inCheck) {
        const victim = moveFlag(m) === FLAG_EP ? PAWN : pos.board[moveTo(m)]! & 7;
        if (!movePromo(m) && standPat + VICTIM[victim]! + 200 < alpha) continue;
      }
      if (!pos.makeLegal(m)) continue;
      legal++;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake(m);
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    if (inCheck && legal === 0) return -MATE + ply;
    return alpha;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
    const pos = this.pos;
    if (ply > 0) {
      if (pos.halfmove >= 100 || this.isRepetition() || pos.isInsufficientMaterial()) return 0;
      // Mate distance pruning.
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.level.quiescence ? this.quiesce(alpha, beta, ply) : evaluate(pos);
    this.nodes++;
    this.checkTime();
    if (ply >= MAX_PLY - 1) return evaluate(pos);

    const idx = pos.hashLo & this.ttMask;
    let ttMove = 0;
    if (this.ttHi[idx] === pos.hashHi && this.ttDepth[idx]! >= 0) {
      ttMove = this.ttMove[idx]!;
      if (ply > 0 && this.ttDepth[idx]! >= depth) {
        let s = this.ttScore[idx]!;
        if (s > MATE - MAX_PLY) s -= ply;
        else if (s < -MATE + MAX_PLY) s += ply;
        const flag = this.ttFlag[idx]!;
        if (flag === 0) return s;
        if (flag === 1 && s >= beta) return s;
        if (flag === 2 && s <= alpha) return s;
      }
    }

    const us = pos.turn;
    if (
      this.level.nullMovePruning &&
      allowNull &&
      !inCheck &&
      depth >= 3 &&
      beta < MATE - MAX_PLY &&
      this.hasNonPawnMaterial(us) &&
      evaluate(pos) >= beta
    ) {
      pos.makeNull();
      this.histLo.push(pos.hashLo);
      this.histHi.push(pos.hashHi);
      let score: number;
      try {
        score = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      } finally {
        this.histLo.pop();
        this.histHi.pop();
        pos.unmakeNull();
      }
      if (score >= beta) return beta;
    }

    const moves: number[] = [];
    pos.generatePseudo(moves);
    const scores = this.scoreMoves(moves, ttMove, ply);
    const alphaOrig = alpha;
    let best = -INF;
    let bestMove = 0;
    let legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = this.pickNext(moves, scores, i);
      const isQuiet = !(pos.board[moveTo(m)]! || movePromo(m) || moveFlag(m) === FLAG_EP);
      const movedPiece = pos.board[moveFrom(m)]!;
      if (!pos.makeLegal(m)) continue;
      legal++;
      this.histLo.push(pos.hashLo);
      this.histHi.push(pos.hashHi);
      let score: number;
      try {
        if (legal === 1) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        } else {
          let reduction = 0;
          if (this.level.lateMoveReductions && depth >= 3 && legal > 3 && isQuiet && !inCheck && !pos.inCheck()) {
            reduction = legal > 8 ? 2 : 1;
          }
          score = -this.negamax(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
          if (score > alpha && (reduction > 0 || score < beta)) {
            score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
          }
        }
      } finally {
        this.histLo.pop();
        this.histHi.pop();
        pos.unmake(m);
      }
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          if (isQuiet) {
            if (this.killers[ply * 2] !== m) {
              this.killers[ply * 2 + 1] = this.killers[ply * 2]!;
              this.killers[ply * 2] = m;
            }
            this.history[movedPiece * 128 + moveTo(m)]! += depth * depth;
          }
          break;
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;

    let stored = best;
    if (stored > MATE - MAX_PLY) stored += ply;
    else if (stored < -MATE + MAX_PLY) stored -= ply;
    this.ttHi[idx] = pos.hashHi;
    this.ttMove[idx] = bestMove;
    this.ttScore[idx] = stored;
    this.ttDepth[idx] = Math.min(depth, 127);
    this.ttFlag[idx] = best <= alphaOrig ? 2 : best >= beta ? 1 : 0;
    return best;
  }

  private searchRoot(order: number[], depth: number): { move: number; score: number } {
    const pos = this.pos;
    let alpha = -INF;
    let best = -INF;
    let bestMove = order[0]!;
    for (let i = 0; i < order.length; i++) {
      const m = order[i]!;
      pos.make(m);
      this.histLo.push(pos.hashLo);
      this.histHi.push(pos.hashHi);
      let score: number;
      try {
        if (i === 0) {
          score = -this.negamax(depth - 1, -INF, -alpha, 1, true);
        } else {
          score = -this.negamax(depth - 1, -alpha - 1, -alpha, 1, true);
          if (score > alpha) score = -this.negamax(depth - 1, -INF, -alpha, 1, true);
        }
      } finally {
        this.histLo.pop();
        this.histHi.pop();
        pos.unmake(m);
      }
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
    }
    return { move: bestMove, score: best };
  }

  /** Scores every legal root move at `depth` (full window) for the weaker levels. */
  private scoreRoot(rootMoves: number[], depth: number): { move: number; score: number }[] {
    const pos = this.pos;
    const out: { move: number; score: number }[] = [];
    for (const m of rootMoves) {
      pos.make(m);
      this.histLo.push(pos.hashLo);
      this.histHi.push(pos.hashHi);
      try {
        out.push({ move: m, score: -this.negamax(depth - 1, -INF, INF, 1, true) });
      } finally {
        this.histLo.pop();
        this.histHi.pop();
        pos.unmake(m);
      }
    }
    return out;
  }

  run(timeLimitMs: number): SearchResult {
    const start = this.now();
    this.deadline = start + Math.max(1, timeLimitMs);
    const pos = this.pos;
    const rootMoves = pos.legalMoves();
    if (!rootMoves.length) throw new Error('No legal moves in this position.');
    if (rootMoves.length === 1) {
      return { bestMove: moveToUci(rootMoves[0]!), score: 0, depth: 0, nodes: 0, timeMs: this.now() - start };
    }

    if (this.level.multiScore) {
      let scored: { move: number; score: number }[] = [];
      let depthDone = 0;
      for (let d = 1; d <= this.level.maxDepth; d++) {
        try {
          scored = this.scoreRoot(rootMoves, d);
          depthDone = d;
        } catch (e) {
          if (!(e instanceof AbortSearch)) throw e;
          if (!scored.length) {
            // Guarantee a usable answer: fall back to a static one-ply evaluation.
            this.deadline = Infinity;
            scored = this.scoreRoot(rootMoves, 1);
            depthDone = 1;
          }
          break;
        }
      }
      scored.sort((a, b) => b.score - a.score);
      const bestScore = scored[0]!.score;
      const forcedMate = bestScore > MATE - MAX_PLY;
      const margin =
        !forcedMate && this.random() < this.level.blunderChance ? this.level.blunderMarginCp : this.level.randomMarginCp;
      const pool = scored.filter((s) => s.score >= bestScore - margin && s.score > -MATE + MAX_PLY);
      const choice = (pool.length ? pool : scored)[Math.floor(this.random() * (pool.length || scored.length))]!;
      return {
        bestMove: moveToUci(choice.move),
        score: choice.score,
        depth: depthDone,
        nodes: this.nodes,
        timeMs: this.now() - start,
      };
    }

    let order = rootMoves.slice();
    let bestMove = order[0]!;
    let bestScore = 0;
    let depthDone = 0;
    for (let d = 1; d <= this.level.maxDepth; d++) {
      // Depth 1 always completes so a legal, sensible move is always available.
      this.deadline = d === 1 ? Infinity : start + Math.max(1, timeLimitMs);
      try {
        const { move, score } = this.searchRoot(order, d);
        bestMove = move;
        bestScore = score;
        depthDone = d;
        order = [move, ...order.filter((m) => m !== move)];
        if (Math.abs(score) > MATE - MAX_PLY) break;
        // Do not start an iteration that is unlikely to finish in time.
        if (this.now() - start > timeLimitMs * 0.55) break;
      } catch (e) {
        if (!(e instanceof AbortSearch)) throw e;
        break;
      }
    }
    return { bestMove: moveToUci(bestMove), score: bestScore, depth: depthDone, nodes: this.nodes, timeMs: this.now() - start };
  }
}

/** Builds the position (with repetition history) from a start FEN and UCI moves, then searches. */
export function searchBestMove(
  startFen: string,
  moves: readonly string[],
  level: LevelConfig,
  opts: SearchOptions,
): SearchResult {
  const pos = Position.fromFen(startFen);
  const lo: number[] = [pos.hashLo];
  const hi: number[] = [pos.hashHi];
  for (const uci of moves) {
    const code = pos.legalMoves().find((m) => moveToUci(m) === uci);
    if (code === undefined) throw new Error(`Illegal move in engine request: ${uci}`);
    pos.make(code);
    lo.push(pos.hashLo);
    hi.push(pos.hashHi);
  }
  const searcher = new Searcher(pos, level, { lo, hi }, opts);
  return searcher.run(opts.timeLimitMs);
}

