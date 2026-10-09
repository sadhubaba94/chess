import { formatClock } from '../../core/clock';
import type { Color, PieceType } from '../../core/types';
import { PieceIcon } from './PieceIcon';

const VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p'];

interface PlayerBarProps {
  name: string;
  color: Color;
  /** Opponent pieces this player has captured. */
  captured: PieceType[];
  materialLead: number;
  timeMs: number | null;
  clockRunning: boolean;
  toMove: boolean;
  thinking: boolean;
}

export function materialLead(captured: Record<Color, PieceType[]>, color: Color): number {
  // captured[c] lists pieces lost by colour c.
  const lost = (c: Color) => captured[c].reduce((s, p) => s + VALUES[p], 0);
  return lost(color === 'w' ? 'b' : 'w') - lost(color);
}

export function PlayerBar({ name, color, captured, materialLead: lead, timeMs, clockRunning, toMove, thinking }: PlayerBarProps) {
  const sorted = [...captured].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const low = timeMs !== null && timeMs < 20_000;
  return (
    <div className={`player-bar${toMove ? ' player-bar--active' : ''}`} data-testid={`player-${color}`}>
      <div className="player-bar__identity">
        <span className={`player-bar__swatch player-bar__swatch--${color}`} aria-hidden="true" />
        <span className="player-bar__name">{name}</span>
        {thinking && (
          <span className="thinking" role="status" aria-live="polite">
            <span className="thinking__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Thinking
          </span>
        )}
      </div>
      <div className="player-bar__captured" aria-label={`Pieces captured by ${name}: ${sorted.length ? sorted.join(', ') : 'none'}`}>
        {sorted.map((p, i) => (
          <PieceIcon key={i} className="captured-piece" color={color === 'w' ? 'b' : 'w'} type={p} />
        ))}
        {lead > 0 && <span className="player-bar__lead">+{lead}</span>}
      </div>
      {timeMs !== null && (
        <div
          className={`clock${clockRunning ? ' clock--running' : ''}${low ? ' clock--low' : ''}`}
          role="timer"
          aria-label={`${name} clock`}
          data-testid={`clock-${color}`}
        >
          {formatClock(timeMs)}
        </div>
      )}
    </div>
  );
}
