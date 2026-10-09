import { LEVELS } from './levels';
import type { FromWorker, ToWorker } from './protocol';
import { searchBestMove } from './search';

// Typed view of the dedicated worker scope (avoids mixing the DOM and WebWorker type libraries).
const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
};
const post = (msg: FromWorker) => scope.postMessage(msg);

scope.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    post({ type: 'ready' });
    return;
  }
  if (msg.type === 'search') {
    const started = Date.now();
    try {
      const level = LEVELS[msg.difficulty];
      const result = searchBestMove(msg.startFen, msg.moves, level, { timeLimitMs: msg.timeLimitMs });
      const minThink = Math.min(level.minThinkMs, msg.timeLimitMs);
      const wait = Math.max(0, minThink - (Date.now() - started));
      setTimeout(() => {
        post({ type: 'result', id: msg.id, move: result.bestMove, score: result.score, depth: result.depth, nodes: result.nodes, timeMs: Date.now() - started });
      }, wait);
    } catch (e) {
      post({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : 'Unknown engine error' });
    }
  }
};
