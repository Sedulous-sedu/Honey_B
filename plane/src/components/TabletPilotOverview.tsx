import { useState } from 'react';
import type {
  ConsolidatedDashboardState,
  PilotResponseType,
} from '../types';
import {
  formatUtcTime,
  ageLabel,
} from '../utils/format';
import { activeDataLinkAdapter } from '../services/dataLinkAdapter';
import { TouchSafeButton } from './TouchSafeButton';
import { PressAndHoldButton } from './PressAndHoldButton';

interface Props {
  state: ConsolidatedDashboardState;
  onSendPilotResponse: (responseType: PilotResponseType, text: string) => Promise<void>;
  onOpenUpdates: () => void;
  onOpenFlightStatus: () => void;
}

export function TabletPilotOverview({
  state,
  onSendPilotResponse,
  onOpenUpdates,
  onOpenFlightStatus,
}: Props) {
  const { aircraft, landingSequence, holding, reroute, conditions, connectionStatus, connectionLastSeenUtc, notices, messages } = state;

  const [pilotActionFeedback, setPilotActionFeedback] = useState<string | null>(null);

  const isDisconnected = connectionStatus === 'DISCONNECTED';
  const ageOfLastUpdate = ageLabel(connectionLastSeenUtc);

  // ── Determine if an Urgent Notice Exists ──
  const criticalNotice = notices.find((n) => n.urgency === 'CRITICAL');
  const urgentText = isDisconnected
    ? `DATALINK LOST (${ageOfLastUpdate}) — REVERT TO PRIMARY VHF VOICE 127.425 MHz`
    : criticalNotice
    ? `URGENT NOTICE: ${criticalNotice.title.toUpperCase()} — ${criticalNotice.body}`
    : conditions.previousRunway && conditions.previousRunway !== conditions.activeRunway
    ? `RUNWAY REVERSAL IN PROGRESS: ${conditions.previousRunway} → ${conditions.activeRunway} (${conditions.approachType})`
    : null;

  // ── Determine the Single Latest Instruction or Proposal ──
  // Priority order: Tactical Reroute Proposal > Active Hold > Runway Reversal > Datalink Lost > Nominal Arrival Sequence
  let mainInstructionSource = 'SOURCE: GROUND CONTROL (ATC / AMAN)';
  let mainInstructionTime = landingSequence.lastUpdatedUtc;
  let mainInstructionSentence = '';
  let requiresResponse = false;
  let isRerouteProposal = false;
  let defaultAckText = '';
  let defaultUnableText = '';

  if (reroute && (reroute.status === 'PROPOSED' || reroute.status === 'AWAITING_RESPONSE')) {
    mainInstructionSource = 'SOURCE: GROUND CONTROL (TACTICAL REROUTE)';
    mainInstructionTime = reroute.proposedAtUtc;
    mainInstructionSentence = `ATC proposes tactical reroute via ${reroute.routeDiff} (+${reroute.estimatedTimeImpactMin} min) for arrival spacing.`;
    requiresResponse = true;
    isRerouteProposal = true;
    defaultAckText = `Wilco, ready for proposed reroute via ${reroute.routeDiff} if cleared.`;
    defaultUnableText = `Unable tactical reroute via ${reroute.routeDiff}; maintain current cleared route.`;
  } else if (holding.active) {
    mainInstructionSource = 'SOURCE: GROUND CONTROL (HOLDING INSTRUCTION)';
    mainInstructionTime = holding.lastUpdatedUtc;
    const efcClause = holding.efcUtc
      ? `expect further clearance at ${formatUtcTime(holding.efcUtc)} UTC`
      : 'awaiting further clearance';
    mainInstructionSentence = `Maintain holding at ${holding.fix ?? 'LAM'} at FL${holding.assignedAltitudeFt ? holding.assignedAltitudeFt / 100 : '150'}, ${efcClause}.`;
    requiresResponse = true;
    defaultAckText = `Wilco, maintaining hold at ${holding.fix ?? 'LAM'}, ${efcClause}.`;
    defaultUnableText = `Unable hold at ${holding.fix ?? 'LAM'}; fuel reserves critical.`;
  } else if (conditions.previousRunway && conditions.previousRunway !== conditions.activeRunway) {
    mainInstructionSource = 'SOURCE: GROUND CONTROL (RUNWAY ADVISORY)';
    mainInstructionTime = conditions.runwayChangedAtUtc ?? conditions.observedAtUtc;
    mainInstructionSentence = `Active arrival runway changed from ${conditions.previousRunway} to ${conditions.activeRunway} (${conditions.approachType}).`;
    requiresResponse = true;
    defaultAckText = `Wilco, acknowledge active runway changed to ${conditions.activeRunway}.`;
    defaultUnableText = `Unable runway ${conditions.activeRunway} due to operational limits.`;
  } else if (isDisconnected) {
    mainInstructionSource = 'SOURCE: AIRCRAFT AVIONICS (LINK LOST)';
    mainInstructionTime = connectionLastSeenUtc;
    mainInstructionSentence = `CPDLC ground datalink connection lost (${ageOfLastUpdate}) — revert to primary VHF voice frequency 127.425 MHz.`;
    requiresResponse = true;
    defaultAckText = 'Copy, monitoring primary VHF voice frequency 127.425 MHz.';
    defaultUnableText = 'Unable CPDLC restoration; remaining on voice.';
  } else {
    mainInstructionSource = 'SOURCE: GROUND CONTROL (AMAN SEQUENCING)';
    mainInstructionTime = landingSequence.lastUpdatedUtc;
    mainInstructionSentence = `Cleared for standard arrival into London Heathrow, number ${landingSequence.sequenceNumber} in sequence for Runway ${landingSequence.assignedRunway ?? '27R'}.`;
    requiresResponse = false;
  }

  // ── Pilot Response Handlers ──
  const handleAcknowledge = async () => {
    if (isRerouteProposal && reroute) {
      activeDataLinkAdapter.pilotAcceptReroute(reroute.id);
    }
    const text = defaultAckText || `Wilco, acknowledge instruction.`;
    await onSendPilotResponse('ACKNOWLEDGE', text);
    setPilotActionFeedback(`✓ Acknowledged (${formatUtcTime(new Date().toISOString())}) · Downlinked to Ground Control`);
  };

  const handleUnable = async () => {
    if (isRerouteProposal && reroute) {
      activeDataLinkAdapter.pilotUnableReroute(reroute.id);
    }
    const text = defaultUnableText || `Unable instruction; maintaining current flight plan.`;
    await onSendPilotResponse('UNABLE', text);
    setPilotActionFeedback(`✕ "Unable" downlinked (${formatUtcTime(new Date().toISOString())}) · Maintaining current plan`);
  };

  // ── Holding Status Calculation ──
  let holdingStatusDisplay = 'None';
  let holdingSubtext = 'No active holding';
  if (holding.active) {
    if (holding.efcUtc) {
      holdingStatusDisplay = formatUtcTime(holding.efcUtc);
      holdingSubtext = `Hold ${holding.fix ?? 'LAM'} (EFC Time)`;
    } else {
      // Exactly per requirement: "If there is no supplied further-clearance time, say 'Awaiting further clearance' rather than showing a countdown."
      holdingStatusDisplay = 'Awaiting further clearance';
      holdingSubtext = `Hold ${holding.fix ?? 'LAM'} (No EFC time)`;
    }
  }

  const unreadMessagesCount = messages.filter((m) => m.status === 'UNREAD').length;
  const totalUpdatesCount = unreadMessagesCount + notices.length;

  return (
    <div className="single-glance-tablet-screen" role="region" aria-label="Pilot Single-Glance Overview">
      {/* ══════════════════════════════════════════════════════════════════
          AREA 1: COMPACT HEADER
          Flight ID, Connection Status, Age of Latest Ground Update, & One-Tap Nav
         ══════════════════════════════════════════════════════════════════ */}
      <header className="glance-header">
        <div className="glance-header-left">
          <div className="glance-brand">
            <span className="glance-brand-icon">🐝</span>
            <span className="glance-brand-name">Honey B</span>
          </div>

          <div className="glance-flight-chip">
            <span className="glance-flight-id">{aircraft.flightId}</span>
            <span className="glance-flight-route">{aircraft.originIcao} → {aircraft.destinationIcao}</span>
            <span className="glance-flight-type">({aircraft.aircraftType})</span>
          </div>
        </div>

        <div className="glance-header-center">
          <div className={`glance-connection-badge status-${connectionStatus.toLowerCase()}`}>
            <span className="connection-status-dot" />
            <span className="connection-status-text">
              {connectionStatus === 'LIVE'
                ? 'DATALINK LIVE'
                : connectionStatus === 'DELAYED'
                ? 'DATALINK LAGGING'
                : 'DATALINK LOST'}
            </span>
          </div>
          <span className="glance-update-age">
            Ground update: <strong>{ageOfLastUpdate}</strong>
          </span>
        </div>

        {/* Obvious One-Tap Deep Navigation */}
        <div className="glance-header-nav">
          <button
            type="button"
            className="glance-nav-btn updates-btn"
            onClick={onOpenUpdates}
            title="Open Operational Notices & Messages"
          >
            <span className="nav-btn-icon">📋</span>
            <span>Updates</span>
            {totalUpdatesCount > 0 && (
              <span className="nav-badge-count">{totalUpdatesCount}</span>
            )}
          </button>

          <button
            type="button"
            className="glance-nav-btn flight-status-btn"
            onClick={onOpenFlightStatus}
            title="Open Avionics, Fuel, Reroute Diffs, & Weather"
          >
            <span className="nav-btn-icon">✈</span>
            <span>Flight Status</span>
            <span className="nav-btn-arrow">›</span>
          </button>
        </div>
      </header>

      {/* ── Conditional Urgent Notice (Rendered ONLY when one exists) ── */}
      {urgentText && (
        <div className="glance-urgent-banner" role="alert">
          <div className="urgent-banner-content">
            <span className="urgent-badge">⚠ URGENT</span>
            <span className="urgent-text">{urgentText}</span>
          </div>
          <button
            type="button"
            className="urgent-details-btn"
            onClick={onOpenUpdates}
          >
            View Notice Details ›
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          AREA 2: MAIN CARD
          Latest instruction or proposal in one clear sentence + Large widely separated actions
         ══════════════════════════════════════════════════════════════════ */}
      <section className="glance-main-card" aria-label="Latest Ground Instruction or Proposal">
        <div className="main-card-meta-bar">
          <div className="main-card-source-tag">
            <span className="source-dot" />
            <span>{mainInstructionSource}</span>
          </div>
          <div className="main-card-timestamp">
            Issued {formatUtcTime(mainInstructionTime)} ({ageLabel(mainInstructionTime)})
          </div>
        </div>

        {/* ONE CLEAR SENTENCE */}
        <div className="main-card-sentence-wrap">
          <p className="main-card-sentence">
            "{mainInstructionSentence}"
          </p>
        </div>

        {/* Pilot Action Controls: Large & Widely Separated with Safety Cushion */}
        {requiresResponse && !pilotActionFeedback && (
          <div className="main-card-actions-wrapper">
            <div className="action-safety-cushion-label">
              <span>PROTECTED RESPONSE ZONE</span>
              <span>WIDELY SEPARATED ACTIONS · INTENTIONAL TOUCH CONTROLS</span>
            </div>

            <div className="main-card-actions-row">
              {/* Primary Confirmation Action (Acknowledge or Accept Reroute) */}
              <div className="action-col-primary">
                {isRerouteProposal ? (
                  <PressAndHoldButton
                    actionId="main-card-accept-reroute"
                    label="✓ Accept Tactical Reroute (Advisory)"
                    sublabel="Hold 1.0s to confirm transmission"
                    variant="accept"
                    messageIntegrityKey={`${mainInstructionSentence}-${mainInstructionTime}`}
                    onConfirmed={handleAcknowledge}
                  />
                ) : (
                  <TouchSafeButton
                    actionId="main-card-ack"
                    variant="ack"
                    className="glance-action-btn ack"
                    onDeliberateClick={handleAcknowledge}
                  >
                    ✓ Acknowledge Instruction
                  </TouchSafeButton>
                )}
                <div className="action-hint-caption">
                  {isRerouteProposal
                    ? 'Downlinks advisory acceptance. Does not alter operative cleared route.'
                    : 'Confirms receipt to Ground Control.'}
                </div>
              </div>

              {/* Inactive Physical Separation Buffer to Prevent Slips / Turbulence Errors */}
              <div className="glance-actions-buffer" aria-hidden="true">
                <span className="buffer-line" />
                <span className="buffer-text">SEPARATION</span>
                <span className="buffer-line" />
              </div>

              {/* Time-Sensitive Defensive Action: Unable */}
              <div className="action-col-defensive">
                <TouchSafeButton
                  actionId="main-card-unable"
                  variant="unable"
                  className="glance-action-btn unable"
                  onDeliberateClick={handleUnable}
                >
                  ✕ Unable
                </TouchSafeButton>
                <div className="action-hint-caption">
                  Quick-access non-compliance downlink. Maintains current flight plan.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feedback State if Action was taken */}
        {pilotActionFeedback && (
          <div className="main-card-feedback-banner">
            <span>{pilotActionFeedback}</span>
            <button
              type="button"
              className="feedback-reset-btn"
              onClick={() => setPilotActionFeedback(null)}
            >
              Update Response
            </button>
          </div>
        )}

        {/* When no response is pending */}
        {!requiresResponse && (
          <div className="main-card-nominal-status">
            <span className="nominal-check-icon">✓</span>
            <span>Operative arrival plan confirmed · No pending ATC response required</span>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          AREA 3: ARRIVAL SUMMARY
          Landing sequence, holding status, ETA, and runway as four large, readable values
         ══════════════════════════════════════════════════════════════════ */}
      <footer className="glance-arrival-summary" aria-label="Arrival Summary At A Glance">
        {/* 1. Landing Sequence */}
        <div
          className="summary-tile"
          onClick={onOpenFlightStatus}
          role="button"
          tabIndex={0}
          title="Tap to view Arrival Sequence details"
        >
          <div className="summary-tile-label">LANDING SEQUENCE</div>
          <div className="summary-tile-value highlight-cyan">
            #{landingSequence.sequenceNumber} <span className="summary-unit">of {landingSequence.totalInSequence}</span>
          </div>
          <div className="summary-tile-sub">
            {landingSequence.status === 'CONFIRMED' ? 'Confirmed by AMAN' : 'Estimated sequence'}
          </div>
        </div>

        {/* 2. Holding Status */}
        <div
          className="summary-tile"
          onClick={onOpenFlightStatus}
          role="button"
          tabIndex={0}
          title="Tap to view Holding details"
        >
          <div className="summary-tile-label">HOLDING STATUS</div>
          <div className={`summary-tile-value ${holding.active ? 'highlight-amber' : 'highlight-green'}`}>
            {holdingStatusDisplay}
          </div>
          <div className="summary-tile-sub">
            {holdingSubtext}
          </div>
        </div>

        {/* 3. ETA */}
        <div
          className="summary-tile"
          onClick={onOpenFlightStatus}
          role="button"
          tabIndex={0}
          title="Tap to view ETA and Delay details"
        >
          <div className="summary-tile-label">DESTINATION ETA</div>
          <div className="summary-tile-value highlight-emerald">
            {formatUtcTime(landingSequence.targetLandingTimeUtc)}
            {landingSequence.delayMinutes > 0 && (
              <span className="summary-delay-delta">+{landingSequence.delayMinutes}m</span>
            )}
          </div>
          <div className="summary-tile-sub">
            FMS: {formatUtcTime(aircraft.fmsEtaUtc)} UTC
          </div>
        </div>

        {/* 4. Runway */}
        <div
          className="summary-tile"
          onClick={onOpenFlightStatus}
          role="button"
          tabIndex={0}
          title="Tap to view Runway and Weather details"
        >
          <div className="summary-tile-label">ASSIGNED RUNWAY</div>
          <div className="summary-tile-value highlight-purple">
            {landingSequence.assignedRunway ?? conditions.activeRunway ?? '27R'}
          </div>
          <div className="summary-tile-sub">
            {conditions.approachType ?? 'ILS CAT III'} · Wind {conditions.windSpeedKts}kt
          </div>
        </div>
      </footer>
    </div>
  );
}
