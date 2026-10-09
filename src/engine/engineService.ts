import type { EngineMove, FromWorker, SearchRequest, ToWorker } from './protocol';

/** The subset of the Worker API the service relies on (lets tests use a fake worker). */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  onerror: ((event: ErrorEvent | Event) => void) | null;
}

export class EngineCancelledError extends Error {
  constructor() {
    super('The engine search was cancelled.');
    this.name = 'EngineCancelledError';
  }
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

interface Pending {
  resolve: (move: EngineMove) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface EngineServiceOptions {
  initTimeoutMs?: number;
  /** Extra time allowed beyond the requested search time before the search is treated as hung. */
  searchGraceMs?: number;
}

/**
 * Owns the engine Web Worker. Guarantees:
 *  - at most one active search; starting a new one cancels the previous one;
 *  - cancel() terminates a busy worker immediately (a synchronous search cannot be interrupted otherwise);
 *  - stale or duplicate worker messages are ignored by request id;
 *  - initialisation failures reject with a helpful EngineError, and the next call retries.
 */
export class EngineService {
  private worker: WorkerLike | null = null;
  private readyPromise: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  /** Incremented by every search() and cancel(); a search that is superseded while initialising aborts. */
  private generation = 0;
  private disposed = false;
  private readonly initTimeoutMs: number;
  private readonly searchGraceMs: number;

  constructor(
    private readonly factory: () => WorkerLike,
    options: EngineServiceOptions = {},
  ) {
    this.initTimeoutMs = options.initTimeoutMs ?? 8000;
    this.searchGraceMs = options.searchGraceMs ?? 10000;
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }

  init(): Promise<void> {
    if (this.disposed) return Promise.reject(new EngineError('The engine has been shut down.'));
    if (this.readyPromise) return this.readyPromise;
    const promise = new Promise<void>((resolve, reject) => {
      let worker: WorkerLike;
      try {
        worker = this.factory();
      } catch (e) {
        reject(new EngineError(`The computer opponent could not be started: ${e instanceof Error ? e.message : String(e)}`));
        return;
      }
      this.worker = worker;
      const timer = setTimeout(() => {
        fail(new EngineError('The computer opponent did not start in time.'));
      }, this.initTimeoutMs);
      const fail = (error: Error) => {
        clearTimeout(timer);
        if (this.worker === worker) this.resetWorker(error);
        reject(error);
      };
      worker.onerror = (event) => {
        const detail = 'message' in event && event.message ? `: ${event.message}` : '';
        fail(new EngineError(`The computer opponent crashed${detail}.`));
      };
      worker.onmessage = (event) => {
        if (event.data.type === 'ready') {
          clearTimeout(timer);
          worker.onmessage = (e) => this.handleMessage(worker, e.data);
          worker.onerror = (e) => {
            const detail = 'message' in e && e.message ? `: ${e.message}` : '';
            this.resetWorker(new EngineError(`The computer opponent crashed${detail}.`));
          };
          resolve();
        }
      };
      worker.postMessage({ type: 'init' });
    });
    this.readyPromise = promise;
    promise.catch(() => {
      if (this.readyPromise === promise) this.readyPromise = null;
    });
    return promise;
  }

  async search(request: SearchRequest): Promise<EngineMove> {
    this.cancel();
    const generation = this.generation;
    await this.init();
    const worker = this.worker;
    if (!worker || generation !== this.generation || this.disposed) throw new EngineCancelledError();
    const id = this.nextId++;
    return new Promise<EngineMove>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resetWorker(new EngineError('The computer opponent stopped responding.'));
      }, request.timeLimitMs + this.searchGraceMs);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type: 'search', id, ...request, moves: [...request.moves] });
    });
  }

  private handleMessage(worker: WorkerLike, msg: FromWorker): void {
    if (worker !== this.worker) return;
    if (msg.type === 'ready') return;
    const entry = this.pending.get(msg.id);
    if (!entry) return; // stale or duplicate response
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.type === 'result') {
      entry.resolve({ move: msg.move, score: msg.score, depth: msg.depth, nodes: msg.nodes, timeMs: msg.timeMs });
    } else {
      entry.reject(new EngineError(msg.message));
    }
  }

  private resetWorker(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.worker = null;
    this.readyPromise = null;
  }

  /** Cancels any running search. A busy worker is terminated and lazily recreated on the next search. */
  cancel(): void {
    this.generation++;
    if (this.pending.size > 0) this.resetWorker(new EngineCancelledError());
  }

  dispose(): void {
    this.disposed = true;
    if (this.worker || this.pending.size) this.resetWorker(new EngineCancelledError());
  }
}

export function createBrowserEngine(): EngineService {
  return new EngineService(
    () => new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module', name: 'kingside-engine' }) as unknown as WorkerLike,
  );
}
