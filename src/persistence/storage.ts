import { INCREMENT_SECONDS, TIME_CONTROL_MINUTES, type ClockState } from '../core/clock';
import { ChessGame } from '../core/rules/game';
import {
  DIFFICULTIES,
  GAME_SCHEMA_VERSION,
  type GameConfig,
  type GameRecord,
} from '../core/session';
import type { Color, GameResult, Termination } from '../core/types';

/** Minimal Web Storage interface so persistence can be tested without a browser. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_PREFIX = 'kingside:v1:';
export const GAME_KEY_PREFIX = `${STORAGE_PREFIX}game:`;

export function gameKey(id: string): string {
  return `${GAME_KEY_PREFIX}${id}`;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

const TERMINATIONS: ReadonlySet<Termination> = new Set<Termination>([
  'checkmate',
  'stalemate',
  'insufficient_material',
  'fivefold_repetition',
  'seventyfive_moves',
  'threefold_repetition',
  'fifty_moves',
  'resignation',
  'agreement',
  'timeout',
  'timeout_insufficient_material',
  'imported',
]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isColor = (v: unknown): v is Color => v === 'w' || v === 'b';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateConfig(v: unknown): GameConfig | string {
  if (!isObj(v)) return 'config is missing';
  if (v.mode !== 'computer' && v.mode !== 'local') return 'config.mode is invalid';
  if (!isColor(v.humanColor)) return 'config.humanColor is invalid';
  if (!DIFFICULTIES.includes(v.difficulty as never)) return 'config.difficulty is invalid';
  const tc = v.timeControl;
  if (!isObj(tc)) return 'config.timeControl is missing';
  if (!(TIME_CONTROL_MINUTES as readonly unknown[]).includes(tc.minutes)) return 'time control minutes are invalid';
  if (!(INCREMENT_SECONDS as readonly unknown[]).includes(tc.incrementSeconds)) return 'time control increment is invalid';
  return {
    mode: v.mode,
    humanColor: v.humanColor,
    difficulty: v.difficulty as GameConfig['difficulty'],
    timeControl: { minutes: tc.minutes as number | null, incrementSeconds: tc.incrementSeconds as number },
  };
}

function validateClock(v: unknown): ClockState | string {
  if (!isObj(v)) return 'clock is missing';
  if (!(v.initialMs === null || isNum(v.initialMs))) return 'clock.initialMs is invalid';
  if (!isNum(v.incrementMs) || v.incrementMs < 0) return 'clock.incrementMs is invalid';
  const r = v.remaining;
  if (!isObj(r) || !isNum(r.w) || !isNum(r.b)) return 'clock.remaining is invalid';
  if (!(v.running === null || isColor(v.running))) return 'clock.running is invalid';
  if (!(v.startedAt === null || isNum(v.startedAt))) return 'clock.startedAt is invalid';
  if (!(v.pausedFor === null || isColor(v.pausedFor))) return 'clock.pausedFor is invalid';
  if (v.running && v.startedAt === null) return 'clock is running without a start time';
  return {
    initialMs: v.initialMs as number | null,
    incrementMs: v.incrementMs,
    remaining: { w: r.w, b: r.b },
    running: v.running as Color | null,
    startedAt: v.startedAt as number | null,
    pausedFor: v.pausedFor as Color | null,
  };
}

function validateResult(v: unknown): GameResult | null | string {
  if (v === null) return null;
  if (!isObj(v)) return 'result is invalid';
  if (!(v.winner === null || isColor(v.winner))) return 'result.winner is invalid';
  if (!TERMINATIONS.has(v.termination as Termination)) return 'result.termination is invalid';
  return { winner: v.winner as Color | null, termination: v.termination as Termination };
}

/** Deep validation of persisted data, including replaying every move. Returns the record or an error message. */
export function validateGameRecord(data: unknown): GameRecord | string {
  if (!isObj(data)) return 'the saved data is not an object';
  if (data.schemaVersion !== GAME_SCHEMA_VERSION) {
    return `unsupported save format version ${String(data.schemaVersion)} (this app reads version ${GAME_SCHEMA_VERSION})`;
  }
  if (typeof data.id !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(data.id)) return 'id is invalid';
  if (!isNum(data.createdAt) || !isNum(data.updatedAt)) return 'timestamps are invalid';
  const config = validateConfig(data.config);
  if (typeof config === 'string') return config;
  if (typeof data.startFen !== 'string') return 'startFen is missing';
  if (!Array.isArray(data.moves) || !data.moves.every((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) {
    return 'moves are invalid';
  }
  const clock = validateClock(data.clock);
  if (typeof clock === 'string') return clock;
  const result = validateResult(data.result);
  if (typeof result === 'string') return result;
  if (!(data.drawOffer === null || isColor(data.drawOffer))) return 'drawOffer is invalid';
  if (data.source !== 'new' && data.source !== 'pgn' && data.source !== 'fen') return 'source is invalid';
  try {
    ChessGame.fromUciMoves(data.startFen, data.moves as string[]);
  } catch (e) {
    return e instanceof Error ? e.message : 'moves could not be replayed';
  }
  return {
    schemaVersion: GAME_SCHEMA_VERSION,
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    config,
    startFen: data.startFen,
    moves: data.moves as string[],
    clock,
    result,
    drawOffer: data.drawOffer as Color | null,
    source: data.source,
  };
}

export type LoadResult =
  | { status: 'ok'; record: GameRecord }
  | { status: 'not_found' }
  | { status: 'corrupt'; message: string };

export interface GameSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  config: GameConfig;
  moveCount: number;
  result: GameResult | null;
}

export type SummaryEntry = { ok: true; summary: GameSummary } | { ok: false; id: string; message: string };

export class GameRepository {
  constructor(private readonly storage: StorageLike) {}

  save(record: GameRecord): void {
    try {
      this.storage.setItem(gameKey(record.id), JSON.stringify(record));
    } catch (e) {
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
      throw new StorageError(
        quota
          ? 'Browser storage is full. Delete some saved games and try again.'
          : 'The game could not be saved. Browser storage may be disabled (for example in private browsing).',
      );
    }
  }

  load(id: string): LoadResult {
    let raw: string | null;
    try {
      raw = this.storage.getItem(gameKey(id));
    } catch {
      return { status: 'corrupt', message: 'Browser storage is not accessible.' };
    }
    if (raw === null) return { status: 'not_found' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'corrupt', message: 'The saved game is not valid JSON.' };
    }
    const record = validateGameRecord(parsed);
    if (typeof record === 'string') return { status: 'corrupt', message: `The saved game is damaged: ${record}.` };
    return { status: 'ok', record };
  }

  ids(): string[] {
    const ids: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(GAME_KEY_PREFIX)) ids.push(key.slice(GAME_KEY_PREFIX.length));
    }
    return ids;
  }

  /** Saved games, newest first. Damaged entries are reported rather than hidden. */
  list(): SummaryEntry[] {
    const entries: SummaryEntry[] = this.ids().map((id) => {
      const loaded = this.load(id);
      if (loaded.status !== 'ok') {
        return { ok: false, id, message: loaded.status === 'corrupt' ? loaded.message : 'Missing.' };
      }
      const r = loaded.record;
      return {
        ok: true,
        summary: { id, createdAt: r.createdAt, updatedAt: r.updatedAt, config: r.config, moveCount: r.moves.length, result: r.result },
      };
    });
    return entries.sort((a, b) => (b.ok ? b.summary.updatedAt : 0) - (a.ok ? a.summary.updatedAt : 0));
  }

  delete(id: string): void {
    this.storage.removeItem(gameKey(id));
  }

  clearAll(): void {
    for (const id of this.ids()) this.storage.removeItem(gameKey(id));
  }
}

/** In-memory storage used when localStorage is unavailable, and in tests. */
export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let browserStorage: StorageLike | null = null;
export function getBrowserStorage(): StorageLike {
  if (browserStorage) return browserStorage;
  try {
    const ls = window.localStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    browserStorage = ls;
  } catch {
    browserStorage = new MemoryStorage();
  }
  return browserStorage;
}

export function isPersistentStorage(): boolean {
  return !(getBrowserStorage() instanceof MemoryStorage);
}
