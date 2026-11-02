import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  ConsolidatedDashboardState,
  PilotResponseType,
} from '../types';
import {
  formatUtcTime,
  ageLabel,
} from '../utils/format';
import { activeDataLinkAdapter } from '../services/dataLinkAdapter';
import { AboutModal } from './AboutModal';

interface Props {
  state: ConsolidatedDashboardState;
  onSendPilotResponse: (
    responseType: PilotResponseType,
    text: string,
    referencedMessageId?: string
  ) => Promise<void>;
  onOpenUpdates: () => void;
  onOpenFlightStatus: () => void;
}

interface CommandOptionCardItem {
  cardId: string;
  messageId: string;
  groupKey?: string;
  optionIndex?: number;
  badgeColor: 'num-green' | 'num-blue' | 'num-amber' | 'num-purple' | 'num-slate' | 'num-critical';
  title: string;
  subtitleTag?: string;
  timestampUtc: string;
  summary: string;
  acceptReplyText: string;
  unableReplyText: string;
  graphicType: 'RUNWAY' | 'HOLD' | 'CLOCK' | 'REROUTE' | 'PRIORITY';
  graphicLabel?: string;
  isRerouteProposal?: boolean;
  rerouteId?: string;
  serverStatus?: 'UNREAD' | 'READ' | 'ACKNOWLEDGED';
  serverPilotResponse?: string;
  serverPilotNote?: string;
}

const HOLD_SECURITY_DURATION_MS = 1000; // 1.0 second mandatory hold to accept

interface HoldAcceptButtonProps {
  card: CommandOptionCardItem;
  isAccepted: boolean;
  isSending: boolean;
  compact?: boolean;
  disabled?: boolean;
  onConfirmAccept: (card: CommandOptionCardItem) => void;
}

/**
 * 1.0-Second Press-and-Hold Security Accept Pill Button.
 * Prevents accidental tap/click acceptance: pilot must press and hold continuously for 1000ms (1.0s).
 * Releasing early cancels the action and displays a security warning.
 */
