import type { ConnectionStatus } from '../types';
import { formatUtcTime, ageLabel } from '../utils/format';

interface Props {
  status: ConnectionStatus;
  lastSeenUtc: string;
}

const ICONS: Record<ConnectionStatus, string> = {
  LIVE: '●',
  DELAYED: '◑',
  DISCONNECTED: '✕',
};

const LABELS: Record<ConnectionStatus, string> = {
  LIVE: 'LIVE LINK',
  DELAYED: 'DELAYED LINK',
  DISCONNECTED: 'NO LINK',
};

export function ConnectionBadge({ status, lastSeenUtc }: Props) {
  const cls = status.toLowerCase();
  const age = ageLabel(lastSeenUtc);

  return (
    <div
      className={`connection-badge ${cls}`}
      title={`Ground link last contact: ${formatUtcTime(lastSeenUtc)} (${age})`}
    >
      <span className="connection-icon">{ICONS[status]}</span>
      <span className="connection-text">{LABELS[status]}</span>
      {status !== 'LIVE' && (
        <span className="connection-age">· {age}</span>
      )}
    </div>
  );
}
