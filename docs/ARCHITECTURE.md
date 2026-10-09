# Architecture

## Layers

```
┌──────────────────────────── UI (React) ─────────────────────────────┐
│ pages/HomePage   pages/GamePage   components/*   hooks/*            │
└──────┬─────────────────────┬───────────────────────┬────────────────┘
       │ actions             │ legal moves, SAN       │ search requests
┌──────▼──────────┐  ┌───────▼───────────┐  ┌────────▼──────────────────┐
│ core/session.ts │  │ core/rules/*      │  │ engine/engineService.ts   │
│ reduceGame()    │──│ ChessGame         │  │  └─ Web Worker            │
│ GameRecord      │  │ Position (0x88)   │  │      engine.worker.ts     │
│ core/clock.ts   │  └───────────────────┘  │      search.ts, levels.ts │
└──────┬──────────┘                         └───────────────────────────┘
       │ save / load / validate
┌──────▼───────────────────────────┐   ┌──────────────────────────┐
│ persistence/storage.ts, settings │   │ core/pgn.ts (import/export)│
└──────────────────────────────────┘   └──────────────────────────┘
```

| Concern | Module | Notes |
| --- | --- | --- |
| UI components | `src/ui/components`, `src/ui/pages` | Presentational. The board receives the legal moves and emits move intents. |
| Rules adapter | `src/core/rules/game.ts` | `ChessGame`: the only API the app uses for legality, SAN, outcomes and claims. |
| Rules implementation | `src/core/rules/position.ts` | 0x88 board, make/unmake, attack detection, FEN, Zobrist hashing. |
| Game state | `src/core/session.ts` | `GameRecord` (serialisable) and `reduceGame` (pure). |
| Clock logic | `src/core/clock.ts` | Pure functions on timestamps. |
| Engine worker / service | `src/engine/*` | Worker protocol with request IDs, cancellation by termination, watchdog. |
| Persistence | `src/persistence/storage.ts` | Versioned schema, deep validation (replays every move), quota errors. |
| Import/export | `src/core/pgn.ts`, FEN in `position.ts` | Readable errors (`PgnError`, `FenError`). |
| Settings | `src/persistence/settings.ts`, `ui/hooks/settings.tsx` | Per-field fallback, cross-tab sync. |

## State flow on the game page

1. `useGameSession(id)` loads and validates the record. It pauses a clock left running by a crash, then keeps `recordRef` (the latest record) and React state in sync.
2. Every user or engine action calls `dispatch(action)`, which runs `reduceGame` and then saves. If the reducer returns the same object, nothing changed (illegal move, game over, paused, and so on).
3. `ChessGame` is derived from the record (`replay`) with `useMemo`; it is never mutated by the UI.
4. Review mode is local component state (`viewPly`). It reads `fenAt(ply)` and never dispatches, so the live game and clocks are untouched.

## Engine concurrency guarantees

- `EngineService.search()` first cancels any active search, then increments a generation counter. A search superseded while the worker initialises rejects with `EngineCancelledError`.
- A synchronous search cannot be interrupted by messages, so `cancel()` **terminates** a busy worker; the next search lazily creates a new one.
- Responses carry request IDs. Unknown, stale or duplicate IDs are ignored, and messages from a terminated worker are detached.
- `useEngineOpponent` starts at most one search per `(game id, ply, restart)` key. When the result arrives it checks that the live record still has the same ply and no result, and that the move is legal in the current position, before dispatching.
- Initialisation failures and crashes surface as `EngineError` with a Retry button. The next call recreates the worker.

## New-tab launch

`launchGameInNewTab` runs synchronously inside the click handler. It (1) saves the record, (2) calls `window.open(url, '_blank')` and (3) sets `opener = null` on the returned window, which detaches the tab while still letting the app detect a blocked popup. A `null` return shows a fallback with a normal link and an "open in this tab" button. Game IDs come from `crypto.randomUUID()` and each game has its own storage key, so games never overwrite each other.

## Persistence schema (v1)

```ts
interface GameRecord {
  schemaVersion: 1; id: string; createdAt: number; updatedAt: number;
  config: { mode: 'computer' | 'local'; humanColor: 'w' | 'b'; difficulty: 'easy' | 'medium' | 'hard' | 'expert';
            timeControl: { minutes: null | 1 | 3 | 5 | 10 | 15; incrementSeconds: 0 | 1 | 2 | 3 | 5 | 10 } };
  startFen: string; moves: string[];            // UCI, replayed and validated on load
  clock: { initialMs; incrementMs; remaining: { w; b }; running; startedAt; pausedFor };
  result: null | { winner: 'w' | 'b' | null; termination: Termination };
  drawOffer: 'w' | 'b' | null; source: 'new' | 'pgn' | 'fen';
}
```

Unknown versions are reported as "unsupported save format version N" rather than guessed at. A future v2 should add a migration in `validateGameRecord`.