function Hold1sAcceptPillButton({
  card,
  isAccepted,
  isSending,
  compact = false,
  disabled = false,
  onConfirmAccept,
}: HoldAcceptButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [earlyReleaseWarning, setEarlyReleaseWarning] = useState(false);

  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const completedRef = useRef<boolean>(false);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAnimation();
      if (warningTimerRef.current !== null) {
        window.clearTimeout(warningTimerRef.current);
      }
    };
  }, [stopAnimation]);

  const startHold = useCallback(() => {
    if (isAccepted || isSending || disabled) return;
    stopAnimation();
    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    setEarlyReleaseWarning(false);
    completedRef.current = false;
    startTimeRef.current = performance.now();
    setIsHolding(true);
    setProgressPct(0);

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / HOLD_SECURITY_DURATION_MS) * 100);
      setProgressPct(pct);

      if (elapsed >= HOLD_SECURITY_DURATION_MS) {
        completedRef.current = true;
        setIsHolding(false);
        setProgressPct(0);
        rafRef.current = null;
        onConfirmAccept(card);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [card, isAccepted, isSending, disabled, onConfirmAccept, stopAnimation]);

  const cancelHold = useCallback(() => {
    if (!isHolding || completedRef.current) return;
    stopAnimation();
    setIsHolding(false);
    setProgressPct(0);
    setEarlyReleaseWarning(true);
    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current);
    }
    warningTimerRef.current = window.setTimeout(() => {
      setEarlyReleaseWarning(false);
    }, 1800);
  }, [isHolding, stopAnimation]);

  const remainingSec = Math.max(
    0,
    (HOLD_SECURITY_DURATION_MS * (1 - progressPct / 100)) / 1000
  ).toFixed(1);

  return (
    <button
      type="button"
      disabled={isSending || isAccepted}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        startHold();
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          cancelHold();
        }
      }}
      onClick={(e) => {
        // Prevent any instant click from triggering acceptance without 1s hold
        e.preventDefault();
      }}
      className={compact ? undefined : 'suggested-reply-btn'}
      style={{
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        flex: compact ? undefined : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        borderRadius: 9999,
        padding: compact ? '7px 16px' : '6px 14px',
        background: isAccepted
          ? 'rgba(34, 197, 94, 0.24)'
          : earlyReleaseWarning
          ? 'rgba(245, 166, 35, 0.16)'
          : 'rgba(34, 197, 94, 0.09)',
        border: `1.5px solid ${
          disabled
            ? '#64748b'
            : isAccepted
            ? '#22c55e'
            : earlyReleaseWarning
            ? '#F5A623'
            : isHolding
            ? '#4ade80'
            : 'rgba(34, 197, 94, 0.48)'
        }`,
        color: disabled ? '#94a3b8' : '#FFFFFF',
        cursor: disabled ? 'not-allowed' : isAccepted ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : undefined,
      }}
      title={
        disabled
          ? 'Clearance acceptance disabled: Datalink connection is disconnected or degraded'
          : 'Security Protected: Press and hold continuously for 1.0 second to accept and downlink WILCO'
      }
    >
      {/* Animated 1.0s Hold Progress Fill Bar */}
      {isHolding && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progressPct}%`,
            background:
              'linear-gradient(90deg, rgba(34, 197, 94, 0.45) 0%, rgba(74, 222, 128, 0.65) 100%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Left Broadcast Icon & Reply Text */}
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}
      >
        <span className="reply-broadcast-icon" style={{ color: earlyReleaseWarning ? '#F5A623' : '#4ade80', fontWeight: 800 }}>
          {isHolding ? '⏳' : earlyReleaseWarning ? '🔒' : '((•))'}
        </span>
        {!compact && (
          <span
            className="reply-text"
            style={{
              color: earlyReleaseWarning ? '#F5A623' : undefined,
              fontWeight: earlyReleaseWarning || isHolding ? 700 : undefined,
            }}
          >
            {isAccepted
              ? `Accepted & Sent: "${card.acceptReplyText}"`
              : earlyReleaseWarning
              ? 'Hold 1.0s required for security — released too early!'
              : isHolding
              ? `Holding to confirm security lock... (${remainingSec}s)`
              : `"${card.acceptReplyText}"`}
          </span>
        )}
      </span>

      {/* Right Status / Hold 1s Prompt */}
      <span
        className="reply-arrow"
        style={{
          position: 'relative',
          zIndex: 1,
          fontWeight: 800,
          fontSize: '0.75rem',
          color: earlyReleaseWarning ? '#F5A623' : '#4ade80',
          opacity: 1,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {isSending
          ? 'Sending...'
          : isAccepted
          ? '✓ Accepted'
          : isHolding
          ? `Hold ${remainingSec}s...`
          : earlyReleaseWarning
          ? compact
            ? '⚠ Hold Full 1s!'
            : 'Hold 1s ›'
          : compact
          ? '🔒 Hold 1s to Accept ›'
          : '🔒 Hold 1s to Accept ›'}
      </span>
    </button>
  );
}

/**
 * Helper to split a combined multi-option ATC message
 * (e.g. "UAE231 ATC OPTIONS — OPTION 1: Hold at DXB VOR 4000 ft | OPTION 2: Divert to OMSJ — Advise crew preference.")
 * into separate individual option items so each option renders as its own card with its own Accept button.
 */
function parseAtcMessageIntoOptionParts(body: string): Array<{ label: string; text: string }> {
  const cleaned = body
    .replace(/^[A-Z0-9]+\s+ATC\s+(OPTIONS|QUERY)\s*[—\-:]\s*/i, '')
    .replace(/\s*[—\-]\s*Advise\s+(crew\s+|captain\s+|pilot\s+)?(preference|decision)\.?$/i, '')
    .trim();

  if (cleaned.includes('|')) {
    const parts = cleaned
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      return parts.map((part, idx) => {
        const match = part.match(/^(?:OPTION|OPT|\(\d+\))\s*(\d+|[A-Z])?\s*[:\-]\s*(.+)$/i);
        if (match) {
          const optId = match[1] ? match[1].toUpperCase() : String(idx + 1);
          return {
            label: `ATC Option ${optId}`,
            text: match[2].trim().replace(/\.$/, ''),
          };
        }
        return {
          label: `ATC Option ${idx + 1}`,
          text: part.replace(/\.$/, ''),
        };
      });
    }
  }

  return [];
}

function inferGraphicType(text: string, subject: string): 'RUNWAY' | 'HOLD' | 'CLOCK' | 'REROUTE' | 'PRIORITY' {
  const u = `${subject} ${text}`.toUpperCase();
  const hasRealHold =
    (u.includes('HOLD') || u.includes('ORBIT') || u.includes('VOR')) &&
    !u.includes('ZERO HOLDING') &&
    !u.includes('NO HOLD') &&
    !u.includes('AVOID 30L LVP HOLD');

  if (u.includes('DIVERT') || u.includes('REROUTE') || u.includes('OMSJ') || u.includes('OMDW') || u.includes('ALTERNATE')) {
    return 'REROUTE';
  }
  if (u.includes('SIDESTEP') || u.includes('AUTOLAND') || ((u.includes('RWY') || u.includes('RUNWAY') || u.includes('ILS')) && !hasRealHold)) {
    return 'RUNWAY';
  }
  if (hasRealHold) return 'HOLD';
  if (u.includes('SPEED') || u.includes('ETA') || u.includes('DELAY') || u.includes('KT') || u.includes('KNOT')) return 'CLOCK';
  return 'PRIORITY';
}

function inferShortTitle(text: string, fallback: string): string {
  const u = text.toUpperCase();
  const hasRealHold =
    (u.includes('HOLD') || u.includes('VOR')) &&
    !u.includes('ZERO HOLDING') &&
    !u.includes('NO HOLD') &&
    !u.includes('AVOID 30L LVP HOLD');

  if (u.includes('DIVERT') || u.includes('OMSJ') || u.includes('OMDW')) return `${fallback} — Divert / Alternate`;
  if (u.includes('SIDESTEP') || u.includes('AUTOLAND') || ((u.includes('RWY') || u.includes('RUNWAY')) && !hasRealHold)) {
    return `${fallback} — Runway / Approach`;
  }
  if (hasRealHold) return `${fallback} — Maintain Hold`;
  if (u.includes('SPEED') || u.includes('KT') || u.includes('KNOT')) return `${fallback} — Speed Control`;
  if (u.includes('ALTITUDE') || u.includes('DESCEND') || u.includes('CLIMB') || u.includes('FT') || u.includes('FEET')) return `${fallback} — Altitude Clearance`;
  if (u.includes('PAN PAN') || u.includes('MAYDAY')) return `${fallback} — Emergency Declaration`;
  return fallback;
}

function extractExplicitRunway(text: string, defaultRwy: string): string {
  const m = text.toUpperCase().match(/\b(?:RWY|RUNWAY)\s*(30L|30R|12L|12R)\b/);
  return m ? m[1] : defaultRwy;
}

export function TabletPilotOverview({
  state,
  onSendPilotResponse,
  onOpenUpdates,
  onOpenFlightStatus,
}: Props) {
  const {
    aircraft,
    landingSequence,
    conditions,
    connectionStatus,
    connectionLastSeenUtc,
    notices,
    messages,
  } = state;

  // Track per-card pilot responses locally so each option/command card shows immediate feedback
  const [cardResponses, setCardResponses] = useState<
    Record<string, { status: 'ACCEPTED' | 'UNABLE'; replyText: string; timeUtc: string }>
  >({});
  // Track which incoming popup cards have been dismissed/added into the list without remaining in the top popup
  const [dismissedPopupIds, setDismissedPopupIds] = useState<Record<string, boolean>>({});
  const [sendingCardId, setSendingCardId] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState<boolean>(false);
  const [fogToggling, setFogToggling] = useState<boolean>(false);

  const isDisconnected = connectionStatus === 'DISCONNECTED';
  const ageOfLastUpdate = ageLabel(connectionLastSeenUtc);

  // Detect OMDB Fog / LVP state
  const visMeters = conditions.visibilityMeters ?? 6000;
  const isFogActive =
    visMeters < 1500 ||
    (conditions.approachType || '').includes('CAT III') ||
    conditions.notams.some((n) => n.toUpperCase().includes('FOG') || n.toUpperCase().includes('LVP_ACTIVE'));
  const isDenseFog = visMeters <= 450;

  const badgeColors: Array<CommandOptionCardItem['badgeColor']> = [
    'num-green',
    'num-blue',
    'num-amber',
    'num-purple',
    'num-slate',
  ];

  const activeRwy = landingSequence.assignedRunway ?? conditions.activeRunway ?? '30L';

  // ══════════════════════════════════════════════════════════════════════════
  // BUILD ONLY ACTUAL ATC-ISSUED COMMANDS & OPTIONS (BLANK BEFORE ATC SENDS!)
  // ══════════════════════════════════════════════════════════════════════════
  const rawCards: CommandOptionCardItem[] = [];

  // 1. Add ONLY live ATC messages / options transmitted by Ground Control
  const atcMessages = messages.filter((m) => m.source === 'ATC');
  for (const msg of atcMessages) {
    const optionParts = parseAtcMessageIntoOptionParts(msg.body);
    if (optionParts.length > 1) {
      optionParts.forEach((opt, idx) => {
        const gType = inferGraphicType(opt.text, msg.subject);
        const rwyLabel = extractExplicitRunway(opt.text, activeRwy);
        const cardId = `${msg.id}::OPT-${idx + 1}`;
        rawCards.push({
          cardId,
          messageId: cardId,
          groupKey: msg.id,
          optionIndex: idx + 1,
          badgeColor: badgeColors[rawCards.length % badgeColors.length],
          title: inferShortTitle(opt.text, opt.label),
          subtitleTag: `OPTION ${idx + 1} OF ${optionParts.length}`,
          timestampUtc: msg.timestampUtc,
          summary: opt.text,
          acceptReplyText: `Wilco, accept ${opt.label}: ${opt.text}`,
          unableReplyText: `Unable ${opt.label} (${opt.text})`,
          graphicType: gType,
          graphicLabel: gType === 'RUNWAY' ? `RWY ${rwyLabel}` : gType === 'CLOCK' ? 'OPT' : undefined,
          serverStatus: msg.status,
          serverPilotResponse: msg.pilotResponse,
          serverPilotNote: msg.pilotResponseNote,
        });
      });
    } else {
      const singleOptMatch = msg.body.match(/^(?:[A-Z0-9]+\s+)?(?:OPTION|OPT)\s*(\d+|[A-Z])\s*[:\-]\s*(.+)$/i);
      const cleanBody = singleOptMatch ? singleOptMatch[2].trim() : msg.body;
      const optNum = singleOptMatch ? parseInt(singleOptMatch[1], 10) || undefined : undefined;
      const baseLabel = singleOptMatch
        ? inferShortTitle(cleanBody, `ATC Option ${singleOptMatch[1]}`)
        : inferShortTitle(cleanBody, msg.subject.replace(/^ATC\s+/i, '').replace(/\s+Clearance$/i, ''));
      const gType = inferGraphicType(cleanBody, msg.subject);
      const rwyLabel = extractExplicitRunway(cleanBody, activeRwy);
      rawCards.push({
        cardId: msg.id,
        messageId: msg.id,
        optionIndex: optNum,
        badgeColor: badgeColors[rawCards.length % badgeColors.length],
        title: baseLabel,
        subtitleTag: singleOptMatch ? `PILOT OPTION ${singleOptMatch[1]}` : msg.requiresAck ? 'ATC COMMAND' : 'ATC ADVISORY',
        timestampUtc: msg.timestampUtc,
        summary: cleanBody,
        acceptReplyText: `Wilco, ${cleanBody}`,
        unableReplyText: `Unable: ${cleanBody}`,
        graphicType: gType,
        graphicLabel: gType === 'RUNWAY' ? `RWY ${rwyLabel}` : undefined,
        serverStatus: msg.status,
        serverPilotResponse: msg.pilotResponse,
        serverPilotNote: msg.pilotResponseNote,
      });
    }
  }

  // Ensure Option 1 appears before Option 2 when sent at the same timestamp
  const cards: CommandOptionCardItem[] = [...rawCards].sort((a, b) => {
    if (a.timestampUtc === b.timestampUtc && a.optionIndex !== undefined && b.optionIndex !== undefined) {
      return a.optionIndex - b.optionIndex;
    }
    return 0;
  }).map((c, idx) => ({
    ...c,
    badgeColor: badgeColors[idx % badgeColors.length],
  }));

  // 2. If Controller explicitly approved an Estimated Sequence Advisory in the Risk Advisor, include it
  const isControllerEstimate = landingSequence.advisorySource === 'CONTROLLER_APPROVED_ESTIMATE';
  if (isControllerEstimate) {
    cards.push({
      cardId: `ADV-SEQ-${landingSequence.approvedAtUtc || '1'}`,
      messageId: `ADV-SEQ-${landingSequence.approvedAtUtc || '1'}`,
      badgeColor: badgeColors[cards.length % badgeColors.length],
      title: 'Controller-Approved Estimated Sequence',
      subtitleTag: 'ESTIMATED SEQUENCE (NOT CLEARANCE)',
      timestampUtc: landingSequence.approvedAtUtc ?? landingSequence.lastUpdatedUtc,
      summary: `Controller-approved estimated sequence: #${landingSequence.sequenceNumber} for Runway ${activeRwy} (Target ${formatUtcTime(
        landingSequence.targetLandingTimeUtc
      )}). Formal ATC clearance still required.`,
      acceptReplyText: `Copy estimated sequence #${landingSequence.sequenceNumber} for RWY ${activeRwy}.`,
      unableReplyText: `Unable estimated sequence #${landingSequence.sequenceNumber}; requesting priority review.`,
      graphicType: 'RUNWAY',
      graphicLabel: `RWY ${activeRwy}`,
    });
  }

  // Identify newly arrived unacknowledged cards that should POP UP first!
  const popupCards = cards.filter((c) => {
    const localResp = cardResponses[c.cardId];
    const alreadyRespondedOnServer =
      c.serverPilotResponse === 'ACKNOWLEDGE' || c.serverPilotResponse === 'UNABLE';
    const isDismissed = dismissedPopupIds[c.cardId];
    return !localResp && !alreadyRespondedOnServer && !isDismissed;
  });

  const handleCardAccept = async (card: CommandOptionCardItem) => {
    setSendingCardId(card.cardId);
    try {
      if (card.isRerouteProposal && card.rerouteId) {
        activeDataLinkAdapter.pilotAcceptReroute(card.rerouteId);
      }
      await onSendPilotResponse('ACKNOWLEDGE', card.acceptReplyText, card.messageId);
      const nowStr = formatUtcTime(new Date().toISOString());
      setCardResponses((prev) => ({
        ...prev,
        [card.cardId]: {
          status: 'ACCEPTED',
          replyText: card.acceptReplyText,
          timeUtc: nowStr,
        },
      }));
      setDismissedPopupIds((prev) => ({ ...prev, [card.cardId]: true }));
    } finally {
      setSendingCardId(null);
    }
  };

  const handleCardUnable = async (card: CommandOptionCardItem) => {
    setSendingCardId(card.cardId);
    try {
      if (card.isRerouteProposal && card.rerouteId) {
        activeDataLinkAdapter.pilotUnableReroute(card.rerouteId);
      }
      await onSendPilotResponse('UNABLE', card.unableReplyText, card.messageId);
      const nowStr = formatUtcTime(new Date().toISOString());
      setCardResponses((prev) => ({
        ...prev,
        [card.cardId]: {
          status: 'UNABLE',
          replyText: card.unableReplyText,
          timeUtc: nowStr,
        },
      }));
      setDismissedPopupIds((prev) => ({ ...prev, [card.cardId]: true }));
    } finally {
      setSendingCardId(null);
    }
  };

  const handleDismissPopupToStack = (cardIds: string[]) => {
    setDismissedPopupIds((prev) => {
      const next = { ...prev };
      cardIds.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
  };

  const handleToggleLiveFog = async (targetPhase: 'DENSE_FOG' | 'CLEAR') => {
    setFogToggling(true);
    try {
      await activeDataLinkAdapter.setScenario(
        targetPhase === 'DENSE_FOG' ? 'RUNWAY_WEATHER_CHANGE' : 'NORMAL_ARRIVAL'
      );
    } finally {
      setFogToggling(false);
    }
  };

  const unreadMessagesCount = messages.filter((m) => m.status === 'UNREAD').length;
  const totalUpdatesCount = unreadMessagesCount + notices.length;

  // Bottom bar telemetry calculations
  const etaFormatted = formatUtcTime(landingSequence.targetLandingTimeUtc);
  const remMin = Math.max(
    1,
    Math.round(
      (new Date(landingSequence.targetLandingTimeUtc).getTime() - new Date(state.generatedAtUtc).getTime()) /
        60000
    ) || 8
  );

  const hasFuel = Boolean(
    aircraft.fuel &&
      'fuelOnBoardKg' in aircraft.fuel &&
      (aircraft.fuel as any).fuelOnBoardKg !== undefined &&
      (aircraft.fuel as any).fuelOnBoardKg !== null
  );
  const fuelTons = hasFuel ? ((aircraft.fuel as any).fuelOnBoardKg / 1000).toFixed(1) : 'UNKNOWN';
  const fuelEnduranceMin = hasFuel ? ((aircraft.fuel as any).holdingEnduranceMinutes || 0) : 0;
  const fuelHours = Math.floor(fuelEnduranceMin / 60);
  const fuelMins = fuelEnduranceMin % 60;
  const fuelSub = hasFuel
    ? fuelHours > 0
      ? `~ ${fuelHours}h ${fuelMins}m`
      : `~ ${fuelMins}m above reserve`
    : 'Not available from ADS-B';
  const fuelPct = hasFuel ? Math.min(100, Math.max(12, Math.round((fuelEnduranceMin / 90) * 100))) : 0;

  return (
    <div
      className="tablet-overview-section"
      role="region"
      aria-label="Honey B Pilot Decision Support"
      style={{
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* About / Info Modal */}
      {showAbout && (
        <AboutModal
          onClose={() => setShowAbout(false)}
          contractVersion={state.contractVersion}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ATMOSPHERIC FOG VISUALIZATION OVERLAY WHEN FOG / LVP IS ACTIVE
         ══════════════════════════════════════════════════════════════════ */}
      {isFogActive && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: isDenseFog
              ? 'radial-gradient(ellipse at 50% 0%, rgba(203, 213, 225, 0.20) 0%, rgba(148, 163, 184, 0.10) 45%, transparent 80%)'
              : 'radial-gradient(ellipse at 50% 0%, rgba(203, 213, 225, 0.12) 0%, transparent 70%)',
            zIndex: 0,
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          1. TABLET HEADER & TABS
         ══════════════════════════════════════════════════════════════════ */}
      <header className="tablet-header" style={{ position: 'relative', zIndex: 2 }}>
        <div className="tablet-header-left">
          <div className="honey-b-brand">
            <img
              src="/honey-b-logo.jpg"
              alt="Honey B logo"
              className="glance-brand-mark"
              draggable={false}
            />
            <div>
              <div className="honey-b-title">Honey B</div>
              <div className="honey-b-sub">ATC Decision Support</div>
            </div>
          </div>

          <div
            className="tablet-flight-chip"
            style={
              aircraft.flightId === 'UAE231'
                ? {
                    border: '1.5px solid #F5A623',
                    background: 'rgba(245, 166, 35, 0.14)',
                  }
                : undefined
            }
          >
            <span className="chip-flight-id">
              {aircraft.flightId === 'UAE231' ? `★ ${aircraft.flightId}` : aircraft.flightId}
            </span>
            <span className="chip-flight-route">
              {aircraft.originIcao} → {aircraft.destinationIcao} ({aircraft.aircraftType}
              {aircraft.flightId === 'UAE231' ? ' · CAT IIIB' : ''})
            </span>
          </div>
        </div>

        {/* Center Tabs */}
        <div className="tablet-header-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={true}
            className="tab-pill-btn active"
          >
            ATC COMMANDS ({cards.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="tab-pill-btn"
            onClick={onOpenFlightStatus}
          >
            FLIGHT STATUS
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="tab-pill-btn"
            onClick={onOpenUpdates}
          >
            SUGGESTED REPLIES {totalUpdatesCount > 0 ? `(${totalUpdatesCount})` : ''}
          </button>
        </div>

        {/* Right Connection Status + Quick Fog Toggle */}
        <div className="tablet-header-right">
          <div className="datalink-status-row" style={{ gap: 8 }}>
            <button
              type="button"
              disabled={fogToggling}
              onClick={() => handleToggleLiveFog(isFogActive ? 'CLEAR' : 'DENSE_FOG')}
              style={{
                padding: '4px 10px',
                borderRadius: 9999,
                fontSize: '0.7rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: '1px solid #F5A623',
                background: isFogActive ? '#F5A623' : 'rgba(245, 166, 35, 0.15)',
                color: isFogActive ? '#0B1F3A' : '#F5A623',
              }}
              title="Toggle OMDB Dense Fog (350m RVR) to test UAE231 LVP Operations"
            >
              {isFogActive ? `🌫 FOG ACTIVE (${visMeters}m)` : '🌫 Simulate Fog'}
            </button>
            {state.dataMode && (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  border: '1px solid',
                  borderColor:
                    state.dataMode === 'LIVE_OBSERVE'
                      ? '#10b981'
                      : state.dataMode === 'REPLAY'
                      ? '#f59e0b'
                      : '#8b5cf6',
                  color:
                    state.dataMode === 'LIVE_OBSERVE'
                      ? '#34d399'
                      : state.dataMode === 'REPLAY'
                      ? '#fbbf24'
                      : '#c084fc',
                  background: 'rgba(11, 31, 58, 0.9)',
                }}
                title={`Honey B Data Mode: ${state.dataMode}`}
              >
                ● {state.dataMode}
              </span>
            )}
            <span className={`datalink-icon ${connectionStatus.toLowerCase()}`}>●</span>
            <span className={`datalink-text ${connectionStatus.toLowerCase()}`}>
              {connectionStatus === 'LIVE'
                ? 'Connected'
                : connectionStatus === 'DELAYED'
                ? 'Delayed'
                : 'Disconnected'}
            </span>
            <button
              type="button"
              className="glance-info-btn"
              onClick={() => setShowAbout(true)}
              title="About Honey B"
              style={{ width: 26, height: 26, fontSize: '0.75rem', marginLeft: 4 }}
            >
              ⓘ
            </button>
          </div>
          <div className="datalink-station-text">
            {conditions.airportIcao} Tower/Approach · {ageOfLastUpdate}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          VISUALIZED FOG / LOW VISIBILITY BANNER ON PILOT TABLET
         ══════════════════════════════════════════════════════════════════ */}
      {isFogActive && (
        <div
          role="status"
          style={{
            position: 'relative',
            zIndex: 2,
            marginBottom: 12,
            padding: '10px 16px',
            borderRadius: 12,
            background: 'linear-gradient(90deg, rgba(16, 42, 76, 0.96) 0%, rgba(30, 68, 120, 0.92) 100%)',
            border: '1.5px solid #F5A623',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: '#F5A623',
                color: '#0B1F3A',
                fontWeight: 900,
                fontSize: '0.75rem',
                letterSpacing: '0.04em',
              }}
            >
              🌫 {isDenseFog ? 'OMDB DENSE FOG · LVP ACTIVE' : 'OMDB FOG · LVP PREP'}
            </span>
            <span style={{ color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 600 }}>
              Visibility <strong style={{ color: '#F5A623' }}>{visMeters}m</strong> ·{' '}
              <strong style={{ color: '#F5A623' }}>{conditions.approachType}</strong> · 6.0 NM Wake Spacing in Force
              {aircraft.flightId === 'UAE231' && (
                <span style={{ color: '#93c5fd', marginLeft: 8 }}>
                  (UAE231 CAT IIIB Autoland Eligible · Endurance {fuelEnduranceMin}m)
                </span>
              )}
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-data)', fontSize: '0.75rem', color: '#F5A623', fontWeight: 700 }}>
            QNH {conditions.qnhHpa} · RWY {activeRwy}
          </span>
        </div>
      )}

      {/* Disconnected Warning Banner */}
      {isDisconnected && (
        <div className="glance-urgent-banner" role="alert" style={{ marginBottom: 12, position: 'relative', zIndex: 2 }}>
          <div className="urgent-banner-content">
            <span className="urgent-badge">⚠ URGENT</span>
            <span className="urgent-text">
              DATALINK LOST ({ageOfLastUpdate}) — REVERT TO PRIMARY VHF VOICE 127.425 MHz
            </span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          2. INCOMING ATC COMMAND / OPTIONS POPUP
          When ATC sends a command or options, it POPS UP here first!
         ══════════════════════════════════════════════════════════════════ */}
      {popupCards.length > 0 && (
        <div
          role="dialog"
          aria-label="Incoming ATC Command Popup"
          style={{
            position: 'relative',
            zIndex: 5,
            marginBottom: 14,
            padding: '14px 16px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, #102A4C 0%, #0B1F3A 100%)',
            border: '2px solid #F5A623',
            boxShadow: '0 14px 36px rgba(0, 0, 0, 0.65), 0 0 0 3px rgba(245, 166, 35, 0.22)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: '1px solid rgba(245, 166, 35, 0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  background: '#F5A623',
                  color: '#0B1F3A',
                  fontWeight: 900,
                  fontSize: '0.72rem',
                  padding: '3px 9px',
                  borderRadius: 9999,
                  letterSpacing: '0.05em',
                }}
              >
                ⚡ NEW INCOMING ATC TRANSMISSION ({popupCards.length})
              </span>
              <span style={{ fontSize: '0.82rem', color: '#FFFFFF', fontWeight: 600 }}>
                {popupCards.length > 1
                  ? `Ground Control sent ${popupCards.length} separated options for ${aircraft.flightId} (Hold 1.0s to Accept):`
                  : `Ground Control sent a new command for ${aircraft.flightId} (Hold 1.0s to Accept):`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleDismissPopupToStack(popupCards.map((c) => c.cardId))}
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(245, 166, 35, 0.5)',
                color: '#F5A623',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✓ Keep in List Below ›
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {popupCards.map((card, idx) => (
              <div
                key={`popup-${card.cardId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(8, 23, 44, 0.92)',
                  border: '1px solid rgba(245, 166, 35, 0.45)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 240, flex: 1 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: '#F5A623',
                      color: '#0B1F3A',
                      fontWeight: 900,
                      fontSize: '0.9rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ color: '#F5A623', fontSize: '0.85rem' }}>{card.title}</strong>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'var(--font-data)' }}>
                        {formatUtcTime(card.timestampUtc)}
                      </span>
                    </div>
                    <div style={{ color: '#FFFFFF', fontSize: '0.92rem', fontWeight: 600, marginTop: 2 }}>
                      {card.summary}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Hold1sAcceptPillButton
                    card={card}
                    isAccepted={false}
                    isSending={sendingCardId === card.cardId}
                    compact={true}
                    disabled={isDisconnected}
                    onConfirmAccept={handleCardAccept}
                  />
                  <button
                    type="button"
                    disabled={sendingCardId === card.cardId}
                    onClick={() => handleCardUnable(card)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 9999,
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#f87171',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    ✕ Unable
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          3. SEPARATED NUMBERED COMMAND & OPTION CARDS LIST
          Starts BLANK before ATC sends any command; populates as ATC sends!
         ══════════════════════════════════════════════════════════════════ */}
      {cards.length === 0 ? (
        <div
          role="status"
          style={{
            position: 'relative',
            zIndex: 2,
            flex: 1,
            minHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '36px 24px',
            borderRadius: 16,
            background: 'rgba(16, 42, 76, 0.45)',
            border: '1.5px dashed rgba(245, 166, 35, 0.35)',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: 'rgba(245, 166, 35, 0.12)',
              border: '1.5px solid rgba(245, 166, 35, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              color: '#F5A623',
              marginBottom: 12,
            }}
          >
            📡
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.02em' }}>
            Awaiting ATC Datalink Commands for {aircraft.flightId}
          </div>
          <p style={{ fontSize: '0.86rem', color: '#cbd5e1', maxWidth: 520, marginTop: 6, lineHeight: 1.5 }}>
            No active clearances or pilot options have been transmitted by Ground Control yet.
            When ATC sends a command or multi-option choice from Ground Control, it will pop up here and be added to your command list.
          </p>
          {isFogActive && (
            <div
              style={{
                marginTop: 14,
                padding: '8px 16px',
                borderRadius: 9999,
                background: 'rgba(245, 166, 35, 0.16)',
                border: '1px solid #F5A623',
                color: '#F5A623',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              🌫 OMDB LVP Fog Active ({visMeters}m) — Standing by for RWY 30R CAT IIIB Sidestep or DXB VOR Hold Options
            </div>
          )}
        </div>
      ) : (
        <div
          className="tablet-updates-list"
          role="list"
          aria-label="Separated ATC Commands and Options"
          style={{ position: 'relative', zIndex: 2 }}
        >
          {cards.map((card, index) => {
            const localResp = cardResponses[card.cardId];
            const siblingAccepted =
              card.groupKey &&
              Object.entries(cardResponses).find(
                ([k, v]) => k.startsWith(`${card.groupKey}::`) && k !== card.cardId && v.status === 'ACCEPTED'
              );

            const isAccepted = Boolean(
              localResp?.status === 'ACCEPTED' ||
                (!card.groupKey && card.serverPilotResponse === 'ACKNOWLEDGE' && !localResp) ||
                (card.groupKey &&
                  card.serverPilotResponse === 'ACKNOWLEDGE' &&
                  card.serverPilotNote?.includes(card.summary) &&
                  !localResp)
            );

            const isUnable = Boolean(
              localResp?.status === 'UNABLE' ||
                (!card.groupKey && card.serverPilotResponse === 'UNABLE' && !localResp)
            );

            return (
              <div
                key={card.cardId}
                role="listitem"
                className="tablet-update-card"
                style={{
                  borderColor: isAccepted
                    ? 'rgba(34, 197, 94, 0.65)'
                    : isUnable
                    ? 'rgba(239, 68, 68, 0.5)'
                    : 'rgba(245, 166, 35, 0.5)',
                  opacity: siblingAccepted && !isAccepted ? 0.6 : 1,
                }}
              >
                {/* Left Numbered Badge (1, 2, 3, 4, 5...) */}
                <div className={`update-badge-number ${card.badgeColor}`}>
                  {index + 1}
                </div>

                {/* Middle Content + Individual 1s-Hold Accept / Unable Controls */}
                <div className="update-body">
                  <div className="update-title-row">
                    <div className="update-title-group">
                      <span className="update-title">{card.title}</span>
                      {card.subtitleTag && (
                        <span
                          className="update-status-pill"
                          style={{
                            background: 'rgba(245, 166, 35, 0.2)',
                            color: '#F5A623',
                            border: '1px solid rgba(245, 166, 35, 0.45)',
                          }}
                        >
                          {card.subtitleTag}
                        </span>
                      )}
                      {isAccepted && (
                        <span
                          className="update-status-pill"
                          style={{
                            background: 'rgba(34, 197, 94, 0.2)',
                            color: '#4ade80',
                            border: '1px solid rgba(34, 197, 94, 0.5)',
                          }}
                        >
                          ✓ ACCEPTED
                        </span>
                      )}
                      {isUnable && (
                        <span
                          className="update-status-pill"
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.5)',
                          }}
                        >
                          ✕ UNABLE
                        </span>
                      )}
                    </div>
                    <span className="update-timestamp">{formatUtcTime(card.timestampUtc)}</span>
                  </div>

                  <p className="update-summary">{card.summary}</p>

                  {/* Individual 1-Second Hold Security Accept Pill + Unable Button for THIS Command/Option */}
                  <div
                    className="suggested-reply-wrap"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}
                  >
                    <Hold1sAcceptPillButton
                      card={card}
                      isAccepted={isAccepted}
                      isSending={sendingCardId === card.cardId}
                      compact={false}
                      disabled={isDisconnected}
                      onConfirmAccept={handleCardAccept}
                    />

                    <button
                      type="button"
                      disabled={sendingCardId === card.cardId}
                      onClick={() => handleCardUnable(card)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 9999,
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        background: isUnable ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.08)',
                        color: '#f87171',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                      title="Respond UNABLE for this specific option/command"
                    >
                      {isUnable ? '✕ Unable Sent' : '✕ Unable'}
                    </button>
                  </div>
                </div>

                {/* Right-Side Aviation Diagram Cue */}
                <div className="update-graphic-zone">
                  {card.graphicType === 'RUNWAY' && (
                    <div className="mini-graphic-runway">
                      <span className="rwy-label">{card.graphicLabel ?? `RWY ${activeRwy}`}</span>
                      <div className="rwy-line-track">
                        <div className="rwy-centerline" />
                      </div>
                    </div>
                  )}

                  {card.graphicType === 'HOLD' && (
                    <div className="mini-graphic-holding" title="Holding Pattern">
                      <svg width="56" height="28" viewBox="0 0 56 28" fill="none">
                        <rect
                          x="4"
                          y="4"
                          width="48"
                          height="20"
                          rx="10"
                          stroke="#94a3b8"
                          strokeWidth="1.6"
                        />
                        <path d="M26 1 L31 4 L26 7" stroke="#F5A623" strokeWidth="1.6" fill="none" />
                        <path d="M30 21 L25 24 L30 27" stroke="#F5A623" strokeWidth="1.6" fill="none" />
                      </svg>
                    </div>
                  )}

                  {card.graphicType === 'CLOCK' && (
                    <div className="mini-graphic-clock">
                      <span className="clock-glyph">🕒</span>
                      <span className="clock-val">{card.graphicLabel ?? 'SPD/ETA'}</span>
                    </div>
                  )}

                  {card.graphicType === 'REROUTE' && (
                    <div className="mini-graphic-holding" title="Reroute / Alternate">
                      <svg width="52" height="28" viewBox="0 0 52 28" fill="none">
                        <path
                          d="M6 22 L20 22 L30 12 L46 12"
                          stroke="#F5A623"
                          strokeWidth="1.8"
                          fill="none"
                        />
                        <path d="M41 8 L46 12 L41 16" stroke="#F5A623" strokeWidth="1.8" fill="none" />
                        <path
                          d="M20 22 L30 22"
                          stroke="#64748b"
                          strokeWidth="1.4"
                          strokeDasharray="3 2"
                        />
                      </svg>
                    </div>
                  )}

                  {card.graphicType === 'PRIORITY' && (
                    <div className="mini-graphic-clock">
                      <span style={{ color: '#F5A623', fontSize: '1.1rem', fontWeight: 900 }}>︽</span>
                      <span className="clock-val">PRI</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          4. PERSISTENT BOTTOM 4-TILE STRIP (FUEL, ETA, RUNWAY, PRIORITY)
         ══════════════════════════════════════════════════════════════════ */}
      <footer className="tablet-bottom-strip" aria-label="Flight Summary Strip" style={{ position: 'relative', zIndex: 2 }}>
        {/* 1. FUEL */}
        <div className="bottom-strip-tile" onClick={onOpenFlightStatus} role="button" tabIndex={0}>
          <div className="tile-icon-col" style={{ fontSize: '1.35rem', color: '#F5A623' }}>
            ⛽
          </div>
          <div className="tile-content-col">
            <div className="tile-label">FUEL</div>
            <div className="tile-value" style={!hasFuel ? { fontSize: '0.92rem', color: '#94a3b8' } : undefined}>
              {hasFuel ? `${fuelTons} T` : 'UNKNOWN'}
            </div>
            <div className="tile-subtext" style={!hasFuel ? { color: '#fbbf24', fontSize: '0.72rem' } : undefined}>
              {hasFuel ? fuelSub : 'Not in ADS-B (Click to report)'}
            </div>
            {hasFuel && (
              <div className="tile-progress-bar">
                <div
                  className="tile-progress-fill"
                  style={{
                    width: `${fuelPct}%`,
                    background: fuelEnduranceMin < 40 ? '#F5A623' : '#22c55e',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* 2. ETA */}
        <div className="bottom-strip-tile" onClick={onOpenFlightStatus} role="button" tabIndex={0}>
          <div className="tile-icon-col" style={{ fontSize: '1.35rem', color: '#F5A623' }}>
            🕒
          </div>
          <div className="tile-content-col">
            <div className="tile-label">ETA ({conditions.airportIcao})</div>
            <div className="tile-value">{etaFormatted}</div>
            <div className="tile-subtext">
              {remMin} min{' '}
              {landingSequence.delayMinutes > 0 && (
                <span className="highlight-delay">(+{landingSequence.delayMinutes}m delay)</span>
              )}
            </div>
          </div>
        </div>

        {/* 3. RUNWAY & FOG VISIBILITY */}
        <div className="bottom-strip-tile" onClick={onOpenFlightStatus} role="button" tabIndex={0}>
          <div className="tile-icon-col" style={{ fontSize: '1.35rem', color: '#F5A623' }}>
            {isFogActive ? '🌫' : '🛣'}
          </div>
          <div className="tile-content-col">
            <div className="tile-label">RUNWAY / WX</div>
            <div className="tile-value">{activeRwy}</div>
            <div className="tile-subtext" style={isFogActive ? { color: '#F5A623', fontWeight: 700 } : undefined}>
              {isFogActive
                ? `FOG ${visMeters}m · CAT IIIB`
                : conditions.approachType ?? 'ILS'}
            </div>
          </div>
        </div>

        {/* 4. PRIORITY */}
        <div className="bottom-strip-tile" onClick={onOpenFlightStatus} role="button" tabIndex={0}>
          <div className="tile-icon-col" style={{ fontSize: '1.35rem', color: '#F5A623' }}>
            ︽
          </div>
          <div className="tile-content-col">
            <div className="tile-label">PRIORITY</div>
            <div
              className="tile-value"
              style={isFogActive || (hasFuel && fuelEnduranceMin < 40) ? { color: '#F5A623' } : undefined}
            >
              {isControllerEstimate
                ? `Seq #${landingSequence.sequenceNumber}`
                : isFogActive
                ? 'LVP Priority'
                : hasFuel && fuelEnduranceMin < 40
                ? 'Min Fuel'
                : 'Normal'}
            </div>
            <div className="tile-subtext">
              {isControllerEstimate
                ? 'Controller Estimate'
                : `Sequence #${landingSequence.sequenceNumber} of ${landingSequence.totalInSequence}`}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
