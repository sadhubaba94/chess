import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  /** When false, Escape and backdrop clicks do not close the dialog. */
  dismissible?: boolean;
}

/** Accessible modal built on the native <dialog> element (focus trapping, Escape, top layer). */
export function Modal({ title, onClose, children, actions, wide, dismissible = true }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal--wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onCloseRef.current();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onCloseRef.current();
      }}
    >
      <div className="modal__body">
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        <div className="modal__content">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </dialog>
  );
}

interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
