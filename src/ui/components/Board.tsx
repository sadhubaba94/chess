import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { MoveInfo } from '../../core/rules/game';
import {
  FILES,
  PIECE_NAMES,
  indexToSquare,
  squareToIndex,
  type Color,
  type Piece,
  type PromotionPiece,
  type Square,
} from '../../core/types';
import type { BoardTheme } from '../../persistence/settings';
import { PieceIcon } from './PieceIcon';
import { PromotionDialog } from './PromotionDialog';

export interface BoardProps {
  board: (Piece | null)[];
  orientation: Color;
  /** Legal moves the user may play now (empty when the board is read-only). */
  legalMoves: readonly MoveInfo[];
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  onMove: (move: { from: Square; to: Square; promotion?: PromotionPiece }) => void;
  showLegalMoves: boolean;
  showCoordinates: boolean;
  animate: boolean;
  theme: BoardTheme;
  /** Changes whenever a new position is shown; used to restart move animations. */
  positionKey: string;
  label: string;
}

interface DragState {
  from: Square;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

const DRAG_THRESHOLD = 5;

function squareLabel(square: Square, piece: Piece | null): string {
  return piece ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.type]}` : `${square}, empty`;
}

export function Board(props: BoardProps) {
  const { board, orientation, legalMoves, lastMove, checkSquare, onMove, showLegalMoves, showCoordinates, theme } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [focused, setFocused] = useState<Square>(orientation === 'w' ? 'e2' : 'e7');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null);
  const suppressClick = useRef(false);
  const droppedByDrag = useRef<string | null>(null);

  const interactive = legalMoves.length > 0;
  const movableFrom = useMemo(() => new Set(legalMoves.map((m) => m.from)), [legalMoves]);
  const targets = useMemo(() => {
    const from = drag?.active ? drag.from : selected;
    return from ? legalMoves.filter((m) => m.from === from) : [];
  }, [legalMoves, selected, drag]);
  const targetSet = useMemo(() => new Set(targets.map((m) => m.to)), [targets]);

  // Reset transient interaction state whenever the position changes.
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
    setDrag(null);
  }, [props.positionKey]);

  const ownPieceColor = legalMoves[0]?.color ?? null;

  const tryMove = useCallback(
    (from: Square, to: Square, viaDrag: boolean): boolean => {
      const candidates = legalMoves.filter((m) => m.from === from && m.to === to);
      if (!candidates.length) return false;
      setSelected(null);
      if (candidates.some((m) => m.promotion)) {
        setPromotion({ from, to, color: candidates[0]!.color });
        return true;
      }
      droppedByDrag.current = viaDrag ? `${from}${to}` : null;
      onMove({ from, to });
      return true;
    },
    [legalMoves, onMove],
  );

  const activate = useCallback(
    (square: Square) => {
      if (!interactive || promotion) return;
      const piece = board[squareToIndex(square)];
      if (selected) {
        if (selected === square) {
          setSelected(null);
          return;
        }
        if (tryMove(selected, square, false)) return;
        if (piece && piece.color === ownPieceColor && movableFrom.has(square)) {
          setSelected(square);
          return;
        }
        setSelected(null);
        return;
      }
      if (piece && piece.color === ownPieceColor && movableFrom.has(square)) setSelected(square);
    },
    [interactive, promotion, board, selected, tryMove, ownPieceColor, movableFrom],
  );

  const squareFromPoint = (clientX: number, clientY: number): Square | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const file = orientation === 'w' ? col : 7 - col;
    const rank = orientation === 'w' ? 7 - row : row;
    return indexToSquare(rank * 8 + file);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || promotion || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const square = squareFromPoint(e.clientX, e.clientY);
    if (!square || !movableFrom.has(square)) return;
    setDrag({ from: square, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD;
    if (!drag.active && !moved) return;
    if (!drag.active) {
      try {
        boardRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort.
      }
    }
    setDrag({ ...drag, x: e.clientX, y: e.clientY, active: true });
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const wasActive = drag.active;
    setDrag(null);
    if (!wasActive) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (cancelled) return;
    const target = squareFromPoint(e.clientX, e.clientY);
    if (target && target !== drag.from && tryMove(drag.from, target, true)) return;
    setSelected(target === drag.from ? drag.from : null);
  };

  const moveFocus = (square: Square, dFile: number, dRank: number): Square => {
    const idx = squareToIndex(square);
    const sign = orientation === 'w' ? 1 : -1;
    const file = Math.min(7, Math.max(0, (idx % 8) + dFile * sign));
    const rank = Math.min(7, Math.max(0, Math.floor(idx / 8) + dRank * sign));
    return indexToSquare(rank * 8 + file);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, square: Square) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const delta = moves[e.key];
    if (delta) {
      e.preventDefault();
      const next = moveFocus(square, delta[0], delta[1]);
      setFocused(next);
      boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)?.focus();
    } else if (e.key === 'Escape') {
      setSelected(null);
    }
  };

  const animatedTo = props.animate && lastMove && droppedByDrag.current !== `${lastMove.from}${lastMove.to}` ? lastMove : null;

  const squares: Square[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const file = orientation === 'w' ? col : 7 - col;
      const rank = orientation === 'w' ? 7 - row : row;
      squares.push(indexToSquare(rank * 8 + file));
    }
  }

  const boardRect = boardRef.current?.getBoundingClientRect();
  const squareSize = boardRect ? boardRect.width / 8 : 0;
  const dragPiece = drag?.active ? board[squareToIndex(drag.from)] : null;

  return (
    <div className={`board-frame board-theme-${theme}`}>
      <div
        ref={boardRef}
        className={`board${drag?.active ? ' board--dragging' : ''}`}
        role="group"
        aria-label={props.label}
        aria-describedby="board-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        data-testid="board"
        data-orientation={orientation}
      >
        {squares.map((square, i) => {
          const idx = squareToIndex(square);
          const piece = board[idx] ?? null;
          const fileIdx = idx % 8;
          const rankIdx = Math.floor(idx / 8);
          const isLight = (fileIdx + rankIdx) % 2 === 1;
          const isTarget = targetSet.has(square);
          const isSelected = selected === square || drag?.from === square;
          const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
          const isCheck = checkSquare === square;
          const row = Math.floor(i / 8);
          const col = i % 8;
          let pieceStyle: CSSProperties | undefined;
          let pieceKey = `${square}-${piece?.color}${piece?.type}`;
          if (animatedTo && animatedTo.to === square) {
            const from = squareToIndex(animatedTo.from);
            const dx = ((from % 8) - fileIdx) * (orientation === 'w' ? 1 : -1);
            const dy = (rankIdx - Math.floor(from / 8)) * (orientation === 'w' ? 1 : -1);
            pieceStyle = { '--dx': `${dx * 100}%`, '--dy': `${dy * 100}%` } as CSSProperties;
            pieceKey += `-anim-${props.positionKey}`;
          }
          const describe = [
            squareLabel(square, piece),
            isSelected ? 'selected' : '',
            isTarget ? (piece ? 'capture available' : 'legal move') : '',
            isCheck ? 'in check' : '',
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={square}
              type="button"
              className={[
                'square',
                isLight ? 'square--light' : 'square--dark',
                isSelected ? 'square--selected' : '',
                isLast ? 'square--last' : '',
                isCheck ? 'square--check' : '',
                isTarget && showLegalMoves ? (piece ? 'square--capture' : 'square--target') : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-square={square}
              aria-label={describe}
              tabIndex={focused === square ? 0 : -1}
              onFocus={() => setFocused(square)}
              onKeyDown={(e) => onKeyDown(e, square)}
              onClick={() => {
                if (suppressClick.current) return;
                activate(square);
              }}
            >
              {showCoordinates && col === 0 && <span className="coord coord--rank">{square[1]}</span>}
              {showCoordinates && row === 7 && <span className="coord coord--file">{square[0]}</span>}
              {piece && (
                <span
                  key={pieceKey}
                  className={`piece${pieceStyle ? ' piece--animating' : ''}${drag?.active && drag.from === square ? ' piece--ghosted' : ''}`}
                  style={pieceStyle}
                >
                  <PieceIcon color={piece.color} type={piece.type} />
                </span>
              )}
            </button>
          );
        })}
        {dragPiece && drag && boardRect && (
          <span
            className="drag-piece"
            style={{
              width: squareSize,
              height: squareSize,
              transform: `translate(${drag.x - boardRect.left - squareSize / 2}px, ${drag.y - boardRect.top - squareSize / 2}px)`,
            }}
            aria-hidden="true"
          >
            <PieceIcon color={dragPiece.color} type={dragPiece.type} />
          </span>
        )}
        {promotion && (
          <PromotionDialog
            color={promotion.color}
            onSelect={(piece) => {
              const p = promotion;
              setPromotion(null);
              droppedByDrag.current = null;
              onMove({ from: p.from, to: p.to, promotion: piece });
            }}
            onCancel={() => setPromotion(null)}
          />
        )}
      </div>
      <p id="board-help" className="sr-only">
        Use the arrow keys to move between squares. Press Enter or Space to pick up a piece and again on a target square to
        move it. Press Escape to cancel. Files run {orientation === 'w' ? FILES.join(' to ') : [...FILES].reverse().join(' to ')}{' '}
        from left to right.
      </p>
    </div>
  );
}
