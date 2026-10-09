import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INCREMENT_SECONDS, TIME_CONTROL_MINUTES, timeControlLabel } from '../../core/clock';
import { PgnError, parsePgn } from '../../core/pgn';
import { ChessGame } from '../../core/rules/game';
import { FenError } from '../../core/rules/position';
import { DIFFICULTY_LABELS, createGameRecord, type Difficulty, type GameConfig, type GameMode } from '../../core/session';
import { colorName, describeResult, type Color, type GameResult } from '../../core/types';
import { LEVELS } from '../../engine/levels';
import { createGameId, gamePath, launchGameInNewTab } from '../../app/launch';
import { baseUrl, navigate } from '../../app/router';
import type { ColorChoice } from '../../persistence/settings';
import { GameRepository, StorageError, getBrowserStorage, isPersistentStorage, type SummaryEntry } from '../../persistence/storage';
import { AboutDialog } from '../components/AboutDialog';
import { ConfirmDialog, Modal } from '../components/Modal';
import { PieceIcon } from '../components/PieceIcon';
import { RulesGuide } from '../components/RulesGuide';
import { Segmented, Toggle } from '../components/Segmented';
import { BoardThemePicker, SettingsPanel } from '../components/SettingsPanel';
import { useSettings } from '../hooks/settings';

const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  easy: `Looks ${LEVELS.easy.maxDepth} move ahead and often picks a less accurate move. Good for beginners.`,
  medium: `Searches ${LEVELS.medium.maxDepth} plies and makes occasional inaccuracies.`,
  hard: `Searches up to ${LEVELS.hard.maxDepth} plies with no deliberate mistakes.`,
  expert: `Strongest setting: deepest search within ${LEVELS.expert.moveTimeMs / 1000} s per move.`,
};

type ImportFormat = 'auto' | 'pgn' | 'fen';

function looksLikeFen(text: string): boolean {
  return /^\s*[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]\b/.test(text);
}

function resultText(result: GameResult | null): string {
  if (!result) return 'In progress';
  const d = describeResult(result);
  return `${d.headline}: ${d.reason}`;
}

function modeText(config: GameConfig): string {
  return config.mode === 'computer' ? `vs Computer (${DIFFICULTY_LABELS[config.difficulty]})` : 'Two players, same device';
}

