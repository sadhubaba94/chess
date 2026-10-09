import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { msUntilFlag, pauseClock } from '../../core/clock';
import { ChessGame } from '../../core/rules/game';
import { reduceGame, replay, type GameAction, type GameRecord } from '../../core/session';
import { GameRepository, StorageError, gameKey, getBrowserStorage } from '../../persistence/storage';

export type SessionState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'corrupt'; message: string }
  | { status: 'ready'; record: GameRecord };

/**
 * Loads one game by id and owns its live state. All transitions go through reduceGame;
 * every accepted transition is saved immediately. Also handles:
 *  - precise flag-fall detection (timer scheduled for the exact remaining time + visibility checks);
 *  - pausing the clock when the page is hidden/unloaded (pagehide), resumed explicitly by the player;
 *  - cross-tab synchronisation of the same game through storage events.
 */
export function useGameSession(id: string) {
  const repo = useMemo(() => new GameRepository(getBrowserStorage()), []);
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const recordRef = useRef<GameRecord | null>(null);

  const commit = useCallback(
    (next: GameRecord) => {
      recordRef.current = next;
      setState({ status: 'ready', record: next });
      try {
        repo.save(next);
        setSaveError(null);
      } catch (e) {
        setSaveError(e instanceof StorageError ? e.message : 'The game could not be saved.');
      }
    },
    [repo],
  );

  // Initial load. A clock left running (e.g. the browser crashed before pagehide) is paused
  // at the last saved instant, so time while the page was closed is never charged.
  useEffect(() => {
    const loaded = repo.load(id);
    if (loaded.status === 'not_found') setState({ status: 'not_found' });
    else if (loaded.status === 'corrupt') setState({ status: 'corrupt', message: loaded.message });
    else {
      let record = loaded.record;
      if (!record.result && record.clock.running) {
        const at = Math.max(record.clock.startedAt ?? 0, record.updatedAt);
        record = { ...record, clock: pauseClock(record.clock, at) };
      }
      recordRef.current = record;
      setState({ status: 'ready', record });
      if (record !== loaded.record) {
        try {
          repo.save(record);
        } catch {
          // reported on next save
        }
      }
    }
  }, [id, repo]);

  const dispatch = useCallback(
    (action: GameAction): boolean => {
      const prev = recordRef.current;
      if (!prev) return false;
      const next = reduceGame(prev, action);
      if (next === prev) return false;
      commit(next);
      return true;
    },
    [commit],
  );

  const replaceRecord = useCallback((record: GameRecord) => commit(record), [commit]);

  const record = state.status === 'ready' ? state.record : null;

  // Flag fall: schedule a check at the exact moment the running clock reaches zero.
  useEffect(() => {
    if (!record || record.result || !record.clock.running) return;
    const ms = msUntilFlag(record.clock, Date.now());
    if (ms === null) return;
    const timer = window.setTimeout(() => dispatch({ type: 'flag', now: Date.now() }), ms + 5);
    const onVisible = () => {
      if (document.visibilityState === 'visible') dispatch({ type: 'flag', now: Date.now() });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [record, dispatch]);

  // Pause on page hide (tab closed, navigated away, refreshed or moved to bfcache).
  useEffect(() => {
    const onHide = () => {
      const current = recordRef.current;
      if (current && !current.result && current.clock.running) dispatch({ type: 'pause', now: Date.now() });
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [dispatch]);

  // Cross-tab sync for the same game.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== gameKey(id)) return;
      if (e.newValue === null) {
        recordRef.current = null;
        setState({ status: 'not_found' });
        return;
      }
      const loaded = repo.load(id);
      if (loaded.status !== 'ok') return;
      const current = recordRef.current;
      if (!current || loaded.record.updatedAt >= current.updatedAt) {
        recordRef.current = loaded.record;
        setState({ status: 'ready', record: loaded.record });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [id, repo]);

  const game: ChessGame | null = useMemo(() => (record ? replay(record) : null), [record]);

  const deleteGame = useCallback(() => repo.delete(id), [id, repo]);

  return { state, record, game, dispatch, replaceRecord, saveError, recordRef, repo, deleteGame };
}
