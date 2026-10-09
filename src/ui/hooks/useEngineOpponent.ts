import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { isPaused, remainingAt } from '../../core/clock';
import { isEngineTurn, replay, type GameAction, type GameRecord } from '../../core/session';
import { EngineCancelledError, createBrowserEngine, type EngineService } from '../../engine/engineService';
import { LEVELS, budgetForMove } from '../../engine/levels';

/**
 * Drives the computer opponent. One search per (game, ply); stale results are discarded,
 * engine moves are re-validated against the current live position before being applied,
 * and any running search is cancelled on undo/restart/unmount.
 */
export function useEngineOpponent(
  record: GameRecord | null,
  recordRef: MutableRefObject<GameRecord | null>,
  dispatch: (action: GameAction) => boolean,
) {
  const engineRef = useRef<EngineService | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const engineTurn = record ? isEngineTurn(record, replay(record)) : false;
  const paused = record ? isPaused(record.clock) : false;
  const ply = record?.moves.length ?? 0;
  const gameId = record?.id;
  const restartStamp = record && ply === 0 ? record.updatedAt : 0;

  useEffect(() => {
    const current = recordRef.current;
    if (!current || !engineTurn || paused || current.result) return;
    if (!engineRef.current) engineRef.current = createBrowserEngine();
    const engine = engineRef.current;
    const level = LEVELS[current.config.difficulty];
    const engineColor = current.config.humanColor === 'w' ? 'b' : 'w';
    const remaining = current.clock.initialMs === null ? null : remainingAt(current.clock, engineColor, Date.now());
    const timeLimitMs = budgetForMove(level, remaining, current.clock.incrementMs);
    const requestPly = current.moves.length;
    let cancelled = false;
    setThinking(true);
    setError(null);
    engine
      .search({ startFen: current.startFen, moves: current.moves, difficulty: current.config.difficulty, timeLimitMs })
      .then((result) => {
        if (cancelled) return;
        const live = recordRef.current;
        if (!live || live.result || live.moves.length !== requestPly || live.id !== current.id) return;
        const legal = replay(live).legalMoves().some((m) => m.uci === result.move);
        if (!legal) {
          setError(`The computer suggested an illegal move (${result.move}); it was rejected.`);
          return;
        }
        dispatch({ type: 'move', uci: result.move, now: Date.now() });
      })
      .catch((e: unknown) => {
        if (cancelled || e instanceof EngineCancelledError) return;
        setError(e instanceof Error ? e.message : 'The computer opponent failed.');
      })
      .finally(() => {
        if (!cancelled) setThinking(false);
      });
    return () => {
      cancelled = true;
      engine.cancel();
      setThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineTurn, paused, ply, gameId, restartStamp, attempt]);

  return {
    thinking,
    error,
    retry: () => {
      setError(null);
      setAttempt((a) => a + 1);
    },
  };
}
