# Rules compliance and engine notes

## Implemented and tested

| Rule | Where | Tests |
| --- | --- | --- |
| Legal movement for every piece, turn order, no self-check | `position.ts` | perft, `rules.special.test.ts`, differential |
| Castling: rights, empty path, king not in or through or into check, rook capture removes right | `position.ts` | perft (Kiwipete, pos 4), special tests |
| En passant: only on the next move; horizontal pin case | `position.ts` | perft pos 3, special tests |
| Promotion and underpromotion (Q/R/B/N), capture-promotion | `position.ts`, `PromotionDialog` | special tests, E2E |
| Check, checkmate, stalemate | `game.ts` | special tests, differential |
| Insufficient material (automatic draw) | `Position.isInsufficientMaterial` | draws tests, differential |
| Threefold repetition (claim), fivefold (automatic) | `game.ts` (keys = placement, side, castling, *legal* en passant) | draws tests, differential |
| 50-move claim, 75-move automatic, checkmate precedence | `game.ts` | draws tests, differential |
| Resignation, agreed draws, claims | `session.ts` | session tests, E2E |
| Timeout; draw if the opponent cannot mate | `session.ts`, `ChessGame.timeoutResult` | session tests, draws tests |

The automatic-outcome order is checkmate, then insufficient material, stalemate, the 75-move rule and fivefold repetition, the same order python-chess uses.

## Documented limitations

1. **Dead position.** FIDE Article 5.2.2 covers *any* position where no sequence of legal moves can lead to mate. This app detects the material-based subset: K v K; K+N v K; bishops all on one square colour with no pawns or knights; and a lone knight cannot win when the opponent has no blocking material. It uses the same heuristic as python-chess `has_insufficient_material`. Fortresses and fully blocked pawn chains are **not** detected, and the timeout exception (Article 6.9) uses the same heuristic.
2. **Draw claims with an intended move.** FIDE allows claiming threefold or 50-move draws by declaring a move that would produce them. Only claims about the *current* position are supported.
3. **Claimant.** Against the computer, only the human can claim, on their own turn. The engine does not claim or offer draws.
4. **FEN import.** A FEN has no history, so repetition counts start at the imported position. The halfmove clock from the FEN is honoured for the 50- and 75-move rules.

## Engine settings

See `src/engine/levels.ts`; these are the exact values the app uses.

| Setting | Easy | Medium | Hard | Expert |
| --- | --- | --- | --- | --- |
| `maxDepth` | 1 | 3 | 6 | 64 |
| `moveTimeMs` | 400 | 1000 | 1500 | 3500 |
| `multiScore` (score all root moves, choose randomly) | yes | yes | no | no |
| `randomMarginCp` | 120 | 35 | 0 | 0 |
| `blunderChance` / `blunderMarginCp` | 0.20 / 450 | 0.06 / 180 | 0 | 0 |
| quiescence | yes | yes | yes | yes |
| null-move pruning | no | no | yes | yes |
| late-move reductions | no | no | yes | yes |
| TT size | 2¹⁴ | 2¹⁷ | 2¹⁹ | 2²⁰ |
| `minThinkMs` | 400 | 400 | 0 | 0 |

The timed-game budget is `min(moveTimeMs, max(30, min(remaining/30 + 0.8·increment, remaining/2)))` ms.

No Elo ratings are given because none have been measured. The levels differ measurably in search depth, time and deliberate randomness (see `engine.search.test.ts`).
