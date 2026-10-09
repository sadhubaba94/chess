import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isPaused, remainingAt, timeControlLabel, timeControlPgn } from '../../core/clock';
import { exportPgn } from '../../core/pgn';
import { ChessGame } from '../../core/rules/game';
import {
  DIFFICULTY_LABELS,
  createGameRecord,
  isEngineTurn,
  playerNames,
  undoPlies,
  type GameRecord,
} from '../../core/session';
import { colorName, describeResult, opposite, type Color, type PromotionPiece, type Square } from '../../core/types';
import { createGameId, gamePath } from '../../app/launch';
import { baseUrl, navigate } from '../../app/router';
import { playSound } from '../../audio/sounds';
import { Board } from '../components/Board';
import { ConfirmDialog, Modal } from '../components/Modal';
import { MoveList } from '../components/MoveList';
import { Icon } from '../components/Icon';
import { PieceIcon } from '../components/PieceIcon';
import { PlayerBar, materialLead } from '../components/PlayerBar';
import { SettingsPanel } from '../components/SettingsPanel';
import { useEngineOpponent } from '../hooks/useEngineOpponent';
import { useGameSession } from '../hooks/useGameSession';
import { useNow } from '../hooks/useNow';
import { useSettings } from '../hooks/settings';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy approach
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PageMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page-message">
      <h1>{title}</h1>
      {children}
      <div className="page-message__actions">
        <a className="btn btn--primary" href={baseUrl()}>
          Go to home page
        </a>
      </div>
    </main>
  );
}

