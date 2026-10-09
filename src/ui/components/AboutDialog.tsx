import { Modal } from './Modal';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About and licences" onClose={onClose} actions={<button type="button" className="btn btn--primary" onClick={onClose}>Close</button>}>
      <p>
        Kingside is a free, local-first chess app. Games are stored only in this browser (localStorage); nothing is sent to a
        server.
      </p>
      <ul className="about-list">
        <li><strong>Rules engine and computer opponent</strong>: original code written for Kingside, MIT licence. No third-party chess engine is bundled.</li>
        <li><strong>Chess pieces</strong>: original SVG artwork drawn for Kingside, MIT licence.</li>
        <li><strong>Sounds</strong>: generated in the browser with the Web Audio API (no audio files).</li>
        <li><strong>Libraries</strong>: React and React DOM (MIT). Fonts are your system fonts.</li>
      </ul>
      <p className="muted">Full notices are in LICENSE and THIRD_PARTY_NOTICES.md in the project repository.</p>
    </Modal>
  );
}
