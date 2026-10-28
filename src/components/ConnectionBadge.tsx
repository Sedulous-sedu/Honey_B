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
  LIVE: 'LIVE',
  DELAYED: 'DELAYED',
  DISCONNECTED: 'NO LINK',
};

export function ConnectionBadge({ status, lastSeenUtc }: Props) {
  const cls = status.toLowerCase();
  const age = ageLabel(lastSeenUtc);

  return (
    <div
      className={`connection-badge ${cls}`}
      title={`Last data: ${formatUtcTime(lastSeenUtc)} (${age})`}
    >
      <span className="connection-dot" />
      <span>{LABELS[status]}</span>
      {status !== 'LIVE' && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>· {age}</span>
      )}
    </div>
  );
}
