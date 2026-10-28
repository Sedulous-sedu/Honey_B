import { useState } from 'react';
import type {
  ConsolidatedDashboardState,
  PilotResponseType,
} from '../types';
import {
  formatUtcTime,
  ageLabel,
} from '../utils/format';
import { SuggestedReplyModal } from './SuggestedReplyModal';
import { TouchSafeButton } from './TouchSafeButton';

interface Props {
  state: ConsolidatedDashboardState;
  onNavigateToSection: (sectionId: string) => void;
  onSendPilotResponse: (responseType: PilotResponseType, text: string) => Promise<void>;
  activeTab: 'overview' | 'detailed';
  onTabChange: (tab: 'overview' | 'detailed') => void;
}

interface UpdateItem {
  id: string;
  badgeNumber: number;
  badgeColor: 'green' | 'blue' | 'amber' | 'purple' | 'slate' | 'critical';
  title: string;
  timestampUtc: string;
  plainSummary: string;
  statusText: string;
  targetSectionId: string;
  graphicType: 'runway' | 'holding' | 'clock' | 'reroute' | 'warning' | 'nominal';
  graphicValue?: string;
  suggestedReplyText?: string;
  suggestedReplyType: PilotResponseType;
}

export function TabletPilotOverview({
  state,
  onNavigateToSection,
  onSendPilotResponse,
  activeTab,
  onTabChange,
}: Props) {
  const [selectedReplyItem, setSelectedReplyItem] = useState<UpdateItem | null>(null);

  const { aircraft, landingSequence, holding, reroute, conditions, connectionStatus, connectionLastSeenUtc } = state;
  const isDisconnected = connectionStatus === 'DISCONNECTED';
  const isDelayed = connectionStatus === 'DELAYED';
  const ageOfLastUpdate = ageLabel(connectionLastSeenUtc);

  // ── Build Priority-Sorted Updates List Based on Operational Severity ──

  const updateItems: UpdateItem[] = [];

  // Scenario 1: Runway Change / Critical Weather Alert
  const isRunwayChanged = !!conditions.previousRunway && conditions.previousRunway !== conditions.activeRunway;
  if (isRunwayChanged) {
    updateItems.push({
      id: 'update-runway-change',
      badgeNumber: 1,
      badgeColor: 'critical',
      title: 'Runway Change In Progress',
      timestampUtc: conditions.runwayChangedAtUtc ?? conditions.observedAtUtc,
      plainSummary: `Active runway reversed from ${conditions.previousRunway} → ${conditions.activeRunway}. Set ILS to ${conditions.activeRunway} (${conditions.approachType}).`,
      statusText: 'CRITICAL CHANGE',
      targetSectionId: 'arrival-conditions-panel',
      graphicType: 'runway',
      graphicValue: `RWY ${conditions.activeRunway}`,
      suggestedReplyText: `Wilco, acknowledge runway change to ${conditions.activeRunway}.`,
      suggestedReplyType: 'ACKNOWLEDGE',
    });
  }

  // Scenario 2: Active Holding Assigned by ATC
  if (holding.active) {
    const delayMin = holding.predictedDelayMinutes;
    updateItems.push({
      id: 'update-holding',
      badgeNumber: updateItems.length + 1,
      badgeColor: 'blue',
      title: 'Maintain Hold (ATC Instruction)',
      timestampUtc: holding.lastUpdatedUtc,
      plainSummary: `Hold at ${holding.fix ?? 'LAM'}, FL${holding.assignedAltitudeFt ? holding.assignedAltitudeFt / 100 : '150'}, expect further clearance ${formatUtcTime(holding.efcUtc)}. Delay ~${delayMin ?? '—'} min (Estimated - Non-clearance).`,
      statusText: holding.efcUtc ? `EFC ${formatUtcTime(holding.efcUtc)}` : 'ACTIVE HOLD',
      targetSectionId: 'arrival-overview-panel',
      graphicType: 'holding',
      graphicValue: holding.fix ?? 'LAM',
      suggestedReplyText: `Holding at FL${holding.assignedAltitudeFt ? holding.assignedAltitudeFt / 100 : '150'} ${holding.fix ?? 'LAM'}, expect further clearance ${formatUtcTime(holding.efcUtc)}.`,
      suggestedReplyType: 'ACKNOWLEDGE',
    });
  }

  // Scenario 3: Proposed Tactical Reroute
  if (reroute && (reroute.status === 'PROPOSED' || reroute.status === 'AWAITING_RESPONSE' || reroute.status === 'ACCEPTED_BY_PILOT')) {
    updateItems.push({
      id: 'update-reroute',
      badgeNumber: updateItems.length + 1,
      badgeColor: 'purple',
      title: 'Proposed Tactical Reroute',
      timestampUtc: reroute.proposedAtUtc,
      plainSummary: `ATC proposes reroute via ${reroute.routeDiff} (+${reroute.estimatedTimeImpactMin} min). Operative route remains cleared route until ATC formal clearance.`,
      statusText: reroute.status === 'ACCEPTED_BY_PILOT' ? 'ACCEPTED (ADVISORY)' : 'PROPOSED (ADVISORY)',
      targetSectionId: 'reroute-panel',
      graphicType: 'reroute',
      graphicValue: `+${reroute.estimatedTimeImpactMin}m`,
      suggestedReplyText: reroute.status === 'ACCEPTED_BY_PILOT'
        ? 'Advisory intent already sent. Awaiting formal clearance.'
        : `Wilco, ready for proposed reroute via BIG DCT EGLL if cleared.`,
      suggestedReplyType: 'ACKNOWLEDGE',
    });
  }

  // Scenario 4: Landing Sequence (Standard)
  if (!isRunwayChanged) {
    updateItems.push({
      id: 'update-sequence',
      badgeNumber: updateItems.length + 1,
      badgeColor: 'green',
      title: 'Landing Sequence',
      timestampUtc: landingSequence.lastUpdatedUtc,
      plainSummary: `You are number ${landingSequence.sequenceNumber} in sequence for landing Runway ${landingSequence.assignedRunway ?? '27R'}${landingSequence.status === 'ESTIMATED' ? ' (Estimated)' : ' (Confirmed)'}.`,
      statusText: `#${landingSequence.sequenceNumber} OF ${landingSequence.totalInSequence}`,
      targetSectionId: 'arrival-overview-panel',
      graphicType: 'runway',
      graphicValue: `RWY ${landingSequence.assignedRunway ?? '27R'}`,
      suggestedReplyText: `Wilco, number ${landingSequence.sequenceNumber} for ${landingSequence.assignedRunway ?? '27R'}.`,
      suggestedReplyType: 'ACKNOWLEDGE',
    });
  }

  // Scenario 5: ETA Update / Target Landing Time
  updateItems.push({
    id: 'update-eta',
    badgeNumber: updateItems.length + 1,
    badgeColor: 'amber',
    title: 'ETA & Target Landing Time',
    timestampUtc: landingSequence.lastUpdatedUtc,
    plainSummary: `Expected landing time ${formatUtcTime(landingSequence.targetLandingTimeUtc)} (+${landingSequence.delayMinutes} min delay). Aircraft FMS autonomous ETA: ${formatUtcTime(aircraft.fmsEtaUtc)}.`,
    statusText: `${formatUtcTime(landingSequence.targetLandingTimeUtc)} (+${landingSequence.delayMinutes}m)`,
    targetSectionId: 'arrival-overview-panel',
    graphicType: 'clock',
    graphicValue: formatUtcTime(landingSequence.targetLandingTimeUtc),
    suggestedReplyText: `Copy, target landing time ${formatUtcTime(landingSequence.targetLandingTimeUtc)}.`,
    suggestedReplyType: 'ACKNOWLEDGE',
  });

  // Scenario 6: Disconnected Alert or Urgent Operational Notice
  if (isDisconnected) {
    updateItems.unshift({
      id: 'update-disconnected-top',
      badgeNumber: 0,
      badgeColor: 'critical',
      title: 'Datalink Connection Lost',
      timestampUtc: connectionLastSeenUtc,
      plainSummary: `Ground datalink dropped ${ageOfLastUpdate}. All ground information below is STALE. Revert to primary VHF voice 127.425 MHz.`,
      statusText: 'LINK LOST',
      targetSectionId: 'operational-notices-panel',
      graphicType: 'warning',
      suggestedReplyText: 'Switching to primary VHF voice frequency 127.425 MHz.',
      suggestedReplyType: 'ACKNOWLEDGE',
    });
  } else if (!holding.active && !isRunwayChanged && updateItems.length < 5) {
    // Approach conditions summary item
    updateItems.push({
      id: 'update-approach-status',
      badgeNumber: updateItems.length + 1,
      badgeColor: 'slate',
      title: 'Airport & Approach Status',
      timestampUtc: conditions.observedAtUtc,
      plainSummary: `${conditions.airportIcao} Runway ${conditions.activeRunway} in use (${conditions.approachType}). Wind ${conditions.windDirectionDeg}°/${conditions.windSpeedKts}KT, Vis ${conditions.visibilityMeters}m, QNH ${conditions.qnhHpa} hPa.`,
      statusText: 'APPROACH NOMINAL',
      targetSectionId: 'arrival-conditions-panel',
      graphicType: 'nominal',
      suggestedReplyText: `Copy ATIS ${conditions.source}, configured for ${conditions.approachType}.`,
      suggestedReplyType: 'ACKNOWLEDGE',
    });
  }

  // Slice to max 5 items for a clean, non-scrolling single-glance tablet interface
  const displayItems = updateItems.slice(0, 5);

  // ── Bottom Four At-A-Glance Values ──

  // 1. Fuel
  const fobKg = aircraft.fuel.fuelOnBoardKg;
  const fobTonnes = fobKg !== undefined ? (fobKg / 1000).toFixed(1) : undefined;
  const enduranceMin = aircraft.fuel.holdingEnduranceMinutes ?? 52;
  const enduranceHrs = Math.floor(enduranceMin / 60);
  const enduranceRemMin = enduranceMin % 60;
  const enduranceStr = enduranceHrs > 0 ? `~ ${enduranceHrs}h ${enduranceRemMin}m` : `~ ${enduranceMin}m`;

  // 2. ETA
  const currentEtaStr = formatUtcTime(landingSequence.targetLandingTimeUtc);
  const etaDelayStr = landingSequence.delayMinutes > 0 ? `+${landingSequence.delayMinutes} min` : 'On schedule';

  // 3. Runway
  const runwayStr = conditions.activeRunway;
  const approachStr = conditions.approachType.includes('CAT II') ? 'CAT II ILS' : 'ILS';

  // 4. Priority
  const priorityStr = isRunwayChanged
    ? 'CRITICAL WX'
    : holding.active
    ? `#${landingSequence.sequenceNumber} High Delay`
    : `#${landingSequence.sequenceNumber} Normal`;
  const prioritySub = isDisconnected
    ? 'Datalink Lost'
    : `Seq #${landingSequence.sequenceNumber} of ${landingSequence.totalInSequence}`;

  return (
    <section className="tablet-overview-section" id="pilot-tablet-overview" aria-label="Pilot Overview">
      {/* ── 1. Compact Header ── */}
      <header className="tablet-header">
        <div className="tablet-header-left">
          {/* Honey B Logo with Bee Icon */}
          <div className="honey-b-brand">
            <div className="bee-logo-badge" aria-hidden="true">
              {/* Golden vector bee icon */}
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" fill="#F59E0B" />
                <path d="M16 6C11 6 8 10 8 16C8 22 11 26 16 26C21 26 24 22 24 16C24 10 21 6 16 6Z" fill="#FBBF24" />
                <line x1="9" y1="13" x2="23" y2="13" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="9" y1="19" x2="23" y2="19" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
                <ellipse cx="6" cy="11" rx="4" ry="2.5" transform="rotate(-30 6 11)" fill="#E0F2FE" opacity="0.85" />
                <ellipse cx="26" cy="11" rx="4" ry="2.5" transform="rotate(30 26 11)" fill="#E0F2FE" opacity="0.85" />
                <circle cx="13" cy="9" r="1" fill="#0F172A" />
                <circle cx="19" cy="9" r="1" fill="#0F172A" />
              </svg>
            </div>
            <div>
              <div className="honey-b-title">Honey B</div>
              <div className="honey-b-sub">ATC Decision Support</div>
            </div>
          </div>

          <div className="tablet-flight-chip">
            <span className="chip-flight-id">{aircraft.flightId}</span>
            <span className="chip-flight-route">{aircraft.originIcao} → {aircraft.destinationIcao}</span>
          </div>
        </div>

        {/* View Switcher Tabs (Matches Screenshot) */}
        <nav className="tablet-header-tabs" aria-label="Overview View Modes">
          <button
            className={`tab-pill-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => onTabChange('overview')}
          >
            ATC COMMANDS
          </button>
          <button
            className={`tab-pill-btn ${activeTab === 'detailed' ? 'active' : ''}`}
            onClick={() => onTabChange('detailed')}
          >
            FLIGHT STATUS (DETAILED)
          </button>
        </nav>

        {/* Connection & Station Info */}
        <div className="tablet-header-right">
          <div className="datalink-status-row">
            <span className={`datalink-icon ${connectionStatus.toLowerCase()}`}>
              {/* Antenna / Radio wave icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
              </svg>
            </span>
            <span className={`datalink-text ${connectionStatus.toLowerCase()}`}>
              {connectionStatus === 'LIVE' ? 'Connected' : connectionStatus === 'DELAYED' ? 'Delayed' : 'Disconnected'}
            </span>
          </div>
          <div className="datalink-station-text">
            {isDisconnected ? (
              <span className="stale-warning-highlight">Last update {ageOfLastUpdate}</span>
            ) : isDelayed ? (
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>Lagging ({ageOfLastUpdate})</span>
            ) : (
              <span>EGLL Approach · Recv {formatUtcTime(connectionLastSeenUtc)}</span>
            )}
          </div>
        </div>
      </header>

      {/* ── 2. Priority-Sorted List of Most Relevant Ground Updates ── */}
      <div className="tablet-updates-list" role="feed" aria-label="Priority Ground Updates">
        {displayItems.map((item, idx) => (
          <article
            key={item.id}
            className={`tablet-update-card badge-${item.badgeColor}`}
            onClick={() => onNavigateToSection(item.targetSectionId)}
            tabIndex={0}
            role="button"
            aria-label={`Update ${item.badgeNumber}: ${item.title}`}
          >
            {/* Numbered Badge */}
            <div className={`update-badge-number num-${item.badgeColor}`}>
              {item.badgeNumber === 0 ? '!' : item.badgeNumber || idx + 1}
            </div>

            {/* Update Content */}
            <div className="update-body">
              <div className="update-title-row">
                <div className="update-title-group">
                  <h3 className="update-title">{item.title}</h3>
                  <span className="update-status-pill">{item.statusText}</span>
                </div>
                <time className="update-timestamp" dateTime={item.timestampUtc}>
                  {formatUtcTime(item.timestampUtc)}
                </time>
              </div>

              <p className="update-summary">{item.plainSummary}</p>

              {/* Secondary Suggested Reply Pill Button */}
              {item.suggestedReplyText && (
                <div className="suggested-reply-wrap" onClick={(e) => e.stopPropagation()}>
                  <TouchSafeButton
                    actionId={`reply-chip-${item.id}`}
                    variant="ghost"
                    className="suggested-reply-btn touch-safe-reply-btn"
                    onDeliberateClick={() => {
                      setSelectedReplyItem(item);
                    }}
                    title="Review suggested reply before transmitting"
                  >
                    <span className="reply-broadcast-icon">
                      {/* Broadcast waves icon */}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="2" fill="currentColor" />
                        <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                      </svg>
                    </span>
                    <span className="reply-text">"{item.suggestedReplyText}"</span>
                    <span className="reply-arrow">›</span>
                  </TouchSafeButton>
                </div>
              )}
            </div>

            {/* Graphical Diagram Cue on Right Side */}
            <div className="update-graphic-zone" aria-hidden="true">
              {item.graphicType === 'runway' && (
                <div className="mini-graphic-runway">
                  <div className="rwy-label">{item.graphicValue ?? '27R'}</div>
                  <div className="rwy-line-track">
                    <div className="rwy-centerline" />
                  </div>
                </div>
              )}

              {item.graphicType === 'holding' && (
                <div className="mini-graphic-holding">
                  {/* Racetrack holding oval diagram */}
                  <svg width="48" height="24" viewBox="0 0 60 30" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="5" y="5" width="50" height="20" rx="10" stroke="#00D4FF" fill="none" />
                    <polygon points="35,3 42,5 35,7" fill="#00D4FF" />
                  </svg>
                </div>
              )}

              {item.graphicType === 'reroute' && (
                <div className="mini-graphic-reroute">
                  {/* Diverging curved arrow */}
                  <svg width="40" height="28" viewBox="0 0 40 30" fill="none" stroke="#A855F7" strokeWidth="2.5">
                    <path d="M5 25 L18 25 C25 25 28 12 35 10" />
                    <polyline points="29 6 36 10 32 17" fill="none" />
                  </svg>
                </div>
              )}

              {item.graphicType === 'clock' && (
                <div className="mini-graphic-clock">
                  <span className="clock-glyph">⏱</span>
                  <span className="clock-val">{item.graphicValue}</span>
                </div>
              )}

              {item.graphicType === 'warning' && (
                <div className="mini-graphic-warning">
                  <span className="warn-glyph">⚠</span>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* ── 3. Persistent Bottom Strip (Four At-A-Glance Values) ── */}
      <footer className="tablet-bottom-strip" role="region" aria-label="At-a-glance Cockpit Strip">
        {/* Tile 1: Fuel */}
        <div
          className="bottom-strip-tile fuel-tile"
          onClick={() => onNavigateToSection('fuel-delay-panel')}
          tabIndex={0}
          role="button"
          aria-label="Fuel details"
        >
          <div className="tile-icon-col">
            {/* Gas pump SVG */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 22h12M4 9h10M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18" />
              <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
            </svg>
          </div>
          <div className="tile-content-col">
            <span className="tile-label">FUEL</span>
            <span className="tile-value highlight-fuel">
              {fobTonnes ? `${fobTonnes} T` : 'UNAVAIL'}
            </span>
            <span className="tile-subtext">{enduranceStr}</span>
            {/* Mini fuel level bar */}
            <div className="tile-progress-bar">
              <div
                className="tile-progress-fill"
                style={{
                  width: fobTonnes ? `${Math.min(100, Math.max(15, (Number(fobTonnes) / 18) * 100))}%` : '0%',
                  background: enduranceMin < 30 ? 'var(--color-critical)' : 'var(--color-live)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Tile 2: ETA (EGLL) */}
        <div
          className="bottom-strip-tile eta-tile"
          onClick={() => onNavigateToSection('arrival-overview-panel')}
          tabIndex={0}
          role="button"
          aria-label="ETA details"
        >
          <div className="tile-icon-col">
            {/* Clock SVG */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="tile-content-col">
            <span className="tile-label">ETA ({aircraft.destinationIcao})</span>
            <span className="tile-value">{currentEtaStr}</span>
            <span className="tile-subtext highlight-delay">{etaDelayStr}</span>
          </div>
        </div>

        {/* Tile 3: Runway */}
        <div
          className={`bottom-strip-tile runway-tile ${isRunwayChanged ? 'runway-changed' : ''}`}
          onClick={() => onNavigateToSection('arrival-conditions-panel')}
          tabIndex={0}
          role="button"
          aria-label="Runway details"
        >
          <div className="tile-icon-col">
            {/* Runway perspective SVG with centerline */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 22 9 2 15 2 19 22 5 22" stroke="currentColor" fill="none" />
              <line x1="12" y1="5" x2="12" y2="8" strokeWidth="2" strokeDasharray="2 2" />
              <line x1="12" y1="12" x2="12" y2="15" strokeWidth="2" strokeDasharray="2 2" />
              <line x1="12" y1="18" x2="12" y2="21" strokeWidth="2" strokeDasharray="2 2" />
            </svg>
          </div>
          <div className="tile-content-col">
            <span className="tile-label">RUNWAY</span>
            <span className="tile-value highlight-cyan">{runwayStr}</span>
            <span className="tile-subtext">{approachStr}</span>
          </div>
        </div>

        {/* Tile 4: Priority */}
        <div
          className="bottom-strip-tile priority-tile"
          onClick={() => onNavigateToSection('arrival-overview-panel')}
          tabIndex={0}
          role="button"
          aria-label="Sequence priority details"
        >
          <div className="tile-icon-col">
            {/* Double chevron SVG */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="17 11 12 6 7 11" />
              <polyline points="17 18 12 13 7 18" />
            </svg>
          </div>
          <div className="tile-content-col">
            <span className="tile-label">PRIORITY</span>
            <span className="tile-value" style={{ fontSize: '1.15rem' }}>{priorityStr}</span>
            <span className="tile-subtext">{prioritySub}</span>
          </div>
        </div>
      </footer>

      {/* Suggested Reply Review & Explicit Dispatch Modal */}
      {selectedReplyItem && (
        <SuggestedReplyModal
          isOpen={!!selectedReplyItem}
          onClose={() => setSelectedReplyItem(null)}
          onSend={async (type, text) => {
            await onSendPilotResponse(type, text);
          }}
          updateTitle={selectedReplyItem.title}
          defaultText={selectedReplyItem.suggestedReplyText ?? ''}
          responseType={selectedReplyItem.suggestedReplyType}
        />
      )}
    </section>
  );
}
