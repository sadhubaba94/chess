"""Generates tests/fixtures/differential-games.json using python-chess as an oracle.

Usage:  pip install chess==1.11.2 && python scripts/generate-differential-fixture.py
The fixture is committed, so running the TypeScript tests does not require Python.
"""
import json
import random
import chess

random.seed(20261009)

STARTS = [
    chess.STARTING_FEN,
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
    "8/8/4k3/8/2b5/8/4K3/2B5 w - - 98 120",
    "7k/8/8/8/8/8/8/N5RK w - - 140 200",
]


def pick(board, moves):
    # Bias towards captures/promotions so games reach endgames and draw rules.
    captures = [m for m in moves if board.is_capture(m) or m.promotion]
    if captures and random.random() < 0.3:
        return random.choice(captures)
    return random.choice(moves)


def snapshot(board):
    legal = sorted(m.uci() for m in board.legal_moves)
    return {
        "fen": board.fen(),
        "legal": legal,
        "check": board.is_check(),
        "checkmate": board.is_checkmate(),
        "stalemate": board.is_stalemate(),
        "insufficient": board.is_insufficient_material(),
        "whiteInsufficient": board.has_insufficient_material(chess.WHITE),
        "blackInsufficient": board.has_insufficient_material(chess.BLACK),
        "threefold": board.is_repetition(3),
        "fivefold": board.is_fivefold_repetition(),
        "fifty": board.halfmove_clock >= 100 and any(board.generate_legal_moves()),
        "seventyfive": board.is_seventyfive_moves(),
    }


games = []
for g in range(60):
    start = STARTS[g % len(STARTS)]
    board = chess.Board(start)
    plies = []
    for _ in range(160):
        moves = list(board.legal_moves)
        if not moves or board.is_fivefold_repetition() or board.is_seventyfive_moves() or (board.is_insufficient_material() and random.random() < 0.3):
            break
        move = pick(board, moves)
        san = board.san(move)
        board.push(move)
        plies.append({"uci": move.uci(), "san": san, **snapshot(board)})
    games.append({"start": start, "initial": snapshot(chess.Board(start)), "plies": plies})

# Explicit repetition game: knights shuffle until fivefold.
board = chess.Board()
plies = []
for uci in ["g1f3", "g8f6", "f3g1", "f6g8"] * 4:
    move = chess.Move.from_uci(uci)
    san = board.san(move)
    board.push(move)
    plies.append({"uci": uci, "san": san, **snapshot(board)})
games.append({"start": chess.STARTING_FEN, "initial": snapshot(chess.Board()), "plies": plies})

with open("tests/fixtures/differential-games.json", "w") as f:
    json.dump({"generator": f"python-chess {chess.__version__}", "games": games}, f, separators=(",", ":"))
print(len(games), "games,", sum(len(g["plies"]) for g in games), "plies")
