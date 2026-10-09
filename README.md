# Kingside

A local-first chess web app built with React, TypeScript and Vite. You can play against the computer at four difficulty levels or against a friend on the same device. Every game opens in its own browser tab, saves after every move, and can be resumed, reviewed and exported as PGN or FEN. There is no login, no backend and no paid service.

## Features

- **Two modes:** computer opponent (Easy, Medium, Hard or Expert, playing either colour) or two players on one device. Online play is not included.
- **Setup:** colour (White, Black or Random), time control (untimed, 1, 3, 5, 10 or 15 min), increment (0 to 10 s), board theme and sound.
- **New-tab games:** each game gets a unique ID and its own `/game/<id>` route. If the browser blocks the new tab, a manual link appears.
- **Board:** click-to-move, drag-and-drop (mouse, touch, pen) and full keyboard control. It shows legal-move indicators, highlights the selected square, the last move and check, and supports board flip, an accessible promotion picker, move animations and captured pieces with material balance.
- **Full rules:** castling restrictions, en passant timing and pins, promotion and underpromotion, checkmate and stalemate. Draws cover insufficient material, threefold and 50-move claims, and automatic fivefold and 75-move rules (checkmate takes precedence). Timeout is a draw when the opponent cannot possibly mate.
- **Controls:** new game, restart, resign (with confirmation), offer, accept or decline a draw (two-player mode), claim draw, undo (paired against the computer), flip, sound toggle, move history in SAN, position review that never touches the live game, and a result dialog with rematch.
- **Clocks:** based on wall-clock timestamps, so they stay exact in background tabs. Only the active clock runs, and the increment is added per move.
- **Persistence:** versioned and validated localStorage records that keep the full move list, so repetition history survives. There is a saved-games list with delete and clear actions.
- **Import/export:** PGN import with readable error messages, PGN export (download or copy) and FEN import/export.
- **Design:** light and dark themes, four board themes, responsive desktop and mobile layouts, `prefers-reduced-motion` support, and sounds synthesised with Web Audio (no audio files).

## Quick start

Requirements: **Node.js 20.19+ or 22.12+** (needed by Vite 8) and npm.

```bash
npm install          # also creates package-lock.json; commit it
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc --noEmit` over `src`, `tests` and the configs |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve `dist/` at http://localhost:4173 |
| `npx playwright install chromium` | One-time browser download for E2E tests |
| `npm run test:e2e` | Playwright browser tests (builds and serves automatically) |
| `npm run test:all` | Typecheck, unit tests, build and E2E tests |
| `npm run fixtures:differential` | Regenerate the python-chess differential fixture (optional, needs `pip install chess==1.11.2`) |

No environment variables are required. `.env.example` documents the optional `BASE_PATH` for sub-directory hosting.

## Project structure

```
kingside/
├── index.html                    # app shell; applies the saved theme before first paint
├── package.json                  # dependencies and scripts
├── tsconfig.json                 # strict TypeScript (noUncheckedIndexedAccess, noImplicitOverride, …)
├── vite.config.ts                # Vite build + Vitest config, module worker format, BASE_PATH support
├── playwright.config.ts          # desktop + mobile (Pixel 7) Chromium projects
├── netlify.toml / vercel.json    # static hosting with SPA fallback
├── public/
│   ├── favicon.svg
│   └── _redirects                # Netlify SPA fallback
├── scripts/
│   └── generate-differential-fixture.py
├── src/
│   ├── main.tsx, App.tsx         # entry, error boundary, routing
│   ├── app/
│   │   ├── router.ts             # history-API routes: / and /game/:id
│   │   └── launch.ts             # persist-then-open new-tab launch with popup fallback
│   ├── core/                     # framework-free domain logic
│   │   ├── types.ts              # Color, Square, GameResult, result descriptions
│   │   ├── rules/position.ts     # 0x88 board, move generation, FEN parse/validate, Zobrist hashing
│   │   ├── rules/game.ts         # ChessGame: SAN, history, repetition, outcomes, draw claims
│   │   ├── clock.ts              # timestamp-based clock (pure functions)
│   │   ├── session.ts            # GameRecord + reduceGame: the single state-transition function
│   │   └── pgn.ts                # PGN export/import
│   ├── engine/
│   │   ├── search.ts             # alpha-beta engine + evaluation
│   │   ├── levels.ts             # the four difficulty configurations + time budgeting
│   │   ├── protocol.ts           # worker message types
│   │   ├── engine.worker.ts      # Web Worker entry
│   │   └── engineService.ts      # worker lifecycle, cancellation, stale-result protection
│   ├── persistence/
│   │   ├── storage.ts            # GameRepository, schema validation, MemoryStorage fallback
│   │   └── settings.ts           # versioned settings with per-field fallback
│   ├── audio/sounds.ts           # Web Audio synthesised sounds
│   ├── ui/
│   │   ├── components/           # Board, PieceIcon, PromotionDialog, MoveList, PlayerBar, Modal, …
│   │   ├── hooks/                # settings context, useGameSession, useEngineOpponent, useNow
│   │   └── pages/                # HomePage, GamePage
│   └── styles/app.css
├── tests/
│   ├── fixtures/differential-games.json   # python-chess oracle data (61 games, 5,656 plies)
│   ├── unit/*.test.ts                     # Vitest
│   └── e2e/app.spec.ts                    # Playwright
└── docs/
    ├── ARCHITECTURE.md
    └── RULES_AND_ENGINE.md
```

