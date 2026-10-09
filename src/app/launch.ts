import type { GameRecord } from '../core/session';
import type { GameRepository } from '../persistence/storage';

export function createGameId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function gamePath(id: string, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}game/${encodeURIComponent(id)}`;
}

export interface LaunchResult {
  opened: boolean;
  url: string;
}

/**
 * Persists the game, then opens it in a new tab. Must be called synchronously from a
 * user gesture (click handler) so browsers do not treat it as an unsolicited popup.
 * Persisting first guarantees the new tab can always load the game.
 */
export function launchGameInNewTab(
  record: GameRecord,
  deps: { repo: GameRepository; open: (url: string) => Window | null; baseUrl: string },
): LaunchResult {
  deps.repo.save(record);
  const url = gamePath(record.id, deps.baseUrl);
  let win: Window | null = null;
  try {
    win = deps.open(url);
  } catch {
    win = null;
  }
  if (!win) return { opened: false, url };
  try {
    // Detach the new tab from this one (equivalent of rel="noopener") without losing popup detection.
    win.opener = null;
  } catch {
    // Some browsers make opener read-only; ignore.
  }
  return { opened: true, url };
}
