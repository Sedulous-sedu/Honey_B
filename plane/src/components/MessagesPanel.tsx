import { useState } from 'react';
import type { GroundMessage, PilotResponseType } from '../types';
import { formatUtcTime } from '../utils/format';
import { activeDataLinkAdapter } from '../services/dataLinkAdapter';
import { TouchSafeButton } from './TouchSafeButton';

interface Props {
  messages: GroundMessage[];
  flightId: string;
}

export function MessagesPanel({ messages, flightId }: Props) {
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState<string>('');
  const [sending, setSending] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const unreadCount = messages.filter((m) => m.status === 'UNREAD').length;

  const handleSendResponse = async (msg: GroundMessage, responseType: PilotResponseType, note?: string) => {
    setSending(msg.id + responseType);
    try {
      const res = await activeDataLinkAdapter.sendPilotResponse({
        referencedMessageId: msg.id,
        flightId,
        responseType,
        pilotNotes: note || undefined,
        timestampUtc: new Date().toISOString(),
      });

      if (res.success) {
        setFeedbackNotice(`✓ Outgoing transmission ${res.transmissionId} sent: ${responseType.replace(/_/g, ' ')}`);
        setActiveMsgId(null);
        setCustomNote('');
        setTimeout(() => setFeedbackNotice(null), 4000);
      }
    } finally {
      setSending(null);
    }
  };

  const sortedMsgs = [...messages].sort(
    (a, b) => new Date(b.timestampUtc).getTime() - new Date(a.timestampUtc).getTime()
  );

  return (
    <div className="card messages-panel" id="ground-messages-panel">
      {/* Header */}
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">💬</span>
          <span>Air-Ground Datalink Comms (CPDLC / AMAN)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {unreadCount > 0 && (
            <span className="card-badge" style={{
              color: 'var(--color-primary)',
              background: 'var(--color-primary-glow)',
              border: '1px solid var(--border-active)',
              animation: 'awaiting-pulse 1.5s ease-in-out infinite',
            }}>
              {unreadCount} UNREAD
            </span>
          )}
          <div className="source-tag source-ground">
            <span className="source-dot" />
            <span>TWO-WAY DATALINK</span>
          </div>
        </div>
      </div>

      <div className="card-subhead">
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          Pilot Responses: Acknowledge · Unable · Request Clarification · Fuel Concern
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--color-primary)' }}>
          Flight: {flightId}
        </span>
      </div>

      {feedbackNotice && (
        <div className="transmission-alert">
          {feedbackNotice}
        </div>
      )}

      {/* Message List */}
      <div className="messages-list">
        {sortedMsgs.map((msg) => (
          <div
            key={msg.id}
            className={`message-item ${msg.source.toLowerCase()} ${msg.status === 'UNREAD' ? 'unread' : ''}`}
          >
            <div className="message-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`message-source-badge ${msg.source.toLowerCase()}`}>
                  {msg.source}
                </span>
                <span className="message-id-tag">
                  #{msg.id}
                </span>
              </div>
              <span className="message-time">{formatUtcTime(msg.timestampUtc)}</span>
            </div>

            <div className="message-subject">{msg.subject}</div>
            <div className="message-body">{msg.body}</div>

            {/* Pilot Actions with Cockpit Touch Safety Separation */}
            {msg.status !== 'ACKNOWLEDGED' && msg.requiresAck && msg.source !== 'PILOT' && (
              <div className="message-ack-row touch-safe-ack-zone">
                <div className="response-btn-group touch-safe-btn-group">
                  <TouchSafeButton
                    actionId={`msg-ack-${msg.id}`}
                    variant="ack"
                    className="response-btn ack"
                    disabled={!!sending}
                    onDeliberateClick={() => handleSendResponse(msg, 'ACKNOWLEDGE')}
                    title="Acknowledge message receipt and instructions"
                  >
                    {sending === msg.id + 'ACKNOWLEDGE' ? '…' : '✓ Acknowledge'}
                  </TouchSafeButton>

                  <div className="touch-safety-small-buffer" aria-hidden="true" />

                  <TouchSafeButton
                    actionId={`msg-unable-${msg.id}`}
                    variant="unable"
                    className="response-btn unable"
                    disabled={!!sending}
                    onDeliberateClick={() => handleSendResponse(msg, 'UNABLE')}
                    title="Send Unable advisory to Ground Control"
                  >
                    {sending === msg.id + 'UNABLE' ? '…' : '✕ Unable'}
                  </TouchSafeButton>

                  <div className="touch-safety-small-buffer" aria-hidden="true" />

                  <TouchSafeButton
                    actionId={`msg-clarify-${msg.id}`}
                    variant="secondary"
                    className="response-btn clarify"
                    disabled={!!sending}
                    onDeliberateClick={() => {
                      if (activeMsgId === msg.id) {
                        handleSendResponse(msg, 'REQUEST_CLARIFICATION', customNote);
                      } else {
                        setActiveMsgId(msg.id);
                      }
                    }}
                    title="Send Request for Clarification to Ground Control"
                  >
                    ? Clarify
                  </TouchSafeButton>

                  <TouchSafeButton
                    actionId={`msg-fuel-${msg.id}`}
                    variant="secondary"
                    className="response-btn fuel"
                    disabled={!!sending}
                    onDeliberateClick={() => {
                      if (activeMsgId === msg.id) {
                        handleSendResponse(msg, 'FUEL_CONCERN', customNote);
                      } else {
                        setActiveMsgId(msg.id);
                      }
                    }}
                    title="Flag Fuel Concern advisory to Ground Control"
                  >
                    ⛽ Fuel Concern
                  </TouchSafeButton>
                </div>

                {/* Optional Note Expander */}
                {activeMsgId === msg.id && (
                  <div className="custom-note-input-container">
                    <input
                      type="text"
                      className="pilot-remark-input"
                      placeholder="Type optional remarks for ATC (e.g. 'Holding fuel limited to 30 min')..."
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        className="quick-send-btn clarify"
                        onClick={() => handleSendResponse(msg, 'REQUEST_CLARIFICATION', customNote)}
                      >
                        Send "Request Clarification" with note
                      </button>
                      <button
                        className="quick-send-btn fuel"
                        onClick={() => handleSendResponse(msg, 'FUEL_CONCERN', customNote)}
                      >
                        Send "Fuel Concern" with note
                      </button>
                      <button
                        className="quick-cancel-btn"
                        onClick={() => {
                          setActiveMsgId(null);
                          setCustomNote('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Acknowledged / Responded Banner */}
            {msg.status === 'ACKNOWLEDGED' && msg.source !== 'PILOT' && (
              <div className="message-ack-status-bar">
                <span className="ack-check-icon">✓</span>
                <span className="ack-label">
                  Downlinked: <strong>{msg.pilotResponse?.replace(/_/g, ' ') ?? 'ACKNOWLEDGED'}</strong>
                </span>
                {msg.pilotResponseAtUtc && (
                  <span className="ack-timestamp">
                    at {formatUtcTime(msg.pilotResponseAtUtc)}
                  </span>
                )}
                {msg.pilotResponseNote && (
                  <span className="ack-note">· Note: "{msg.pilotResponseNote}"</span>
                )}
              </div>
            )}

            {/* Pilot-Originated Outbound Transmission Box */}
            {msg.source === 'PILOT' && (
              <div className="pilot-outbound-stamp">
                ✓ Transmitted Downlink to Ground Control · Timestamp: {formatUtcTime(msg.timestampUtc)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Datalink Protocol Specification */}
      <div className="messages-footer-info">
        <span>Protocol: Honey B Air-Ground Datalink v1.0.0</span>
        <span>Standard Pilot Responses: ACKNOWLEDGE | UNABLE | REQUEST_CLARIFICATION | FUEL_CONCERN</span>
      </div>
    </div>
  );
}
