import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineCancelledError, EngineError, EngineService, type WorkerLike } from '../../src/engine/engineService';
import { LEVELS } from '../../src/engine/levels';
import type { FromWorker, ToWorker } from '../../src/engine/protocol';
import { searchBestMove } from '../../src/engine/search';
import { DIFFICULTIES } from '../../src/core/session';
import { ChessGame } from '../../src/core/rules/game';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: ErrorEvent | Event) => void) | null = null;
  posted: ToWorker[] = [];
  terminated = false;
  constructor(private readonly autoReady = true) {}
  postMessage(message: ToWorker): void {
    this.posted.push(message);
    if (message.type === 'init' && this.autoReady) queueMicrotask(() => this.emit({ type: 'ready' }));
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: FromWorker): void {
    this.onmessage?.({ data } as MessageEvent<FromWorker>);
  }
  lastSearchId(): number {
    const s = [...this.posted].reverse().find((m) => m.type === 'search');
    if (!s || s.type !== 'search') throw new Error('no search posted');
    return s.id;
  }
  respond(move = 'e2e4', id = this.lastSearchId()): void {
    this.emit({ type: 'result', id, move, score: 0, depth: 1, nodes: 1, timeMs: 1 });
  }
}

/** Runs the real engine "in a worker" (asynchronously, in-process) to test the full protocol. */
class InProcessWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: ErrorEvent | Event) => void) | null = null;
  terminated = false;
  postMessage(msg: ToWorker): void {
    setTimeout(() => {
      if (this.terminated) return;
      if (msg.type === 'init') return this.onmessage?.({ data: { type: 'ready' } } as MessageEvent<FromWorker>);
      const r = searchBestMove(msg.startFen, msg.moves, LEVELS[msg.difficulty], { timeLimitMs: msg.timeLimitMs });
      this.onmessage?.({ data: { type: 'result', id: msg.id, move: r.bestMove, score: r.score, depth: r.depth, nodes: r.nodes, timeMs: r.timeMs } } as MessageEvent<FromWorker>);
    }, 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const req = { startFen: START, moves: [] as string[], difficulty: 'easy' as const, timeLimitMs: 100 };

afterEach(() => {
  vi.useRealTimers();
});

describe('EngineService', () => {
  it('initialises once and resolves a search', async () => {
    const workers: FakeWorker[] = [];
    const svc = new EngineService(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const p = svc.search(req);
    await flush();
    workers[0]!.respond('d2d4');
    await expect(p).resolves.toMatchObject({ move: 'd2d4' });
    const p2 = svc.search(req);
    await flush();
    workers[0]!.respond('g1f3');
    await expect(p2).resolves.toMatchObject({ move: 'g1f3' });
    expect(workers).toHaveLength(1);
  });

  it('cancel() rejects the pending search, terminates the busy worker and recovers', async () => {
    const workers: FakeWorker[] = [];
    const svc = new EngineService(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const p = svc.search(req);
    await flush();
    svc.cancel();
    await expect(p).rejects.toBeInstanceOf(EngineCancelledError);
    expect(workers[0]!.terminated).toBe(true);
    workers[0]!.respond('e2e4'); // stale message from the terminated worker: ignored
    const p2 = svc.search(req);
    await flush();
    expect(workers).toHaveLength(2);
    workers[1]!.respond('c2c4');
    await expect(p2).resolves.toMatchObject({ move: 'c2c4' });
  });

  it('cancel() on an idle engine keeps the worker alive', async () => {
    const workers: FakeWorker[] = [];
    const svc = new EngineService(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const p = svc.search(req);
    await flush();
    workers[0]!.respond();
    await p;
    svc.cancel();
    expect(workers[0]!.terminated).toBe(false);
  });

  it('a new search supersedes the previous one (restart race)', async () => {
    const workers: FakeWorker[] = [];
    const svc = new EngineService(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const first = svc.search(req);
    const second = svc.search({ ...req, moves: ['e2e4'] });
    await expect(first).rejects.toBeInstanceOf(EngineCancelledError);
    await flush();
    const searches = workers.flatMap((w) => w.posted.filter((m) => m.type === 'search'));
    expect(searches).toHaveLength(1);
    workers[workers.length - 1]!.respond('e7e5');
    await expect(second).resolves.toMatchObject({ move: 'e7e5' });
  });

  it('ignores duplicate and unknown responses', async () => {
    const w = new FakeWorker();
    const svc = new EngineService(() => w);
    const p = svc.search(req);
    await flush();
    const id = w.lastSearchId();
    w.respond('e2e4', 999);
    w.respond('d2d4', id);
    w.respond('c2c4', id);
    await expect(p).resolves.toMatchObject({ move: 'd2d4' });
  });

  it('reports initialisation failures and retries on the next call', async () => {
    let attempt = 0;
    const svc = new EngineService(() => {
      attempt++;
      if (attempt === 1) throw new Error('Workers are disabled');
      return new FakeWorker();
    });
    await expect(svc.init()).rejects.toThrow(/could not be started: Workers are disabled/);
    await expect(svc.init()).resolves.toBeUndefined();
  });

  it('times out when the worker never becomes ready', async () => {
    const w = new FakeWorker(false);
    const svc = new EngineService(() => w, { initTimeoutMs: 20 });
    await expect(svc.init()).rejects.toThrow(/did not start in time/);
    expect(w.terminated).toBe(true);
  });

  it('rejects the search if the worker crashes, then recovers', async () => {
    const workers: FakeWorker[] = [];
    const svc = new EngineService(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const p = svc.search(req);
    await flush();
    workers[0]!.onerror?.({ message: 'boom' } as ErrorEvent);
    await expect(p).rejects.toThrow(EngineError);
    await expect(p).rejects.toThrow(/crashed: boom/);
    const p2 = svc.search(req);
    await flush();
    workers[1]!.respond('e2e4');
    await expect(p2).resolves.toMatchObject({ move: 'e2e4' });
  });

  it('rejects a hung search after the watchdog delay', async () => {
    const w = new FakeWorker();
    const svc = new EngineService(() => w, { searchGraceMs: 30 });
    const p = svc.search({ ...req, timeLimitMs: 10 });
    await expect(p).rejects.toThrow(/stopped responding/);
  });

  it('propagates worker-side errors', async () => {
    const w = new FakeWorker();
    const svc = new EngineService(() => w);
    const p = svc.search(req);
    await flush();
    w.emit({ type: 'error', id: w.lastSearchId(), message: 'Illegal move in engine request: e2e5' });
    await expect(p).rejects.toThrow(/Illegal move/);
  });

  it('dispose() cancels and prevents further use', async () => {
    const w = new FakeWorker();
    const svc = new EngineService(() => w);
    const p = svc.search(req);
    await flush();
    svc.dispose();
    await expect(p).rejects.toBeInstanceOf(EngineCancelledError);
    await expect(svc.search(req)).rejects.toThrow(/shut down/);
  });

  it('plays legal moves end-to-end with the real engine at all four levels', async () => {
    const svc = new EngineService(() => new InProcessWorker());
    for (const difficulty of DIFFICULTIES) {
      const r = await svc.search({ startFen: START, moves: ['e2e4'], difficulty, timeLimitMs: 300 });
      const legal = ChessGame.fromUciMoves(START, ['e2e4']).legalMoves().map((m) => m.uci);
      expect(legal, difficulty).toContain(r.move);
    }
    svc.dispose();
  });
});
