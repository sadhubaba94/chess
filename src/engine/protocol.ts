import type { Difficulty } from '../core/session';

export interface SearchRequest {
  startFen: string;
  moves: readonly string[];
  difficulty: Difficulty;
  timeLimitMs: number;
}

export type ToWorker = { type: 'init' } | ({ type: 'search'; id: number } & SearchRequest);

export type FromWorker =
  | { type: 'ready' }
  | { type: 'result'; id: number; move: string; score: number; depth: number; nodes: number; timeMs: number }
  | { type: 'error'; id: number; message: string };

export interface EngineMove {
  move: string;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}