## Architecture in brief

The domain core (`src/core`) is pure TypeScript with no React or DOM dependencies. All game changes go through one pure reducer, `reduceGame(record, action)`. UI components never decide what is legal: they ask `ChessGame` for legal moves and send actions. The engine runs in a Web Worker behind `EngineService`, which guarantees one active search at a time, immediate cancellation (it terminates a busy worker), and that stale or duplicate responses are ignored. Engine moves are checked against the live position before they are applied. Persistence stores a versioned `GameRecord` containing the start FEN and the full UCI move list, and every load replays and validates all moves. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Rules engine: why it is custom, and how it is verified

The brief asked for a maintained library (for example `chess.js`). This project was built in an environment that could not reach the npm registry, so no external chess library could be installed or checked. The rules are therefore implemented in `src/core/rules`, isolated from the UI behind the `ChessGame` API, and verified in two ways:

1. **Perft:** node counts for the six standard Chess Programming Wiki test positions, up to 674,624 nodes, match exactly. These positions cover castling, en passant (including discovered-check and pin cases), promotions and checks.
2. **Differential testing against python-chess 1.11.2:** 61 games and 5,656 plies (fixture committed). At every ply the test compares the FEN, the full legal-move list, the SAN, check, mate, stalemate, insufficient material (overall and per side), threefold and fivefold repetition, and the 50- and 75-move rules.

Swapping in `chess.js` later would only mean replacing `ChessGame`'s internals; the rest of the app depends only on its interface.

Rule details and known limitations are in [docs/RULES_AND_ENGINE.md](docs/RULES_AND_ENGINE.md). In short: dead positions are detected from **material only** (the python-chess heuristic), so fortress or blocked-pawn dead positions are not recognised. Draw claims apply to the **current** position; claiming via an intended move is not supported.

## Computer opponent

The engine is original code: iterative-deepening negamax alpha-beta with PVS, quiescence search, a transposition table, MVV-LVA/killer/history ordering, null-move pruning, late-move reductions, check extensions and a tapered piece-square evaluation. **No Elo ratings are claimed**, because none have been measured.

| Level | Max depth (plies) | Time per move | Root move choice | Pruning | TT entries |
| --- | --- | --- | --- | --- | --- |
| Easy | 1 (+ quiescence) | 400 ms | Random among moves within 120 cp of best; 20% chance of widening to 450 cp | none | 2¹⁴ |
| Medium | 3 | 1,000 ms | Random within 35 cp; 6% chance of 180 cp | none | 2¹⁷ |
| Hard | 6 | 1,500 ms | Best move | null-move, LMR | 2¹⁹ |
| Expert | up to 64 (time-limited) | 3,500 ms | Best move | null-move, LMR | 2²⁰ |

In timed games the budget is reduced to about 1/30 of the remaining clock plus 80% of the increment. When the search finds a forced mate, Easy and Medium choose only among mating moves. They also exclude moves the search sees as allowing a forced mate, unless every move does. Expert is the strongest configuration of *this* engine; it is much weaker than Stockfish (see Future enhancements).

## Clocks, refresh and resume

- Time is derived from `Date.now()` timestamps. The interval timer only redraws the display, and the flag fall is scheduled for the exact remaining time and re-checked when the tab becomes visible.
- The clock starts after White's first move. The increment is added to the mover after each move made while their clock was running, but never to a flagged player.
- **On refresh or close** (`pagehide`), the running clock is paused and saved. When the game is reopened, a "Clock paused" overlay appears and play continues only after **Resume**. If the browser crashed before `pagehide`, time is charged only up to the last saved moment.
- A move submitted after the flag has fallen loses on time. Reviewing earlier positions never stops or alters the live clock.
- Undo is available only in untimed games.

