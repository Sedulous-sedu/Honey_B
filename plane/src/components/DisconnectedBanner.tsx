import type { ConnectionStatus } from '../types';
import { formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  status: ConnectionStatus;
  lastSeenUtc: string;
}

export function DisconnectedBanner({ status, lastSeenUtc }: Props) {
  if (status === 'LIVE') return null;

  const age = ageLabel(lastSeenUtc);

  if (status === 'DELAYED') {
    return (
      <div className="connection-alert-banner delayed">
        <span className="alert-banner-icon">⚠</span>
        <div className="alert-banner-content">
          <div className="alert-banner-title">
            AIR-GROUND DATALINK DELAYED — Updates lagging by {age}
          </div>
          <div className="alert-banner-sub">
            Last ground update received at {formatUtcTime(lastSeenUtc)}. Information shown may not reflect immediate tactical changes.
          </div>
        </div>
      </div>
    );
  }

  // DISCONNECTED
  return (
    <div className="connection-alert-banner disconnected">
      <span className="alert-banner-icon">📡</span>
      <div className="alert-banner-content">
        <div className="alert-banner-title">
          DATALINK CONNECTION LOST — ALL GROUND DATA IS STALE ({age.toUpperCase()})
        </div>
        <div className="alert-banner-sub">
          Last contact with London Control: {formatUtcTime(lastSeenUtc)} · CPDLC link offline · Revert to VHF voice communications immediately (Primary 127.425 MHz)
        </div>
      </div>
      <div className="alert-banner-action">
        <span className="voice-comm-badge">REVERT TO VHF VOICE</span>
      </div>
    </div>
  );
}
