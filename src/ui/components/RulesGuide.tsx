export function RulesGuide() {
  return (
    <div className="rules">
      <section>
        <h3>The basics</h3>
        <p>
          White moves first and players alternate. The goal is <strong>checkmate</strong>: the opponent's king is attacked
          (in check) and has no legal way to escape. You may never make a move that leaves your own king in check.
        </p>
        <ul>
          <li><strong>King</strong>: one square in any direction.</li>
          <li><strong>Queen</strong>: any distance along ranks, files and diagonals.</li>
          <li><strong>Rook</strong>: any distance along ranks and files.</li>
          <li><strong>Bishop</strong>: any distance diagonally.</li>
          <li><strong>Knight</strong>: an L-shape (two squares then one sideways), jumping over pieces.</li>
          <li><strong>Pawn</strong>: forward one square (two from its starting square), captures one square diagonally forward.</li>
        </ul>
      </section>
      <section>
        <h3>Special moves</h3>
        <ul>
          <li>
            <strong>Castling</strong>: king moves two squares toward a rook, which jumps to the other side. Not allowed if
            either piece has moved, squares between them are occupied, or the king is in check, passes through or lands on an
            attacked square.
          </li>
          <li>
            <strong>En passant</strong>: if a pawn advances two squares and lands beside an enemy pawn, that pawn may capture
            it as if it had moved one square, but only on the very next move.
          </li>
          <li>
            <strong>Promotion</strong>: a pawn reaching the last rank becomes a queen, rook, bishop or knight of your choice.
          </li>
        </ul>
      </section>
      <section>
        <h3>How games end</h3>
        <ul>
          <li><strong>Checkmate</strong> wins. <strong>Stalemate</strong> (no legal move, not in check) is a draw.</li>
          <li><strong>Automatic draws</strong>: insufficient material, fivefold repetition, 75 moves each without a capture or pawn move (unless the last move gave checkmate).</li>
          <li><strong>Claimable draws</strong>: use <em>Claim draw</em> when the current position has occurred three times, or after 50 moves each without a capture or pawn move.</li>
          <li><strong>Time</strong>: if your clock runs out you lose, unless your opponent cannot possibly checkmate, in which case it is a draw.</li>
          <li><strong>Resignation</strong> and <strong>draw by agreement</strong> (offers are available in two-player mode).</li>
        </ul>
      </section>
      <section>
        <h3>Using the board</h3>
        <p>
          Click or tap a piece, then a highlighted square, or drag the piece. With a keyboard, use the arrow keys to move
          between squares and Enter or Space to select and move.
        </p>
      </section>
    </div>
  );
}
