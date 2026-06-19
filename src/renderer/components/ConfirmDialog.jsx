import { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './ConfirmDialog.css';

const TITLE_ID = 'confirm-dialog-title';

export default function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  useFocusTrap(true, dialogRef);

  return (
    <div className="modal-overlay" onKeyDown={e => e.key === 'Escape' && onCancel()}>
      <div
        ref={dialogRef}
        className="modal-dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <h3 id={TITLE_ID} className="modal-dialog-title">{title}</h3>
        {body && <div className="modal-dialog-body">{body}</div>}
        <div className="modal-dialog-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
