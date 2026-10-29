import { useState } from 'react';
import type { DashboardMessage, PilotResponseType } from '../types';
import { formatUtcTime } from '../utils/format';
import { sendPilotResponse } from '../api/mockApi';

interface Props {
  messages: DashboardMessage[];
  flightId: string;
  onMessagesUpdate: (msgs: DashboardMessage[]) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  ATC: 'ATC',
  PILOT: 'PILOT',
  SYSTEM: 'SYSTEM',
};

export function MessagesPanel({ messages, flightId, onMessagesUpdate }: Props) {
  const [sending, setSending] = useState<string | null>(null);

  const unreadCount = messages.filter((m) => m.status === 'UNREAD').length;

  const handleResponse = async (msg: DashboardMessage, responseType: PilotResponseType, note?: string) => {
    setSending(msg.id + responseType);
    try {
      await sendPilotResponse({
        messageId: msg.id,
        flightId,
        responseType,
        note,
        timestampUtc: new Date().toISOString(),
      });
      // Update local message state
      const updated = messages.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              status: 'ACKNOWLEDGED' as const,
              acknowledgedAtUtc: new Date().toISOString(),
              pilotResponse: responseType,
              pilotResponseAtUtc: new Date().toISOString(),
              pilotResponseNote: note,
            }
          : m
      );
      onMessagesUpdate(updated);
    } finally {
      setSending(null);
    }
  };

  const sortedMsgs = [...messages].sort(
    (a, b) => new Date(b.timestampUtc).getTime() - new Date(a.timestampUtc).getTime()
  );

  return (
    <div className="card messages-panel">
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">💬</span>
          Messages
        </div>
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
      </div>

      <div className="messages-list">
        {sortedMsgs.map((msg) => (
          <div
            key={msg.id}
            className={`message-item ${msg.source.toLowerCase()} ${msg.status === 'UNREAD' ? 'unread' : ''}`}
          >
            <div className="message-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`message-source-badge ${msg.source.toLowerCase()}`}>
                  {SOURCE_LABELS[msg.source]}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-data)' }}>
                  #{msg.id}
                </span>
              </div>
              <span className="message-time">{formatUtcTime(msg.timestampUtc)}</span>
            </div>

            <div className="message-subject">{msg.subject}</div>
            <div className="message-body">{msg.body}</div>

            {/* Response row */}
            {msg.status !== 'ACKNOWLEDGED' && msg.requiresAck && msg.source !== 'PILOT' && (
              <div className="message-ack-row">
                <div className="response-btn-group">
                  <button
                    className="response-btn ack"
                    disabled={!!sending}
                    onClick={() => handleResponse(msg, 'ACKNOWLEDGE')}
                  >
                    {sending === msg.id + 'ACKNOWLEDGE' ? '…' : '✓ Acknowledge'}
                  </button>
                  <button
                    className="response-btn unable"
                    disabled={!!sending}
                    onClick={() => handleResponse(msg, 'UNABLE')}
                  >
                    {sending === msg.id + 'UNABLE' ? '…' : '✕ Unable'}
                  </button>
                  <button
                    className="response-btn clarify"
                    disabled={!!sending}
                    onClick={() => handleResponse(msg, 'REQUEST_CLARIFICATION')}
                  >
                    ? Clarify
                  </button>
                  <button
                    className="response-btn fuel"
                    disabled={!!sending}
                    onClick={() => handleResponse(msg, 'FUEL_CONCERN')}
                  >
                    ⛽ Fuel
                  </button>
                </div>
              </div>
            )}

            {/* Acknowledged state */}
            {msg.status === 'ACKNOWLEDGED' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--border-subtle)',
              }}>
                <span className="message-ack-status">
                  ✓ {msg.pilotResponse?.replace(/_/g, ' ') ?? 'Acknowledged'}
                  {msg.acknowledgedAtUtc && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                      · {formatUtcTime(msg.acknowledgedAtUtc)}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Pilot-sent message info */}
            {msg.source === 'PILOT' && msg.pilotResponse && (
              <div style={{
                marginTop: 8,
                padding: '4px 8px',
                background: 'rgba(34,197,94,0.06)',
                borderRadius: 4,
                fontSize: '0.7rem',
                color: 'var(--color-live)',
              }}>
                Sent: {msg.pilotResponse.replace(/_/g, ' ')} · {formatUtcTime(msg.pilotResponseAtUtc)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Message ID footer */}
      <div style={{
        marginTop: 'var(--space-sm)',
        paddingTop: 'var(--space-sm)',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.62rem',
        color: 'var(--text-muted)',
        lineHeight: 1.4,
      }}>
        Each message carries: ID · Flight ID · Source · Timestamp UTC · Status · Ack state
        <br />
        <span style={{ color: 'var(--color-primary-dim)' }}>
          Integration: pilot responses sent to POST /api/pilot-response
        </span>
      </div>
    </div>
  );
}
