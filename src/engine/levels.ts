import type { Difficulty } from '../core/session';

/**
 * Actual engine settings per difficulty. These are the real parameters passed to
 * the search; no Elo ratings are claimed because none have been measured.
 */
export interface LevelConfig {
  id: Difficulty;
  /** Maximum iterative-deepening depth in plies (before check extensions and quiescence). */
  maxDepth: number;
  /** Time budget per move in milliseconds (further reduced when the engine's clock is low). */
  moveTimeMs: number;
  /** Score every root move at fixed depth and choose among near-best moves (weaker, more human-like play). */
  multiScore: boolean;
  /** Root moves within this many centipawns of the best are treated as equally good. */
  randomMarginCp: number;
  /** Probability of deliberately choosing from a wider pool of weaker moves. */
  blunderChance: number;
  /** Width of that wider pool, in centipawns below the best move. */
  blunderMarginCp: number;
  quiescence: boolean;
  nullMovePruning: boolean;
  lateMoveReductions: boolean;
  /** Transposition table size = 2^ttBits entries. */
  ttBits: number;
  /** Minimum time before the move is returned, so very fast levels do not feel abrupt. */
  minThinkMs: number;
}

export const LEVELS: Record<Difficulty, LevelConfig> = {
  easy: {
    id: 'easy',
    maxDepth: 1,
    moveTimeMs: 400,
    multiScore: true,
    randomMarginCp: 120,
    blunderChance: 0.2,
    blunderMarginCp: 450,
    quiescence: true,
    nullMovePruning: false,
    lateMoveReductions: false,
    ttBits: 14,
    minThinkMs: 400,
  },
  medium: {
    id: 'medium',
    maxDepth: 3,
    moveTimeMs: 1000,
    multiScore: true,
    randomMarginCp: 35,
    blunderChance: 0.06,
    blunderMarginCp: 180,
    quiescence: true,
    nullMovePruning: false,
    lateMoveReductions: false,
    ttBits: 17,
    minThinkMs: 400,
  },
  hard: {
    id: 'hard',
    maxDepth: 6,
    moveTimeMs: 1500,
    multiScore: false,
    randomMarginCp: 0,
    blunderChance: 0,
    blunderMarginCp: 0,
    quiescence: true,
    nullMovePruning: true,
    lateMoveReductions: true,
    ttBits: 19,
    minThinkMs: 0,
  },
  expert: {
    id: 'expert',
    maxDepth: 64,
    moveTimeMs: 3500,
    multiScore: false,
    randomMarginCp: 0,
    blunderChance: 0,
    blunderMarginCp: 0,
    quiescence: true,
    nullMovePruning: true,
    lateMoveReductions: true,
    ttBits: 20,
    minThinkMs: 0,
  },
};

/**
 * Time budget for one move given the engine's remaining clock.
 * Uses roughly 1/30 of the remaining time plus most of the increment, capped by the level budget.
 */
export function budgetForMove(level: LevelConfig, remainingMs: number | null, incrementMs: number): number {
  if (remainingMs === null || !Number.isFinite(remainingMs)) return level.moveTimeMs;
  const share = remainingMs / 30 + incrementMs * 0.8;
  const safe = Math.min(share, remainingMs * 0.5);
  return Math.max(30, Math.min(level.moveTimeMs, Math.floor(safe)));
}
