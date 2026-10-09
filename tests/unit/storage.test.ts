import { describe, expect, it } from 'vitest';
import { createGameRecord, reduceGame, type GameConfig } from '../../src/core/session';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, parseSettings, saveSettings } from '../../src/persistence/settings';
import { GameRepository, MemoryStorage, StorageError, gameKey, validateGameRecord, type StorageLike } from '../../src/persistence/storage';

const config: GameConfig = { mode: 'computer', humanColor: 'b', difficulty: 'medium', timeControl: { minutes: 5, incrementSeconds: 3 } };

function sample(id: string, now = 1_000) {
  let r = createGameRecord(config, { id, now });
  for (const uci of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3']) r = reduceGame(r, { type: 'move', uci, now: (now += 1000) });
  return r;
}

describe('game persistence', () => {
  it('round-trips a game including clock, settings and full move history', () => {
    const repo = new GameRepository(new MemoryStorage());
    const r = sample('game-aaaa');
    repo.save(r);
    const loaded = repo.load('game-aaaa');
    expect(loaded).toEqual({ status: 'ok', record: r });
  });

  it('keeps multiple games independent', () => {
    const repo = new GameRepository(new MemoryStorage());
    const a = sample('game-aaaa', 1_000);
    const b = createGameRecord({ ...config, mode: 'local' }, { id: 'game-bbbb', now: 50_000 });
    repo.save(a);
    repo.save(b);
    repo.save(reduceGame(b, { type: 'move', uci: 'e2e4', now: 60_000 }));
    expect(repo.load('game-aaaa')).toEqual({ status: 'ok', record: a });
    const list = repo.list();
    expect(list.map((e) => (e.ok ? e.summary.id : e.id))).toEqual(['game-bbbb', 'game-aaaa']);
    expect(list[0]!.ok && list[0]!.summary.moveCount).toBe(1);
  });

  it('reports missing and damaged games', () => {
    const storage = new MemoryStorage();
    const repo = new GameRepository(storage);
    expect(repo.load('nope-nope')).toEqual({ status: 'not_found' });
    storage.setItem(gameKey('bad-json'), '{oops');
    expect(repo.load('bad-json')).toMatchObject({ status: 'corrupt', message: expect.stringMatching(/not valid JSON/) });
    const r = sample('bad-move');
    storage.setItem(gameKey('bad-move'), JSON.stringify({ ...r, moves: [...r.moves, 'e2e5'] }));
    expect(repo.load('bad-move')).toMatchObject({ status: 'corrupt', message: expect.stringMatching(/not legal/) });
    storage.setItem(gameKey('future'), JSON.stringify({ ...r, schemaVersion: 2 }));
    expect(repo.load('future')).toMatchObject({ status: 'corrupt', message: expect.stringMatching(/unsupported save format version 2/) });
    const entries = repo.list();
    expect(entries.filter((e) => !e.ok)).toHaveLength(3);
  });

  it('validates every field', () => {
    const r = sample('valid-id');
    const mutate = (patch: Record<string, unknown>) => validateGameRecord({ ...r, ...patch });
    expect(typeof mutate({})).toBe('object');
    expect(mutate({ id: '../../etc' })).toMatch(/id/);
    expect(mutate({ config: { ...config, difficulty: 'godlike' } })).toMatch(/difficulty/);
    expect(mutate({ config: { ...config, timeControl: { minutes: 7, incrementSeconds: 0 } } })).toMatch(/minutes/);
    expect(mutate({ clock: { ...r.clock, remaining: { w: 'x', b: 1 } } })).toMatch(/remaining/);
    expect(mutate({ result: { winner: 'x', termination: 'checkmate' } })).toMatch(/winner/);
    expect(mutate({ result: { winner: null, termination: 'boredom' } })).toMatch(/termination/);
    expect(mutate({ startFen: 'garbage' })).toMatch(/FEN|fields/);
    expect(mutate({ drawOffer: 'z' })).toMatch(/drawOffer/);
    expect(validateGameRecord(null)).toMatch(/not an object/);
  });

  it('deletes single games and clears history without touching settings', () => {
    const storage = new MemoryStorage();
    const repo = new GameRepository(storage);
    repo.save(sample('game-1111'));
    repo.save(sample('game-2222'));
    saveSettings(storage, { ...DEFAULT_SETTINGS, sound: false });
    repo.delete('game-1111');
    expect(repo.ids()).toEqual(['game-2222']);
    repo.clearAll();
    expect(repo.ids()).toEqual([]);
    expect(loadSettings(storage).sound).toBe(false);
  });

  it('surfaces quota errors as a readable StorageError', () => {
    const full: StorageLike = {
      length: 0,
      key: () => null,
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    expect(() => new GameRepository(full).save(sample('game-full'))).toThrow(StorageError);
    expect(() => new GameRepository(full).save(sample('game-full'))).toThrow(/storage is full/);
  });
});

describe('settings', () => {
  it('falls back to defaults for missing or invalid data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(JSON.stringify({ theme: 'neon', boardTheme: 'walnut', sound: 'yes', lastSetup: { mode: 'x' }, lastColorChoice: 'random' }));
    expect(s.theme).toBe('system');
    expect(s.boardTheme).toBe('walnut');
    expect(s.sound).toBe(true);
    expect(s.lastSetup).toEqual(DEFAULT_SETTINGS.lastSetup);
    expect(s.lastColorChoice).toBe('random');
  });

  it('persists settings', () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, theme: 'dark', lastSetup: config });
    expect(storage.getItem(SETTINGS_KEY)).toContain('"dark"');
    expect(loadSettings(storage).lastSetup).toEqual(config);
  });
});