export function HomePage() {
  const { settings, update } = useSettings();
  const repo = useMemo(() => new GameRepository(getBrowserStorage()), []);
  const [setup, setSetup] = useState<GameConfig>(settings.lastSetup);
  const [colorChoice, setColorChoice] = useState<ColorChoice>(settings.lastColorChoice);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SummaryEntry[]>(() => repo.list());
  const [dialog, setDialog] = useState<'settings' | 'rules' | 'about' | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete'; id: string } | { kind: 'clear' } | null>(null);
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<ImportFormat>('auto');
  const [importError, setImportError] = useState<string | null>(null);
  const setupRef = useRef<HTMLElement>(null);
  const savedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = 'Kingside: play chess in your browser';
  }, []);

  const refresh = useCallback(() => setSaved(repo.list()), [repo]);
  useEffect(() => {
    const onStorage = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
    };
  }, [refresh]);

  const patchSetup = (patch: Partial<GameConfig>) => setSetup((s) => ({ ...s, ...patch }));

  const openUrl = (url: string): Window | null => window.open(url, '_blank');

  const startGame = (extra?: { startFen: string; moves: string[]; result: GameResult | null; source: 'pgn' | 'fen' }): boolean => {
    setError(null);
    const humanColor: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
    const config: GameConfig = { ...setup, humanColor };
    update({ lastSetup: { ...setup, humanColor: colorChoice === 'random' ? setup.humanColor : humanColor }, lastColorChoice: colorChoice });
    try {
      const record = createGameRecord(config, { id: createGameId(), now: Date.now(), ...extra });
      const launched = launchGameInNewTab(record, { repo, open: openUrl, baseUrl: baseUrl() });
      setBlockedUrl(launched.opened ? null : launched.url);
      refresh();
      return true;
    } catch (e) {
      setError(e instanceof StorageError ? e.message : `The game could not be created: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  };

  const resumeGame = (id: string) => {
    const url = gamePath(id, baseUrl());
    const win = openUrl(url);
    if (win) {
      try {
        win.opener = null;
      } catch {
        // ignore
      }
      setBlockedUrl(null);
    } else setBlockedUrl(url);
  };

  const runImport = () => {
    setImportError(null);
    const text = importText.trim();
    if (!text) {
      setImportError('Paste a PGN or FEN first.');
      return;
    }
    const format = importFormat === 'auto' ? (looksLikeFen(text) ? 'fen' : 'pgn') : importFormat;
    try {
      if (format === 'fen') {
        const game = new ChessGame(text);
        if (startGame({ startFen: game.startFen, moves: [], result: game.automaticOutcome(), source: 'fen' })) setImportText('');
      } else {
        const parsed = parsePgn(text);
        if (startGame({ startFen: parsed.startFen, moves: parsed.moves, result: parsed.result, source: 'pgn' })) setImportText('');
      }
    } catch (e) {
      if (e instanceof FenError) setImportError(`Invalid FEN: ${e.message}`);
      else if (e instanceof PgnError) setImportError(`Invalid PGN: ${e.message}`);
      else setImportError(e instanceof Error ? e.message : 'The text could not be imported.');
    }
  };

  const quickStart = (mode: GameMode) => {
    patchSetup({ mode });
    setupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => setupRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 300);
  };

  const validSaved = saved.filter((s) => s.ok).length;
  const timed = setup.timeControl.minutes !== null;

  return (
    <div className="home">
      <header className="topbar">
        <a className="brand" href={baseUrl()} aria-label="Kingside home">
          <PieceIcon className="brand__icon" color="w" type="k" />
          <span>Kingside</span>
        </a>
        <nav className="topbar__nav" aria-label="Main">
          <button type="button" className="btn btn--ghost" onClick={() => setDialog('rules')}>
            Rules
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setDialog('settings')}>
            Settings
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setDialog('about')}>
            About
          </button>
        </nav>
      </header>

      <main className="home__main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__text">
            <h1 id="hero-title">Play chess in your browser</h1>
            <p className="hero__lead">
              Play the computer at four levels or a friend on the same device. No account needed. Games are saved in
              this browser after every move.
            </p>
          </div>
          <div className="hero__actions">
            <button type="button" className="action-card" onClick={() => quickStart('computer')}>
              <PieceIcon className="action-card__icon" color="b" type="n" />
              <span className="action-card__title">Play against computer</span>
              <span className="action-card__text">Easy, Medium, Hard or Expert</span>
            </button>
            <button type="button" className="action-card" onClick={() => quickStart('local')}>
              <PieceIcon className="action-card__icon" color="w" type="q" />
              <span className="action-card__title">Play with a friend</span>
              <span className="action-card__text">Take turns on this device</span>
            </button>
            <button
              type="button"
              className="action-card"
              onClick={() => {
                savedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                savedRef.current?.focus({ preventScroll: true });
              }}
            >
              <PieceIcon className="action-card__icon" color="b" type="r" />
              <span className="action-card__title">Resume saved game</span>
              <span className="action-card__text">
                {validSaved ? `${validSaved} saved game${validSaved === 1 ? '' : 's'}` : 'No saved games yet'}
              </span>
            </button>
          </div>
        </section>

        {!isPersistentStorage() && (
          <p className="notice notice--warning" role="status">
            Browser storage is unavailable (private mode or blocked). Games can't be saved, and opening a game in a new tab
            won't work. Allow site storage to use Kingside fully.
          </p>
        )}

        <div className="home__grid">
          <section ref={setupRef} className="card setup" aria-labelledby="setup-title" id="setup">
            <h2 id="setup-title" className="card__title">
              New game
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                startGame();
              }}
            >
              <Segmented<GameMode>
                legend="Game mode"
                name="mode"
                value={setup.mode}
                onChange={(mode) => patchSetup({ mode })}
                options={[
                  { value: 'computer', label: 'Vs computer' },
                  { value: 'local', label: 'Two players' },
                ]}
              />
              {setup.mode === 'computer' && (
                <>
                  <Segmented<ColorChoice>
                    legend="You play"
                    name="color"
                    value={colorChoice}
                    onChange={setColorChoice}
                    options={[
                      { value: 'w', label: 'White' },
                      { value: 'b', label: 'Black' },
                      { value: 'random', label: 'Random' },
                    ]}
                  />
                  <Segmented<Difficulty>
                    legend="Computer difficulty"
                    name="difficulty"
                    value={setup.difficulty}
                    onChange={(difficulty) => patchSetup({ difficulty })}
                    options={(['easy', 'medium', 'hard', 'expert'] as const).map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
                  />
                  <p className="field-hint">{DIFFICULTY_HINTS[setup.difficulty]}</p>
                </>
              )}
              <Segmented<number | null>
                legend="Time control (minutes per player)"
                name="minutes"
                value={setup.timeControl.minutes}
                onChange={(minutes) =>
                  patchSetup({ timeControl: { minutes, incrementSeconds: minutes === null ? 0 : setup.timeControl.incrementSeconds } })
                }
                options={TIME_CONTROL_MINUTES.map((m) => ({ value: m, label: m === null ? 'Untimed' : `${m}` }))}
              />
              <Segmented<number>
                legend="Increment (seconds added per move)"
                name="increment"
                value={setup.timeControl.incrementSeconds}
                disabled={!timed}
                onChange={(incrementSeconds) => patchSetup({ timeControl: { ...setup.timeControl, incrementSeconds } })}
                options={INCREMENT_SECONDS.map((s) => ({ value: s, label: s === 0 ? 'None' : `+${s}` }))}
              />
              <BoardThemePicker />
              <Toggle label="Sound effects" checked={settings.sound} onChange={(sound) => update({ sound })} />
              <p className="setup__summary">
                {setup.mode === 'computer'
                  ? `You (${colorChoice === 'random' ? 'random colour' : colorName(colorChoice)}) vs Computer (${DIFFICULTY_LABELS[setup.difficulty]})`
                  : 'Two players on this device'}{' '}
                · {timeControlLabel(setup.timeControl)}
                {!timed && ' · undo allowed'}
              </p>
              <button type="submit" className="btn btn--primary btn--large" data-autofocus data-testid="start-game">
                Start game
              </button>
              <p className="field-hint field-hint--after">The game opens in a new tab, so you can keep several games going at once.</p>
            </form>
            {blockedUrl && (
              <div className="notice notice--info" role="alert" data-testid="popup-fallback">
                <p>Your browser blocked the new tab. Your game is saved. Open it here:</p>
                <p className="notice__actions">
                  <a className="btn btn--primary" href={blockedUrl} target="_blank" rel="noopener" onClick={() => setBlockedUrl(null)}>
                    Open game in new tab
                  </a>
                  <button type="button" className="btn btn--ghost" onClick={() => navigate(blockedUrl)}>
                    Open in this tab
                  </button>
                </p>
              </div>
            )}
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
          </section>

          <div className="home__side">
            <section ref={savedRef} className="card saved" aria-labelledby="saved-title" id="saved" tabIndex={-1}>
              <div className="card__header">
                <h2 id="saved-title" className="card__title">
                  Saved games
                </h2>
                {saved.length > 0 && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirm({ kind: 'clear' })}>
                    Clear history
                  </button>
                )}
              </div>
              {saved.length === 0 ? (
                <p className="empty-state">Your games will appear here. They're stored only in this browser.</p>
              ) : (
                <ul className="saved__list" data-testid="saved-list">
                  {saved.map((entry) =>
                    entry.ok ? (
                      <li key={entry.summary.id} className="saved__item">
                        <div className="saved__info">
                          <span className="saved__title">{modeText(entry.summary.config)}</span>
                          <span className="saved__meta">
                            <time dateTime={new Date(entry.summary.updatedAt).toISOString()}>
                              {new Date(entry.summary.updatedAt).toLocaleString()}
                            </time>
                            {' · '}
                            {timeControlLabel(entry.summary.config.timeControl)}
                            {' · '}
                            {entry.summary.moveCount} {entry.summary.moveCount === 1 ? 'ply' : 'plies'}
                            {entry.summary.config.mode === 'computer' && ` · you: ${colorName(entry.summary.config.humanColor)}`}
                          </span>
                          <span className={`saved__result${entry.summary.result ? '' : ' saved__result--live'}`}>
                            {resultText(entry.summary.result)}
                          </span>
                        </div>
                        <div className="saved__actions">
                          <button type="button" className="btn btn--secondary btn--small" onClick={() => resumeGame(entry.summary.id)}>
                            {entry.summary.result ? 'Review' : 'Resume'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            aria-label={`Delete game from ${new Date(entry.summary.updatedAt).toLocaleString()}`}
                            onClick={() => setConfirm({ kind: 'delete', id: entry.summary.id })}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ) : (
                      <li key={entry.id} className="saved__item saved__item--broken">
                        <div className="saved__info">
                          <span className="saved__title">Unreadable saved game</span>
                          <span className="saved__meta">{entry.message}</span>
                        </div>
                        <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirm({ kind: 'delete', id: entry.id })}>
                          Delete
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>

            <section className="card import" aria-labelledby="import-title">
              <h2 id="import-title" className="card__title">
                Import PGN or FEN
              </h2>
              <p className="field-hint">
                Starts a new game using the settings under "New game". A <strong>PGN</strong> restores the full move history,
                including repetition and 50-move information. A <strong>FEN</strong> describes only one position, so earlier
                repetitions can't be known and threefold claims count from the imported position.
              </p>
              <Segmented<ImportFormat>
                legend="Format"
                name="import-format"
                value={importFormat}
                onChange={setImportFormat}
                options={[
                  { value: 'auto', label: 'Detect' },
                  { value: 'pgn', label: 'PGN' },
                  { value: 'fen', label: 'FEN' },
                ]}
              />
              <label className="textarea-label" htmlFor="import-text">
                PGN or FEN text
              </label>
              <textarea
                id="import-text"
                className="textarea"
                rows={5}
                spellCheck={false}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={'[Event "Casual"]\n1. e4 e5 2. Nf3 Nc6 *'}
                data-testid="import-text"
              />
              {importError && (
                <p className="notice notice--error" role="alert" data-testid="import-error">
                  {importError}
                </p>
              )}
              <button type="button" className="btn btn--secondary" onClick={runImport} data-testid="import-start">
                Import and open
              </button>
            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <span>Kingside: free, open source, runs entirely in your browser.</span>
        <button type="button" className="link-button" onClick={() => setDialog('about')}>
          Licences
        </button>
      </footer>

      {dialog === 'settings' && (
        <Modal title="Settings" onClose={() => setDialog(null)} actions={<button type="button" className="btn btn--primary" onClick={() => setDialog(null)}>Done</button>}>
          <SettingsPanel />
        </Modal>
      )}
      {dialog === 'rules' && (
        <Modal wide title="Rules guide" onClose={() => setDialog(null)} actions={<button type="button" className="btn btn--primary" onClick={() => setDialog(null)}>Close</button>}>
          <RulesGuide />
        </Modal>
      )}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'clear' ? 'Clear all saved games?' : 'Delete this game?'}
          message={
            confirm.kind === 'clear'
              ? 'Every saved game in this browser will be permanently deleted. Games open in other tabs will stop saving.'
              : 'This saved game will be permanently deleted.'
          }
          confirmLabel={confirm.kind === 'clear' ? 'Clear history' : 'Delete game'}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === 'clear') repo.clearAll();
            else repo.delete(confirm.id);
            setConfirm(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
