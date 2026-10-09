import type { GameConfig } from '../core/session';
import { STORAGE_PREFIX, validateConfig, type StorageLike } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type BoardTheme = 'classic' | 'walnut' | 'slate' | 'contrast';

export const BOARD_THEMES: { id: BoardTheme; label: string }[] = [
  { id: 'classic', label: 'Classic green' },
  { id: 'walnut', label: 'Walnut' },
  { id: 'slate', label: 'Slate blue' },
  { id: 'contrast', label: 'High contrast' },
];

export const SETTINGS_SCHEMA_VERSION = 1 as const;
export const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;

export interface Settings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  theme: ThemePreference;
  boardTheme: BoardTheme;
  sound: boolean;
  showLegalMoves: boolean;
  showCoordinates: boolean;
  animations: boolean;
  /** The last game setup, used as the default for the next game. */
  lastSetup: GameConfig;
  /** Colour preference in the setup form (Random is resolved when a game starts). */
  lastColorChoice: ColorChoice;
}

export type ColorChoice = 'w' | 'b' | 'random';

export const DEFAULT_SETUP: GameConfig = {
  mode: 'computer',
  humanColor: 'w',
  difficulty: 'easy',
  timeControl: { minutes: null, incrementSeconds: 0 },
};

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  theme: 'system',
  boardTheme: 'classic',
  sound: true,
  showLegalMoves: true,
  showCoordinates: true,
  animations: true,
  lastSetup: DEFAULT_SETUP,
  lastColorChoice: 'w',
};

/** Field-by-field validation; invalid fields fall back to defaults instead of discarding everything. */
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_SETTINGS;
  const d = data as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const setup = validateConfig(d.lastSetup);
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    theme: d.theme === 'light' || d.theme === 'dark' || d.theme === 'system' ? d.theme : DEFAULT_SETTINGS.theme,
    boardTheme: BOARD_THEMES.some((t) => t.id === d.boardTheme) ? (d.boardTheme as BoardTheme) : DEFAULT_SETTINGS.boardTheme,
    sound: bool(d.sound, DEFAULT_SETTINGS.sound),
    showLegalMoves: bool(d.showLegalMoves, DEFAULT_SETTINGS.showLegalMoves),
    showCoordinates: bool(d.showCoordinates, DEFAULT_SETTINGS.showCoordinates),
    animations: bool(d.animations, DEFAULT_SETTINGS.animations),
    lastSetup: typeof setup === 'string' ? DEFAULT_SETUP : setup,
    lastColorChoice:
      d.lastColorChoice === 'w' || d.lastColorChoice === 'b' || d.lastColorChoice === 'random'
        ? d.lastColorChoice
        : DEFAULT_SETTINGS.lastColorChoice,
  };
}

export function loadSettings(storage: StorageLike): Settings {
  try {
    return parseSettings(storage.getItem(SETTINGS_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: StorageLike, settings: Settings): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are non-critical; the in-memory value stays in effect for this session.
  }
}
