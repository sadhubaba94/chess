# Third-party notices

## Runtime (bundled into `dist/`)

| Package | Licence | Notes |
| --- | --- | --- |
| react | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| react-dom | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| scheduler (dependency of react-dom) | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |

The MIT licence text for these packages ships in `node_modules/<package>/LICENSE` after `npm install`. Vite also preserves licence comments in the production bundle.

## Development only (not distributed)

Vite (MIT), Vitest (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0), @types/* (MIT).

The differential-test fixture `tests/fixtures/differential-games.json` contains data generated with **python-chess** (GPL-3.0) by `scripts/generate-differential-fixture.py`. It consists of FEN strings, legal-move lists and status flags (factual game data) and contains no python-chess code. python-chess is not a dependency of the app.

## Original assets (MIT, part of this project)

- Chess rules engine (`src/core/rules`) and computer engine (`src/engine`).
- SVG chess pieces (`src/ui/components/PieceIcon.tsx`) and favicon.
- Sounds, synthesised at runtime with the Web Audio API.

## Not included

No third-party chess engine (for example Stockfish), piece set (for example cburnett), font or audio file is bundled. Adding Stockfish would bring GPL-3.0 obligations.
