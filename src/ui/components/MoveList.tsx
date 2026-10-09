import { useEffect, useRef } from 'react';
import type { MoveRecord } from '../../core/rules/game';

interface MoveListProps {
  moves: readonly MoveRecord[];
  startFen: string;
  /** Ply currently displayed (moves.length = live). */
  viewPly: number;
  onSelectPly: (ply: number) => void;
}

/** Move history in SAN; clicking a move shows that position without touching the live game. */
export function MoveList({ moves, startFen, viewPly, onSelectPly }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const startNumber = Number(startFen.split(' ')[5]);
  const blackFirst = startFen.split(' ')[1] === 'b';

  const rows: { number: number; white?: { ply: number; san: string }; black?: { ply: number; san: string } }[] = [];
  moves.forEach((m, i) => {
    const ply = i + 1;
    const offset = i + (blackFirst ? 1 : 0);
    const number = startNumber + Math.floor(offset / 2);
    let row = rows[rows.length - 1];
    if (!row || row.number !== number) {
      row = { number };
      rows.push(row);
    }
    if (m.color === 'w') row.white = { ply, san: m.san };
    else row.black = { ply, san: m.san };
  });

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    active?.scrollIntoView?.({ block: 'nearest' });
  }, [viewPly, moves.length]);

  if (!moves.length) return <p className="move-list__empty">No moves yet. White moves first.</p>;

  const cell = (entry?: { ply: number; san: string }) =>
    entry ? (
      <button
        type="button"
        className={`move-list__move${entry.ply === viewPly ? ' move-list__move--current' : ''}`}
        aria-current={entry.ply === viewPly ? 'step' : undefined}
        onClick={() => onSelectPly(entry.ply)}
      >
        {entry.san}
      </button>
    ) : (
      <span className="move-list__move move-list__move--blank">…</span>
    );

  return (
    <ol ref={listRef} className="move-list" aria-label="Move history" data-testid="move-list">
      {rows.map((row) => (
        <li key={row.number} className="move-list__row">
          <span className="move-list__number">{row.number}.</span>
          {cell(row.white)}
          {cell(row.black)}
        </li>
      ))}
    </ol>
  );
}