export function GamePage({ id }: { id: string }) {
  const { settings, update, reducedMotion } = useSettings();
  const session = useGameSession(id);
  const { state, record, game, dispatch, recordRef, saveError } = session;
  const engine = useEngineOpponent(record, recordRef, dispatch);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [confirm, setConfirm] = useState<'restart' | 'resign' | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prevRef = useRef<{ id: string; ply: number; finished: boolean } | null>(null);
  const now = useNow(!!record?.clock.running);

  // Sounds and the result dialog react to live transitions only (not to the initial load).
  useEffect(() => {
    if (!record || !game) return;
    const prev = prevRef.current;
    prevRef.current = { id: record.id, ply: record.moves.length, finished: !!record.result };
    if (!prev || prev.id !== record.id) return;
    if (record.moves.length > prev.ply && settings.sound) {
      const last = game.history()[game.ply() - 1];
      if (last) playSound(last.check ? 'check' : last.captured ? 'capture' : 'move');
    }
    if (record.result && !prev.finished) {
      if (settings.sound) window.setTimeout(() => playSound('result'), 150);
      setShowResult(true);
    }
    if (!record.result) setShowResult(false);
  }, [record, game, settings.sound]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (record) {
      const mode = record.config.mode === 'computer' ? `vs Computer (${DIFFICULTY_LABELS[record.config.difficulty]})` : 'Two players';
      document.title = `${record.result ? 'Finished' : 'Playing'}: ${mode} · Kingside`;
    }
  }, [record]);

  const names = record ? playerNames(record.config) : { w: 'White', b: 'Black' };

  const reviewGame = useMemo(() => {
    if (!game || viewPly === null || viewPly >= game.ply()) return null;
    return new ChessGame(game.fenAt(viewPly));
  }, [game, viewPly]);

  if (state.status === 'loading') {
    return (
      <main className="page-message" aria-busy="true">
        <p>Loading game…</p>
      </main>
    );
  }
  if (state.status === 'not_found') {
    return (
      <PageMessage title="Game not found">
        <p>
          This game isn't saved in this browser. It may have been deleted, or it was created in another browser or in a
          private window.
        </p>
      </PageMessage>
    );
  }
  if (state.status === 'corrupt') {
    return (
      <PageMessage title="This saved game can't be opened">
        <p>{state.message}</p>
        <p>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              session.deleteGame();
              navigate(baseUrl());
            }}
          >
            Delete the damaged game
          </button>
        </p>
      </PageMessage>
    );
  }
  if (!record || !game) return null;

  const config = record.config;
  const livePly = game.ply();
  const reviewing = viewPly !== null && viewPly < livePly;
  const displayPly = reviewing ? viewPly : livePly;
  const turn = game.turn();
  const paused = isPaused(record.clock);
  const humanTurn = config.mode === 'local' || turn === config.humanColor;
  const canMove = !reviewing && !record.result && !paused && humanTurn;
  const legalMoves = canMove ? game.legalMoves() : [];
  const baseOrientation: Color = config.mode === 'computer' ? config.humanColor : 'w';
  const orientation: Color = flipped ? opposite(baseOrientation) : baseOrientation;
  const shownGame = reviewGame ?? game;
  const lastRecord = displayPly > 0 ? game.history()[displayPly - 1] : undefined;
  const lastMove = lastRecord ? { from: lastRecord.from, to: lastRecord.to } : null;
  const checkSquare: Square | null = shownGame.inCheck() ? shownGame.kingSquare(shownGame.turn()) : null;
  const captured = game.capturedPieces();
  const timed = record.clock.initialMs !== null;
  const undoCount = undoPlies(record, game);
  const claimable = !record.result && game.canClaimDraw() && humanTurn;
  const engineThinking = engine.thinking && isEngineTurn(record, game);
  const top: Color = opposite(orientation);
  const bottom: Color = orientation;
  const resignColor: Color = config.mode === 'computer' ? config.humanColor : turn;

  const onMove = (move: { from: Square; to: Square; promotion?: PromotionPiece }) => {
    const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
    const ok = dispatch({ type: 'move', uci, now: Date.now() });
    if (!ok && settings.sound) playSound('illegal');
  };

  const pgnText = () =>
    exportPgn({
      game,
      result: record.result,
      white: names.w,
      black: names.b,
      date: new Date(record.createdAt),
      timeControl: timeControlPgn(config.timeControl),
      event: config.mode === 'computer' ? 'Casual game vs computer' : 'Casual game',
    });

  const rematch = () => {
    const nextConfig = config.mode === 'computer' ? { ...config, humanColor: opposite(config.humanColor) } : config;
    const next: GameRecord = createGameRecord(nextConfig, { id: createGameId(), now: Date.now(), startFen: record.startFen });
    session.repo.save(next);
    setShowResult(false);
    navigate(gamePath(next.id, baseUrl()));
  };

  const statusText = record.result
    ? `${describeResult(record.result).headline}: ${describeResult(record.result).reason}.`
    : `${colorName(turn)} to move${game.inCheck() ? ': check!' : ''}`;

  const clockFor = (c: Color) => (timed ? remainingAt(record.clock, c, now) : null);
  const playerBar = (c: Color) => (
    <PlayerBar
      name={names[c]}
      color={c}
      captured={captured[opposite(c)]}
      materialLead={materialLead(captured, c)}
      timeMs={clockFor(c)}
      clockRunning={record.clock.running === c}
      toMove={!record.result && turn === c}
      thinking={engineThinking && turn === c}
    />
  );

  const goPly = (ply: number) => setViewPly(ply >= livePly ? null : Math.max(0, ply));

  return (
    <div className="game-page">
      <header className="topbar topbar--game">
        <a className="brand" href={baseUrl()} aria-label="Kingside home">
          <PieceIcon className="brand__icon" color="w" type="k" />
          <span>Kingside</span>
        </a>
        <p className="topbar__title">
          {config.mode === 'computer' ? `vs Computer · ${DIFFICULTY_LABELS[config.difficulty]}` : 'Two players'} ·{' '}
          {timeControlLabel(config.timeControl)}
        </p>
        <nav className="topbar__nav" aria-label="Game">
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-pressed={settings.sound}
            onClick={() => update({ sound: !settings.sound })}
            title={settings.sound ? 'Sound on' : 'Sound off'}
          >
            {settings.sound ? 'Sound on' : 'Sound off'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </nav>
      </header>

      <main className="game-layout">
        <section className="board-column" aria-label="Board">
          {playerBar(top)}
          <div className="board-wrap">
            <Board
              board={shownGame.board()}
              orientation={orientation}
              legalMoves={legalMoves}
              lastMove={lastMove}
              checkSquare={checkSquare}
              onMove={onMove}
              showLegalMoves={settings.showLegalMoves}
              showCoordinates={settings.showCoordinates}
              animate={settings.animations && !reducedMotion}
              theme={settings.boardTheme}
              positionKey={`${displayPly}:${record.moves[displayPly - 1] ?? 'start'}:${record.moves.length === 0 ? record.updatedAt : ''}`}
              label={`Chess board, ${colorName(orientation)} at the bottom${reviewing ? ', reviewing an earlier position' : ''}`}
            />
            {paused && !record.result && (
              <div className="board-overlay" role="dialog" aria-label="Game paused">
                <div className="board-overlay__panel">
                  <p className="board-overlay__title">Clock paused</p>
                  <p>The clock stops when this page is closed or reloaded. Resume when both players are ready.</p>
                  <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'resume', now: Date.now() })} autoFocus>
                    Resume game
                  </button>
                </div>
              </div>
            )}
          </div>
          {playerBar(bottom)}
        </section>

        <aside className="side-panel">
          <div className="card status-card">
            <p className={`status${record.result ? ' status--final' : ''}`} role="status" aria-live="polite" data-testid="status">
              {statusText}
            </p>
            {reviewing && (
              <div className="banner banner--review">
                <span>
                  Reviewing position after {displayPly === 0 ? 'the start' : `ply ${displayPly}`}. The live game is unchanged
                  {record.clock.running ? ' and clocks keep running' : ''}.
                </span>
                <button type="button" className="btn btn--small btn--primary" onClick={() => setViewPly(null)} data-testid="back-to-live">
                  Back to live
                </button>
              </div>
            )}
            {record.drawOffer && !record.result && (
              <div className="banner banner--offer" role="alert">
                <span>{colorName(record.drawOffer)} offers a draw.</span>
                <span className="banner__actions">
                  <button type="button" className="btn btn--small btn--primary" onClick={() => dispatch({ type: 'acceptDraw', now: Date.now() })}>
                    {colorName(opposite(record.drawOffer))} accepts
                  </button>
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => dispatch({ type: 'declineDraw' })}>
                    Decline
                  </button>
                </span>
              </div>
            )}
            {engine.error && (
              <div className="banner banner--error" role="alert">
                <span>{engine.error}</span>
                <button type="button" className="btn btn--small btn--primary" onClick={engine.retry}>
                  Retry
                </button>
              </div>
            )}
            {saveError && (
              <p className="banner banner--error" role="alert">
                {saveError}
              </p>
            )}
          </div>

          <div className="card controls" role="group" aria-label="Game controls">
            <button type="button" className="btn btn--secondary" onClick={() => navigate(baseUrl())}>
              New game
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setConfirm('restart')}>
              Restart
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!undoCount}
              title={
                timed
                  ? 'Undo is available only in untimed games'
                  : undoCount === 2
                    ? 'Takes back your move and the computer reply'
                    : undefined
              }
              onClick={() => {
                setViewPly(null);
                dispatch({ type: 'undo', now: Date.now() });
              }}
            >
              Undo
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
              Flip board
            </button>
            {config.mode === 'local' && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={!!record.result || !!record.drawOffer}
                onClick={() => dispatch({ type: 'offerDraw', color: turn })}
              >
                Offer draw ({colorName(turn)})
              </button>
            )}
            {claimable && (
              <button type="button" className="btn btn--accent" onClick={() => dispatch({ type: 'claimDraw', now: Date.now() })} data-testid="claim-draw">
                Claim draw ({game.canClaimThreefold() ? 'repetition' : '50 moves'})
              </button>
            )}
            <button type="button" className="btn btn--danger-outline" disabled={!!record.result} onClick={() => setConfirm('resign')}>
              Resign{config.mode === 'local' ? ` (${colorName(resignColor)})` : ''}
            </button>
          </div>

          <div className="card history">
            <div className="card__header">
              <h2 className="card__title">Moves</h2>
              <div
                className="review-nav"
                role="group"
                aria-label="Review moves"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') goPly(displayPly - 1);
                  if (e.key === 'ArrowRight') goPly(displayPly + 1);
                }}
              >
                <button type="button" className="btn btn--icon btn--ghost" aria-label="First position" disabled={displayPly === 0} onClick={() => goPly(0)}>
                  <Icon name="first" />
                </button>
                <button type="button" className="btn btn--icon btn--ghost" aria-label="Previous move" disabled={displayPly === 0} onClick={() => goPly(displayPly - 1)} data-testid="review-prev">
                  <Icon name="prev" />
                </button>
                <button type="button" className="btn btn--icon btn--ghost" aria-label="Next move" disabled={!reviewing} onClick={() => goPly(displayPly + 1)}>
                  <Icon name="next" />
                </button>
                <button type="button" className="btn btn--icon btn--ghost" aria-label="Live position" disabled={!reviewing} onClick={() => setViewPly(null)}>
                  <Icon name="last" />
                </button>
              </div>
            </div>
            <MoveList moves={game.history()} startFen={record.startFen} viewPly={displayPly} onSelectPly={goPly} />
          </div>

          <div className="card export">
            <h2 className="card__title">Export</h2>
            <div className="export__buttons">
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={async () => setToast((await copyText(pgnText())) ? 'PGN copied to clipboard' : 'Copy failed')}
              >
                Copy PGN
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => downloadText(`kingside-${new Date(record.createdAt).toISOString().slice(0, 10)}-${record.id.slice(0, 8)}.pgn`, pgnText())}
                data-testid="download-pgn"
              >
                Download PGN
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={async () => setToast((await copyText(shownGame.fen())) ? 'FEN copied to clipboard' : 'Copy failed')}
              >
                Copy FEN
              </button>
            </div>
            <label className="textarea-label" htmlFor="fen-output">
              FEN of the shown position
            </label>
            <input id="fen-output" className="input input--mono" readOnly value={shownGame.fen()} data-testid="fen-output" onFocus={(e) => e.currentTarget.select()} />
          </div>
        </aside>
      </main>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {confirm === 'restart' && (
        <ConfirmDialog
          title="Restart this game?"
          message="All moves will be cleared and the clocks reset. This can't be undone."
          confirmLabel="Restart"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            setViewPly(null);
            dispatch({ type: 'restart', now: Date.now() });
          }}
        />
      )}
      {confirm === 'resign' && (
        <ConfirmDialog
          title={config.mode === 'local' ? `Resign as ${colorName(resignColor)}?` : 'Resign this game?'}
          message={`${colorName(opposite(resignColor))} will be declared the winner.`}
          confirmLabel="Resign"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            dispatch({ type: 'resign', color: resignColor, now: Date.now() });
          }}
        />
      )}
      {showResult && record.result && (
        <Modal
          title={describeResult(record.result).headline}
          onClose={() => setShowResult(false)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setShowResult(false)}>
                Review game
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => navigate(baseUrl())}>
                Home
              </button>
              <button type="button" className="btn btn--primary" onClick={rematch} autoFocus>
                Rematch
              </button>
            </>
          }
        >
          <p className="result-reason" data-testid="result-reason">
            {describeResult(record.result).reason.replace(/^./, (c) => c.toUpperCase())}.
          </p>
          {config.mode === 'computer' && (
            <p className="muted">Rematch swaps colours: you will play {colorName(opposite(config.humanColor))}.</p>
          )}
        </Modal>
      )}
      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)} actions={<button type="button" className="btn btn--primary" onClick={() => setShowSettings(false)}>Done</button>}>
          <SettingsPanel />
        </Modal>
      )}
    </div>
  );
}
