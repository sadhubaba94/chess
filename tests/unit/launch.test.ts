import { describe, expect, it } from 'vitest';
import { createGameId, gamePath, launchGameInNewTab } from '../../src/app/launch';
import { parseRoute } from '../../src/app/router';
import { createGameRecord, type GameConfig } from '../../src/core/session';
import { GameRepository, MemoryStorage } from '../../src/persistence/storage';

const config: GameConfig = { mode: 'local', humanColor: 'w', difficulty: 'easy', timeControl: { minutes: null, incrementSeconds: 0 } };

describe('new-tab launch', () => {
  it('persists the game before opening the tab and detaches the opener', () => {
    const repo = new GameRepository(new MemoryStorage());
    const record = createGameRecord(config, { id: createGameId(), now: 1 });
    const fakeWindow = { opener: {} as unknown } as Window;
    let savedBeforeOpen = false;
    const result = launchGameInNewTab(record, {
      repo,
      baseUrl: '/',
      open: (url) => {
        savedBeforeOpen = repo.load(record.id).status === 'ok';
        expect(url).toBe(`/game/${record.id}`);
        return fakeWindow;
      },
    });
    expect(savedBeforeOpen).toBe(true);
    expect(result).toEqual({ opened: true, url: `/game/${record.id}` });
    expect(fakeWindow.opener).toBeNull();
  });

  it('reports a blocked popup so the UI can show a manual link', () => {
    const repo = new GameRepository(new MemoryStorage());
    const record = createGameRecord(config, { id: 'blocked-game', now: 1 });
    expect(launchGameInNewTab(record, { repo, baseUrl: '/', open: () => null })).toEqual({ opened: false, url: '/game/blocked-game' });
    expect(launchGameInNewTab(record, { repo, baseUrl: '/', open: () => { throw new Error('blocked'); } }).opened).toBe(false);
    expect(repo.load('blocked-game').status).toBe('ok');
  });

  it('creates unique ids so games never overwrite each other', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createGameId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9-]{6,64}$/);
  });

  it('builds game paths under a base path', () => {
    expect(gamePath('abc-123', '/')).toBe('/game/abc-123');
    expect(gamePath('abc-123', '/kingside/')).toBe('/kingside/game/abc-123');
    expect(gamePath('abc-123', '/kingside')).toBe('/kingside/game/abc-123');
  });
});

describe('routing', () => {
  it('parses routes with and without a base path', () => {
    expect(parseRoute('/', '/')).toEqual({ name: 'home' });
    expect(parseRoute('/index.html', '/')).toEqual({ name: 'home' });
    expect(parseRoute('/game/abc-123', '/')).toEqual({ name: 'game', id: 'abc-123' });
    expect(parseRoute('/game/abc-123/', '/')).toEqual({ name: 'game', id: 'abc-123' });
    expect(parseRoute('/kingside/game/xyz-789', '/kingside/')).toEqual({ name: 'game', id: 'xyz-789' });
    expect(parseRoute('/kingside/', '/kingside/')).toEqual({ name: 'home' });
    expect(parseRoute('/elsewhere', '/')).toMatchObject({ name: 'notFound' });
  });
});
