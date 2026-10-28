import { useState } from 'react';
import type { PilotResponseType } from '../types';
import { TouchSafeButton } from './TouchSafeButton';
import { PressAndHoldButton } from './PressAndHoldButton';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSend: (responseType: PilotResponseType, text: string) => Promise<void>;
  updateTitle: string;
  defaultText: string;
  responseType: PilotResponseType;
  referencedMessageId?: string;
}

export function SuggestedReplyModal({
  isOpen,
  onClose,
  onSend,
  updateTitle,
  defaultText,
  responseType,
  referencedMessageId,
}: Props) {
  const [editedText, setEditedText] = useState(defaultText);
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    setIsSending(true);
    try {
      await onSend(responseType, editedText);
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">📡</span>
            <div>
              <div className="modal-title">Review Suggested Pilot Reply</div>
              <div className="modal-subtitle">Ref: {updateTitle} {referencedMessageId ? `(#${referencedMessageId})` : ''}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">✕</button>
        </div>

        {/* Safety Disclaimer Banner */}
        <div className="modal-safety-banner">
          <span className="safety-warning-icon">⚠</span>
          <div>
            <strong>PILOT TRANSMISSION REVIEW REQUIRED</strong>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Suggested replies are advisory only. Transmitting does not constitute an air traffic clearance. Never alter route or clearance without official ATC approval.
            </div>
          </div>
        </div>

        {/* Transmission Editor */}
        <div className="modal-body">
          <label className="data-label" style={{ marginBottom: 6, display: 'block' }}>
            Transmission Content (Advisory Response to Ground Control)
          </label>
          <textarea
            className="modal-textarea"
            rows={3}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            placeholder="Review transmission text..."
          />

          <div className="modal-meta-row">
            <span className="data-label">Response Type:</span>
            <span className="modal-badge-type">{responseType.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Modal Actions with Touch Safety Separation & Inactive Cushion */}
        <div className="modal-footer touch-safe-modal-footer">
          <div className="modal-actions-spaced">
            {/* Cancel / Abort: Large touch target, deliberate tap, safe cushion */}
            <div className="modal-action-col">
              <TouchSafeButton
                actionId="modal-cancel-btn"
                variant="ghost"
                className="modal-touch-btn cancel"
                onDeliberateClick={onClose}
                disabled={isSending}
              >
                ✕ Cancel (Do Not Send)
              </TouchSafeButton>
              <div className="modal-action-subnote">No transmission will be made</div>
            </div>

            {/* Inactive physical buffer to prevent fat-finger or turbulence accidents */}
            <div className="touch-safety-buffer-zone vertical" aria-hidden="true">
              <span className="buffer-divider-line" />
              <span className="buffer-label">CUSHION</span>
              <span className="buffer-divider-line" />
            </div>

            {/* Consequential action: Press and Hold 1.0s */}
            <div className="modal-action-col">
              <PressAndHoldButton
                actionId={`modal-transmit-${referencedMessageId ?? 'adhoc'}`}
                label={isSending ? 'Transmitting…' : '✈ Transmit Reply to Ground'}
                sublabel="Hold 1.0s to confirm transmission"
                variant="accept"
                disabled={isSending}
                messageIntegrityKey={`${updateTitle}-${defaultText}`}
                onConfirmed={handleSend}
              />
              <div className="modal-action-subnote">Downlinks advisory response only</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
