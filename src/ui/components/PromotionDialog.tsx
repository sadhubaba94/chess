import { useEffect, useRef } from 'react';
import { PIECE_NAMES, PROMOTION_PIECES, type Color, type PromotionPiece } from '../../core/types';
import { PieceIcon } from './PieceIcon';

export function PromotionDialog({
  color,
  onSelect,
  onCancel,
}: {
  color: Color;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  return (
    <div
      className="promotion"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a piece for promotion"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="promotion__panel">
        <p className="promotion__title">Promote to</p>
        <div className="promotion__choices">
          {PROMOTION_PIECES.map((p, i) => (
            <button
              key={p}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className="promotion__choice"
              aria-label={`Promote to ${PIECE_NAMES[p]}`}
              data-testid={`promote-${p}`}
              onClick={() => onSelect(p)}
            >
              <PieceIcon color={color} type={p} />
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
