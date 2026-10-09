import {
  afterMove,
  createClock,
  flaggedAt,
  isPaused,
  isTimed,
  pauseClock,
  resumeClock,
  stopClock,
  type ClockState,
  type TimeControl,
} from './clock';
import { ChessGame } from './rules/game';
import { START_FEN, opposite, type Color, type GameResult, type Termination } from './types';

export type GameMode = 'computer' | 'local';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
};

export interface GameConfig {
  mode: GameMode;
  /** Colour played by the human in computer mode (ignored in local mode). */
  humanColor: Color;
  difficulty: Difficulty;
  timeControl: TimeControl;
}

export const GAME_SCHEMA_VERSION = 1 as const;

export interface GameRecord {
  schemaVersion: typeof GAME_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  updatedAt: number;
  config: GameConfig;
  startFen: string;
  /** Full move list in UCI notation; replaying it restores repetition history exactly. */
  moves: string[];
  clock: ClockState;
  result: GameResult | null;
  /** Colour that has an outstanding draw offer (local mode only). */
  drawOffer: Color | null;
  source: 'new' | 'pgn' | 'fen';
}

export type GameAction =
  | { type: 'move'; uci: string; now: number }
  | { type: 'undo'; now: number }
  | { type: 'resign'; color: Color; now: number }
  | { type: 'offerDraw'; color: Color }
  | { type: 'declineDraw' }
  | { type: 'acceptDraw'; now: number }
  | { type: 'claimDraw'; now: number }
  | { type: 'flag'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'restart'; now: number };

const UNDOABLE_RESULTS: ReadonlySet<Termination> = new Set([
  'checkmate',
  'stalemate',
  'insufficient_material',
  'fivefold_repetition',
  'seventyfive_moves',
  'threefold_repetition',
  'fifty_moves',
]);

export function createGameRecord(
  config: GameConfig,
  options: { id: string; now: number; startFen?: string; moves?: string[]; result?: GameResult | null; source?: GameRecord['source'] },
): GameRecord {
  const game = ChessGame.fromUciMoves(options.startFen ?? START_FEN, options.moves ?? []);
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    id: options.id,
    createdAt: options.now,
    updatedAt: options.now,
    config,
    startFen: game.startFen,
    moves: game.uciMoves(),
    clock: createClock(config.timeControl),
    result: options.result ?? game.automaticOutcome(),
    drawOffer: null,
    source: options.source ?? 'new',
  };
}

export function replay(record: Pick<GameRecord, 'startFen' | 'moves'>): ChessGame {
  return ChessGame.fromUciMoves(record.startFen, record.moves);
}

export function isEngineTurn(record: GameRecord, game: ChessGame): boolean {
  return record.config.mode === 'computer' && !record.result && game.turn() !== record.config.humanColor;
}

/** Number of plies an undo removes (0 = undo not available). */
export function undoPlies(record: GameRecord, game: ChessGame): number {
  if (isTimed(record.clock)) return 0;
  if (record.result && !UNDOABLE_RESULTS.has(record.result.termination)) return 0;
  const ply = game.ply();
  if (ply === 0) return 0;
  if (record.config.mode === 'local') return 1;
  const human = record.config.humanColor;
  if (game.turn() === human) {
    // Engine has replied: remove the engine reply and the human move.
    return ply >= 2 ? 2 : 0;
  }
  // Human just moved (engine thinking or game ended on the human's move).
  return game.history()[ply - 1]!.color === human ? 1 : 0;
}

function finish(record: GameRecord, result: GameResult, now: number): GameRecord {
  return { ...record, result, drawOffer: null, clock: stopClock(record.clock, now), updatedAt: now };
}

/** Centralised, pure game state transition. Returns the same object when the action is not applicable. */
export function reduceGame(record: GameRecord, action: GameAction): GameRecord {
  switch (action.type) {
    case 'move': {
      if (record.result || isPaused(record.clock)) return record;
      const game = replay(record);
      const flagged = flaggedAt(record.clock, action.now);
      if (flagged) return finishTimeout(record, game, flagged, action.now);
      const mover = game.turn();
      const played = game.moveUci(action.uci);
      if (!played) return record;
      const outcome = game.automaticOutcome();
      const clock = afterMove(record.clock, mover, action.now, outcome !== null);
      return {
        ...record,
        moves: [...record.moves, played.uci],
        clock,
        result: outcome,
        drawOffer: record.drawOffer === mover ? record.drawOffer : null,
        updatedAt: action.now,
      };
    }
    case 'undo': {
      const game = replay(record);
      const count = undoPlies(record, game);
      if (!count) return record;
      return {
        ...record,
        moves: record.moves.slice(0, record.moves.length - count),
        result: null,
        drawOffer: null,
        updatedAt: action.now,
      };
    }
    case 'resign': {
      if (record.result) return record;
      return finish(record, { winner: opposite(action.color), termination: 'resignation' }, action.now);
    }
    case 'offerDraw': {
      if (record.result || record.config.mode !== 'local' || record.drawOffer) return record;
      return { ...record, drawOffer: action.color };
    }
    case 'declineDraw': {
      if (!record.drawOffer) return record;
      return { ...record, drawOffer: null };
    }
    case 'acceptDraw': {
      if (record.result || !record.drawOffer) return record;
      return finish(record, { winner: null, termination: 'agreement' }, action.now);
    }
    case 'claimDraw': {
      if (record.result) return record;
      const game = replay(record);
      const claim = game.claimDraw();
      return claim ? finish(record, claim, action.now) : record;
    }
    case 'flag': {
      if (record.result) return record;
      const flagged = flaggedAt(record.clock, action.now);
      if (!flagged) return record;
      return finishTimeout(record, replay(record), flagged, action.now);
    }
    case 'pause': {
      if (record.result || !record.clock.running) return record;
      return { ...record, clock: pauseClock(record.clock, action.now), updatedAt: action.now };
    }
    case 'resume': {
      if (record.result || !isPaused(record.clock)) return record;
      return { ...record, clock: resumeClock(record.clock, action.now), updatedAt: action.now };
    }
    case 'restart': {
      return {
        ...record,
        moves: [],
        result: replay({ startFen: record.startFen, moves: [] }).automaticOutcome(),
        drawOffer: null,
        clock: createClock(record.config.timeControl),
        updatedAt: action.now,
      };
    }
  }
}

function finishTimeout(record: GameRecord, game: ChessGame, flagged: Color, now: number): GameRecord {
  const clock = stopClock(record.clock, now);
  return {
    ...record,
    clock: { ...clock, remaining: { ...clock.remaining, [flagged]: 0 } },
    result: game.timeoutResult(flagged),
    drawOffer: null,
    updatedAt: now,
  };
}

export function playerNames(config: GameConfig): Record<Color, string> {
  if (config.mode === 'local') return { w: 'White', b: 'Black' };
  const engine = `Computer (${DIFFICULTY_LABELS[config.difficulty]})`;
  return config.humanColor === 'w' ? { w: 'You', b: engine } : { w: engine, b: 'You' };
}