## Saving, import and export

- Games are saved to `localStorage` (`kingside:v1:game:<id>`) after every transition. The full move list is stored, so repetition and 50-move history are restored exactly.
- The saved-games list shows the date, mode, difficulty, time control, number of plies, your colour and the result. Delete and Clear history both ask for confirmation. Damaged records are listed as unreadable and can be deleted.
- **PGN import** restores full history. Comments, NAGs and variations are skipped, and only the first game of a multi-game file is read. Errors name the exact move, for example "Move 2. Ke3 is not legal".
- **FEN import** validates the piece counts, kings, pawn ranks, castling-rights consistency, en passant plausibility and the side not to move being in check. A FEN describes a single position, so earlier repetitions cannot be known; the app explains this in the import panel.
- **PGN export** includes the Seven Tag Roster, `SetUp`/`FEN` for custom starts, `TimeControl`, `Termination` and a result comment. FEN export follows the python-chess convention of writing the en passant square only when an en passant capture is legal.

## Testing

```bash
npm test                 # 227 unit/integration tests
npx playwright install chromium
npm run test:e2e         # 16 browser tests (15 desktop + 1 mobile)
```

The unit and integration tests cover perft, the python-chess differential, every special rule, repetition and move-count draws, checkmate precedence, timeout and insufficient-material outcomes, clock switching and increments, every reducer transition including paired undo, all four engine levels, mate finding, time limits, `EngineService` cancellation, restart races, duplicate and stale messages, init failure with retry, crashes and the watchdog, persistence validation and quota errors, settings fallback, new-tab launch with popup fallback, unique IDs, and routing.

The E2E tests cover new-tab launch, popup-blocked fallback, checkmate, all four computer levels, playing Black, restart during engine search, autosave and resume, multiple independent games, review/undo/flip, resign and draw with confirmations, threefold claim, PGN import errors, PGN round-trip and download, FEN import with underpromotion, keyboard play, mouse drag-and-drop, active-clock behaviour, and the mobile layout (no horizontal scroll, tap-to-move).

## Deployment

The app is a static SPA. Any host that serves `dist/` with a fallback from unknown paths to `index.html` works.

**Netlify (recommended):** connect the repository. `netlify.toml` sets `npm run build`, publishes `dist`, adds the SPA fallback and caches `/assets/*`. With the CLI: `npx netlify deploy --build --prod`.

**Vercel:** import the repository. `vercel.json` sets the build command, output directory and rewrites.

**GitHub Pages (project site):** build with the repository name as base path and add a 404 fallback:
```bash
BASE_PATH=/<repo-name>/ npm run build
cp dist/index.html dist/404.html
```
Then publish `dist/` (for example with `actions/upload-pages-artifact` and `actions/deploy-pages`).

**Any static server:** `npm run build` and serve `dist/` with an `index.html` fallback, for example `try_files $uri /index.html;` in nginx.

## Licensing

- Kingside source code, the rules engine, the computer engine and the SVG piece set are original work under the **MIT** licence (see `LICENSE`).
- Runtime dependencies are React and React DOM (MIT). See `THIRD_PARTY_NOTICES.md`.
- No third-party chess engine, piece artwork, fonts (system fonts are used) or audio files are bundled, so there are no GPL or Creative Commons distribution obligations.

## Known limitations

- The rules are custom rather than library-based (see above). They are thoroughly tested, but they are not a community-maintained package.
- Dead-position detection is material-based only, and the timeout exception uses the same heuristic.
- Draw claims cover the current position only. The computer never offers, accepts or claims draws, and draw offers exist only in two-player mode.
- Storage is per browser. Private windows, or blocked storage, cannot persist games or open them in new tabs; the app shows a warning in that case.
- If the same game is open in two tabs, they sync through `storage` events and the last write wins.
- In local casual play, reloading pauses the clock. This is trust-based by design.
- The engine is far weaker than Stockfish-class engines.
- There is no Fast Refresh in development, because `@vitejs/plugin-react` is not used. Add it if you want it.

## Future enhancements

- Optional Stockfish (WASM) "Max" level. Stockfish is **GPL-3.0**, so distributing it requires GPL compliance (source, licence text, notices).
- Swap the rules core for `chess.js` if a maintained library is preferred; the `ChessGame` interface is the only integration point.
- Online multiplayer as a separate phase: server-authoritative moves and clocks, private rooms with invite links, reconnection, idempotent message IDs and rate limiting.
- Claiming draws via an intended move, a full dead-position search, premoves, PGN multi-game browsing and engine analysis mode.
