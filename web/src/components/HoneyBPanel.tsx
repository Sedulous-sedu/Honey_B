import React, { useState, useEffect } from 'react';
import { useAtcStore, resolveSelectedAircraft } from '../store/useAtcStore';
import {
  Send,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Edit3,
  Sliders,
  ListChecks,
  Terminal,
} from 'lucide-react';
import { EmergencyAdvisorModal } from './EmergencyAdvisorModal';
import { Suggestion } from '../types';

export const HoneyBPanel: React.FC = () => {
  const suggestions = useAtcStore((s) => s.suggestions);
  const aircraft = useAtcStore((s) => s.aircraft);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const selectedAircraftId = useAtcStore((s) => s.selectedAircraftId);
  const sendCommand = useAtcStore((s) => s.sendCommand);
  const sendCustomCommand = useAtcStore((s) => s.sendCustomCommand);
  const approvedSequenceAdvisory = useAtcStore((s) => s.approvedSequenceAdvisory);
  const composerDraft = useAtcStore((s) => s.composerDraft);
  const setComposerDraft = useAtcStore((s) => s.setComposerDraft);
  const dataMode = useAtcStore((s) => s.dataMode);

  const weather = useAtcStore((s) => s.weather);
  const triggerFog = useAtcStore((s) => s.triggerFog);
  const [advisorOpen, setAdvisorOpen] = useState(false);

  const selectedAc = resolveSelectedAircraft(aircraft, selectedAircraftId);
  const isFixtureSim = dataMode === 'FIXTURE_SIMULATION';

  // Free-form ATC Command & Pilot Options Composer state
  const [composerMode, setComposerMode] = useState<'OPTIONS' | 'COMMAND'>('OPTIONS');
  const [targetFlightId, setTargetFlightId] = useState<string>(selectedAc?.callsign || 'UAE231');
  const [instructionType, setInstructionType] = useState<string>('INFORMATION');
  const [commandText, setCommandText] = useState<string>(
    'UAE231 ATC OPTIONS — OPTION 1: Sidestep RWY 30R ILS CAT IIIB Autoland (RVR 450m, zero holding delay) | OPTION 2: Hold at DXB VOR 4000 ft for RWY 30L LVP sequence (EFC +8 min) — Advise crew preference.'
  );
  const [optionA, setOptionA] = useState<string>('Sidestep RWY 30R ILS CAT IIIB Autoland (RVR 450m, zero holding delay)');
  const [optionB, setOptionB] = useState<string>('Hold at DXB VOR 4000 ft for RWY 30L LVP sequence (EFC +8 min)');
  const [newRunway, setNewRunway] = useState<string>('');
  const [targetSpeedKt, setTargetSpeedKt] = useState<string>('');
  const [targetAltitudeFt, setTargetAltitudeFt] = useState<string>('');
  const [relatedSuggestionId, setRelatedSuggestionId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState<boolean>(false);
  const [transmitBanner, setTransmitBanner] = useState<string | null>(null);

  // Sync target aircraft when user clicks a flight on radar or traffic list
  useEffect(() => {
    if (selectedAc) {
      setTargetFlightId(selectedAc.callsign);
    }
  }, [selectedAc]);

  // Sync when a suggestion or modal loads a draft into the composer
  useEffect(() => {
    if (composerDraft) {
      setTargetFlightId(composerDraft.aircraftId);
      setInstructionType(composerDraft.instructionType || 'INFORMATION');
      setCommandText(composerDraft.displayText || '');
      if (composerDraft.mode) {
        setComposerMode(composerDraft.mode);
      } else {
        setComposerMode('COMMAND');
      }
      if (composerDraft.optionA) setOptionA(composerDraft.optionA);
      if (composerDraft.optionB) setOptionB(composerDraft.optionB);
      setNewRunway(composerDraft.newRunway || '');
      setTargetSpeedKt(composerDraft.targetSpeedKt ? String(composerDraft.targetSpeedKt) : '');
      setTargetAltitudeFt(composerDraft.targetAltitudeFt ? String(composerDraft.targetAltitudeFt) : '');
      setRelatedSuggestionId(composerDraft.relatedSuggestionId);
      setComposerDraft(null);
    }
  }, [composerDraft, setComposerDraft]);

  const allFlights = Object.values(aircraft);

  // Filter suggestions and alerts to the active controller's sector (or show all if 'ALL'), pinning UAE231 first in fixture mode
  const sectorSuggestions = suggestions
    .filter((s) => {
      if (s.status !== 'ACTIVE') return false;
      if (activeControllerId === 'ALL') return true;
      const ac = resolveSelectedAircraft(aircraft, s.aircraftId);
      return ac && (!ac.assignedControllerId || ac.assignedControllerId === activeControllerId);
    })
    .sort((a, b) => {
      if (isFixtureSim) {
        if (a.aircraftId === 'UAE231' && b.aircraftId !== 'UAE231') return -1;
        if (b.aircraftId === 'UAE231' && a.aircraftId !== 'UAE231') return 1;
      }
      return 0;
    });

  // Identify critical alerts from aircraft state
  const alerts: Array<{ id: string; callsign: string; type: 'CRITICAL' | 'WARNING'; title: string; detail: string }> = [];

  const uae231Ac = isFixtureSim ? resolveSelectedAircraft(aircraft, 'UAE231') : null;
  if (weather?.lvp.active && uae231Ac && uae231Ac.fuel.totalKg != null && uae231Ac.fuel.finalReserveKg != null) {
    const marginKg = Math.round(uae231Ac.fuel.totalKg - uae231Ac.fuel.finalReserveKg);
    alerts.push({
      id: 'alert-fog-uae231',
      callsign: 'UAE231',
      type: 'CRITICAL',
      title: `🌫 LVP FOG PRIORITY: UAE231 (B77W)`,
      detail: `Vis ${weather.visibilityM}m (RVR 400m) · RWY 30L spacing 6 NM · Endurance ${Math.round(uae231Ac.fuel.enduranceMin || 0)}m (${marginKg}kg margin). Send 30R Sidestep / Hold Options to Pilot!`
    });
  }

  allFlights.forEach((ac) => {
    if (isFixtureSim && ac.callsign === 'UAE231' && weather?.lvp.active) return; // Already added at top
    if (activeControllerId !== 'ALL' && ac.assignedControllerId && ac.assignedControllerId !== activeControllerId) {
      return;
    }

    if (ac.priority.level === 'MINIMUM_FUEL' || ac.priority.level === 'EMERGENCY') {
      const marginKg =
        ac.fuel.totalKg != null && ac.fuel.finalReserveKg != null
          ? `${Math.round(ac.fuel.totalKg - ac.fuel.finalReserveKg)} kg reserve margin`
          : 'Fuel quantity UNKNOWN (ADS-B)';
      alerts.push({
        id: `alert-fuel-${ac.trackId || ac.callsign}`,
        callsign: ac.callsign,
        type: 'CRITICAL',
        title: `${ac.priority.level}: ${ac.callsign}`,
        detail: `${ac.fuel.enduranceMin ? `${Math.round(ac.fuel.enduranceMin)} min endurance` : 'Emergency squawk / priority'} (${marginKg}). Immediate priority required.`
      });
    } else if (ac.priority.level === 'MEDICAL') {
      alerts.push({
        id: `alert-med-${ac.trackId || ac.callsign}`,
        callsign: ac.callsign,
        type: 'CRITICAL',
        title: `MEDICAL PRIORITY: ${ac.callsign}`,
        detail: `${ac.priority.emergencyNature || 'Passenger cardiac issue'}. Expedite arrival & ambulance.`
      });
    } else if (ac.status === 'UNABLE_TO_LAND') {
      alerts.push({
        id: `alert-cat-${ac.trackId || ac.callsign}`,
        callsign: ac.callsign,
        type: 'WARNING',
        title: `APPROACH LIMIT EXCEEDED: ${ac.callsign}`,
        detail: `Max ${ac.capability.lvpApproach} vs active CAT IIIB fog. Hold or divert.`
      });
    }
  });

  const handleLoadSuggestionIntoComposer = (sug: Suggestion, asOptions: boolean = false) => {
    setTargetFlightId(sug.aircraftId);
    setRelatedSuggestionId(sug.suggestionId);
    if (asOptions) {
      setComposerMode('OPTIONS');
      setInstructionType('INFORMATION');
      setOptionA(sug.displayText);
      setOptionB(`Hold present position / advise alternative crew preference for ${sug.aircraftId}`);
      setCommandText(
        `${sug.aircraftId} ATC OPTIONS — OPTION 1: ${sug.displayText} | OPTION 2: Hold present position & advise crew preference`
      );
    } else {
      setComposerMode('COMMAND');
      setInstructionType(sug.instructionType);
      setCommandText(sug.displayText);
      setNewRunway(sug.params.newRunway || '');
      setTargetSpeedKt(sug.params.targetSpeedKt ? String(sug.params.targetSpeedKt) : '');
      setTargetAltitudeFt(sug.params.targetAltitudeFt ? String(sug.params.targetAltitudeFt) : '');
    }
  };

  const applyQuickOptionPreset = (preset: 'HOLD_OR_DIVERT' | 'SIDESTEP_OR_HOLD' | 'SPEED_OR_DELAY' | 'CONFIRM_DECL') => {
    const cs = targetFlightId || 'UAE231';
    setComposerMode('OPTIONS');
    setInstructionType('INFORMATION');
    if (preset === 'HOLD_OR_DIVERT') {
      const a = `Hold at DXB VOR 4000 ft (EFC +10 min)`;
      const b = `Divert to OMSJ (Sharjah) via immediate climb 5000 ft`;
      setOptionA(a);
      setOptionB(b);
      setCommandText(`${cs} ATC OPTIONS — OPTION 1: ${a} | OPTION 2: ${b}. Advise captain decision.`);
    } else if (preset === 'SIDESTEP_OR_HOLD') {
      const a = `Sidestep to RWY 30R cleared ILS Approach`;
      const b = `Maintain RWY 30L sequence with 6 min holding delay`;
      setOptionA(a);
      setOptionB(b);
      setCommandText(`${cs} ATC OPTIONS — OPTION 1: ${a} | OPTION 2: ${b}. Advise able RWY 30R.`);
    } else if (preset === 'SPEED_OR_DELAY') {
      const a = `Reduce speed to 180 kt until 6 DME`;
      const b = `Enter 1 orbit holding turn at present fix`;
      setOptionA(a);
      setOptionB(b);
      setCommandText(`${cs} ATC OPTIONS — OPTION 1: ${a} | OPTION 2: ${b}. Advise preference.`);
    } else if (preset === 'CONFIRM_DECL') {
      const a = `Confirm formal PAN PAN (Urgency) declaration`;
      const b = `Confirm formal MAYDAY (Distress) declaration or normal operations`;
      setOptionA(a);
      setOptionB(b);
      setCommandText(`${cs} ATC QUERY — Please state formal declaration status: (1) ${a} OR (2) ${b}.`);
    }
  };

  // Sync combined text when Option A or Option B changes in OPTIONS mode
  const handleOptionChange = (which: 'A' | 'B', val: string) => {
    const cs = targetFlightId || 'UAE231';
    const nextA = which === 'A' ? val : optionA;
    const nextB = which === 'B' ? val : optionB;
    if (which === 'A') setOptionA(val);
    else setOptionB(val);
    setCommandText(
      `${cs} ATC OPTIONS — OPTION 1: ${nextA} | OPTION 2: ${nextB} — Advise crew preference.`
    );
  };

  const handleTransmitToPilot = async (e: React.FormEvent) => {
    e.preventDefault();
    const cs = targetFlightId || selectedAircraftId || 'UAE231';
    if (sending) return;

    setSending(true);
    setTransmitBanner(null);

    if (composerMode === 'OPTIONS') {
      // Split options so each option is sent as its own separate selectable command card on the Pilot display
      const rawOptions = [optionA.trim(), optionB.trim()].filter(Boolean);
      const optionsToSend =
        rawOptions.length > 0
          ? rawOptions.map((opt, idx) =>
              opt.match(/^(?:OPTION|OPT)\s*\d+/i) ? opt : `OPTION ${idx + 1}: ${opt}`
            )
          : [commandText.trim()].filter(Boolean);

      const optGrpId = `OPT-GRP-${Date.now()}`;
      let allOk = false;
      for (let idx = 0; idx < optionsToSend.length; idx++) {
        const optText = optionsToSend[idx];
        const ok = await sendCustomCommand({
          aircraftId: cs,
          instructionType: 'INFORMATION',
          displayText: optText,
          newRunway: newRunway.trim() || undefined,
          targetSpeedKt: targetSpeedKt ? Number(targetSpeedKt) : undefined,
          targetAltitudeFt: targetAltitudeFt ? Number(targetAltitudeFt) : undefined,
          relatedSuggestionId,
          optionGroupId: optGrpId,
          optionLabel: `Option ${idx + 1}`,
        });
        if (ok) allOk = true;
      }
      setSending(false);
      if (allOk) {
        setTransmitBanner(
          `Sent ${optionsToSend.length} separated option cards to ${cs} — Each has its own Accept button on Pilot Display.`
        );
        setRelatedSuggestionId(undefined);
      }
      return;
    }

    const finalDisplayText = commandText.trim();
    if (!finalDisplayText) {
      setSending(false);
      return;
    }

    const ok = await sendCustomCommand({
      aircraftId: cs,
      instructionType,
      displayText: finalDisplayText,
      newRunway: newRunway.trim() || undefined,
      targetSpeedKt: targetSpeedKt ? Number(targetSpeedKt) : undefined,
      targetAltitudeFt: targetAltitudeFt ? Number(targetAltitudeFt) : undefined,
      relatedSuggestionId,
    });
    setSending(false);

    if (ok) {
      setTransmitBanner(`Transmitted to ${cs} (${instructionType}): "${finalDisplayText}"`);
      setRelatedSuggestionId(undefined);
    }
  };

  return (
    <div className="w-96 h-full bg-[#0A1830] border-l border-[#1A3A66] flex flex-col select-none overflow-hidden text-[#FFFFFF]">
      {/* Top Gradient Header with Official Honey B Logo */}
      <div className="p-3.5 bg-gradient-to-r from-[#0A1830] via-[#0F2444] to-[#142E55] border-b border-[#F5A623]/40 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2.5">
          <img
            src="/honey-b-logo.jpg"
            alt="Honey B logo"
            className="w-10 h-10 rounded-xl bg-[#FFFFFF] p-0.5 object-contain border-2 border-[#F5A623] shadow-lg"
            draggable={false}
          />
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-sm tracking-tight text-[#FFFFFF]">Honey B</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#F5A623] text-[#0A1830] font-bold">
                ATC CO-PILOT
              </span>
            </div>
            <p className="text-[10px] text-[#FFFFFF]/80 font-mono">
              Divide & Conquer · Pilot Options & Risk Advisor
            </p>
          </div>
        </div>

        <button
          onClick={() => setAdvisorOpen(true)}
          className="px-2.5 py-1.5 rounded-lg bg-[#F5A623] hover:bg-[#F7B84B] text-[#0A1830] text-[10px] font-mono font-bold flex items-center space-x-1 transition-all shadow-md"
          title="Open Deterministic Emergency Sequence Change Risk Advisor"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Emergency Risk Advisor</span>
        </button>
      </div>

      {/* Active Approved Sequence Advisory Banner (if any) */}
      {approvedSequenceAdvisory && (
        <div className="px-3 py-2 bg-[#0F2444] border-b border-[#F5A623]/50 flex items-center justify-between text-[10px] font-mono text-[#FFFFFF]">
          <div className="truncate">
            <span className="font-bold text-[#F5A623]">EST. SEQ APPROVED:</span>{' '}
            {approvedSequenceAdvisory.emergencyAircraftId} ({approvedSequenceAdvisory.candidateLabel})
          </div>
          <button
            onClick={() => setAdvisorOpen(true)}
            className="ml-2 px-1.5 py-0.5 rounded bg-[#F5A623] text-[#0A1830] hover:bg-[#F7B84B] font-bold shrink-0"
          >
            Inspect
          </button>
        </div>
      )}

      {/* Main Scrollable Content: Section 1 (Alerts) + Section 2 (Suggestions with Edit/Options) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* SECTION 1: ACTIVE ALERTS */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#F5A623]">
              Active Alerts ({alerts.length})
            </span>
            {!weather?.lvp.active && (
              <button
                onClick={() => triggerFog('DENSE_FOG')}
                className="px-2 py-0.5 rounded bg-[#F5A623] hover:bg-[#F7B84B] text-[#0A1830] text-[9px] font-mono font-bold shadow-sm"
              >
                🌫 Trigger Fog for UAE231 Demo
              </button>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="p-2.5 rounded-lg bg-[#08172C] border border-[#1A3A66] text-xs text-[#FFFFFF]/70 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-[#F5A623]" />
              <span>All sector flights within nominal safety envelopes.</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {alerts.map((al) => (
                <div
                  key={al.id}
                  onClick={() => setTargetFlightId(al.callsign)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    al.type === 'CRITICAL'
                      ? 'bg-red-950/30 border-red-500'
                      : 'bg-[#08172C] border-[#F5A623]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#F5A623]" />
                      <span className="text-xs font-mono font-bold text-[#FFFFFF]">
                        {al.title}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetFlightId(al.callsign);
                        setAdvisorOpen(true);
                      }}
                      className="px-2 py-0.5 rounded bg-[#F5A623] hover:bg-[#F7B84B] text-[9px] font-mono font-bold text-[#0A1830]"
                    >
                      Evaluate Risk
                    </button>
                  </div>
                  <p className="text-[11px] text-[#FFFFFF]/85 mt-1 leading-snug">
                    {al.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 2: SUGGESTED COMMANDS (Load to Edit / Offer as Options / Send) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#F5A623] flex items-center space-x-1">
              <Sparkles className="w-3 h-3 text-[#F5A623]" />
              <span>AI Suggested Actions ({sectorSuggestions.length})</span>
            </span>
            <span className="text-[9px] font-mono text-[#FFFFFF]/70">CLICK EDIT TO CUSTOMIZE</span>
          </div>

          {sectorSuggestions.length === 0 ? (
            <div className="p-3 rounded-lg bg-[#08172C] border border-[#1A3A66] text-xs text-[#FFFFFF]/70 font-mono text-center">
              No pending suggestions in this sector. Use the composer below to type any command or pilot options.
            </div>
          ) : (
            <div className="space-y-2">
              {sectorSuggestions.map((sug) => {
                const isHigh = sug.urgency === 'HIGH' || sug.urgency === 'CRITICAL';
                return (
                  <div
                    key={sug.suggestionId}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isHigh
                        ? 'bg-red-950/30 border-red-500 shadow-md'
                        : 'bg-[#08172C] border-[#1A3A66]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#0A1830] text-[#F5A623] border border-[#F5A623]/40">
                            {sug.aircraftId}
                          </span>
                          <span className="text-[11px] font-bold text-[#FFFFFF]">
                            {sug.instructionType}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-[#FFFFFF] mt-1 bg-[#0A1830] px-2 py-1 rounded border border-[#1A3A66]">
                          "{sug.displayText}"
                        </p>
                      </div>
                    </div>

                    <div className="mt-1.5 text-[10px] text-[#FFFFFF]/80">
                      <span className="text-[#F5A623] font-semibold">Why: </span>
                      {sug.reasonText}
                    </div>

                    {/* Action Bar: Edit Command, Offer as Options, or Send Direct */}
                    <div className="mt-2 pt-2 border-t border-[#1A3A66] flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => handleLoadSuggestionIntoComposer(sug, false)}
                        className="flex-1 py-1 px-2 rounded-lg bg-[#0A1830] hover:bg-[#142E55] text-[#FFFFFF] border border-[#F5A623]/60 text-[10px] font-mono font-bold flex items-center justify-center space-x-1 transition-colors"
                        title="Load into composer below to edit wording or parameters before sending"
                      >
                        <Edit3 className="w-3 h-3 text-[#F5A623]" />
                        <span>Edit Command</span>
                      </button>
                      <button
                        onClick={() => handleLoadSuggestionIntoComposer(sug, true)}
                        className="flex-1 py-1 px-2 rounded-lg bg-[#0A1830] hover:bg-[#142E55] text-[#F5A623] border border-[#F5A623]/60 text-[10px] font-mono font-bold flex items-center justify-center space-x-1 transition-colors"
                        title="Turn this suggestion into multiple options for the pilot to review"
                      >
                        <ListChecks className="w-3 h-3 text-[#F5A623]" />
                        <span>Make Options</span>
                      </button>
                      <button
                        onClick={() => sendCommand(sug.aircraftId, sug)}
                        className="py-1 px-2.5 rounded-lg bg-[#F5A623] hover:bg-[#F7B84B] text-[#0A1830] text-[10px] font-mono font-bold flex items-center space-x-1 shadow-sm transition-colors"
                        title="Transmit directly to pilot"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: FREE-FORM ATC COMMAND & PILOT OPTIONS COMPOSER (Replaces Chatbot) */}
      <div className="border-t-2 border-[#F5A623] bg-[#08172C] p-3 flex flex-col space-y-2.5 shadow-2xl">
        {/* Header & Mode Switcher */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#F5A623]" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#FFFFFF]">
              ATC Command & Pilot Options
            </span>
          </div>

          <div className="flex bg-[#0A1830] p-0.5 rounded-lg border border-[#1A3A66]">
            <button
              type="button"
              onClick={() => {
                setComposerMode('OPTIONS');
                setInstructionType('INFORMATION');
                const cs = targetFlightId || 'UAE231';
                setCommandText(
                  `${cs} ATC OPTIONS — OPTION 1: ${optionA} | OPTION 2: ${optionB} — Advise crew preference.`
                );
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center space-x-1 transition-colors ${
                composerMode === 'OPTIONS'
                  ? 'bg-[#F5A623] text-[#0A1830]'
                  : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
              }`}
            >
              <ListChecks className="w-3 h-3" />
              <span>Pilot Options</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setComposerMode('COMMAND');
                if (instructionType === 'INFORMATION') setInstructionType('APPROACH_CLEARANCE');
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center space-x-1 transition-colors ${
                composerMode === 'COMMAND'
                  ? 'bg-[#F5A623] text-[#0A1830]'
                  : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
              }`}
            >
              <Terminal className="w-3 h-3" />
              <span>Type Command</span>
            </button>
          </div>
        </div>

        {/* Target Aircraft + Instruction Type Row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-mono text-[#F5A623] uppercase mb-0.5">
              Target Flight
            </label>
            <select
              value={targetFlightId}
              onChange={(e) => {
                const nextCs = e.target.value;
                setTargetFlightId(nextCs);
                if (composerMode === 'OPTIONS') {
                  setCommandText(
                    `${nextCs} ATC OPTIONS — OPTION 1: ${optionA} | OPTION 2: ${optionB} — Advise crew preference.`
                  );
                }
              }}
              className="w-full bg-[#0A1830] border border-[#1A3A66] focus:border-[#F5A623] rounded-lg px-2 py-1 text-xs font-mono font-bold text-[#FFFFFF] focus:outline-none"
            >
              {allFlights.map((f) => (
                <option key={f.trackId || f.callsign} value={f.callsign}>
                  {f.identity?.callsignObserved || f.callsign} ({f.identity?.operatingAirline?.icao || f.aircraftType} · {f.flightPhase})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-mono text-[#F5A623] uppercase mb-0.5">
              {composerMode === 'OPTIONS' ? 'Quick Option Templates' : 'Instruction Type'}
            </label>
            {composerMode === 'OPTIONS' ? (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    applyQuickOptionPreset(e.target.value as any);
                    e.target.value = '';
                  }
                }}
                className="w-full bg-[#0A1830] border border-[#F5A623]/60 rounded-lg px-2 py-1 text-xs font-mono text-[#FFFFFF] focus:outline-none"
              >
                <option value="" disabled>
                  Load Option Preset...
                </option>
                <option value="HOLD_OR_DIVERT">Hold DXB VOR vs Divert OMSJ</option>
                <option value="SIDESTEP_OR_HOLD">Sidestep RWY 30R vs Hold 30L</option>
                <option value="SPEED_OR_DELAY">Speed 180kt vs Delay Orbit</option>
                <option value="CONFIRM_DECL">Query PAN PAN vs MAYDAY</option>
              </select>
            ) : (
              <select
                value={instructionType}
                onChange={(e) => setInstructionType(e.target.value)}
                className="w-full bg-[#0A1830] border border-[#1A3A66] focus:border-[#F5A623] rounded-lg px-2 py-1 text-xs font-mono font-bold text-[#FFFFFF] focus:outline-none"
              >
                <option value="APPROACH_CLEARANCE">APPROACH CLEARANCE</option>
                <option value="RUNWAY_CHANGE">RUNWAY CHANGE</option>
                <option value="HOLD">HOLD INSTRUCTION</option>
                <option value="SPEED">SPEED CONTROL</option>
                <option value="ALTITUDE">ALTITUDE CLEARANCE</option>
                <option value="HEADING">RADAR VECTOR / HDG</option>
                <option value="DIVERT">DIVERT CLEARANCE</option>
                <option value="INFORMATION">FREE-TEXT ADVISORY</option>
              </select>
            )}
          </div>
        </div>

        {/* Mode-Specific Inputs */}
        {composerMode === 'OPTIONS' ? (
          <div className="space-y-1.5">
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#F5A623] text-[#0A1830] shrink-0">
                OPT 1
              </span>
              <input
                type="text"
                value={optionA}
                onChange={(e) => handleOptionChange('A', e.target.value)}
                placeholder="Type Option 1 for pilot..."
                className="flex-1 bg-[#0A1830] border border-[#1A3A66] focus:border-[#F5A623] rounded-lg px-2 py-1 text-xs font-mono text-[#FFFFFF] focus:outline-none"
              />
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#0F2444] text-[#F5A623] border border-[#F5A623]/60 shrink-0">
                OPT 2
              </span>
              <input
                type="text"
                value={optionB}
                onChange={(e) => handleOptionChange('B', e.target.value)}
                placeholder="Type Option 2 for pilot..."
                className="flex-1 bg-[#0A1830] border border-[#1A3A66] focus:border-[#F5A623] rounded-lg px-2 py-1 text-xs font-mono text-[#FFFFFF] focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            <input
              type="text"
              value={newRunway}
              onChange={(e) => setNewRunway(e.target.value)}
              placeholder="RWY (e.g. 30R)"
              className="bg-[#0A1830] border border-[#1A3A66] focus:border-[#F5A623] rounded-lg px-2 py-1 text-[11px] font-mono text-[#FFFFFF] focus:outline-none"
            />
            <input
              type="number"
              value={targetSpeedKt}
              onChange={(e) => setTargetSpeedKt(e.target.value)}
              placeholder="Speed (kt)"
              className="bg-[#0A1830] border border-[#1A3A66] focus:border-[#F5A623] rounded-lg px-2 py-1 text-[11px] font-mono text-[#FFFFFF] focus:outline-none"
            />
            <input
              type="number"
              value={targetAltitudeFt}
              onChange={(e) => setTargetAltitudeFt(e.target.value)}
              placeholder="Alt (ft)"
              className="bg-[#0A1830] border border-[#1A3A66] focus:border-[#F5A623] rounded-lg px-2 py-1 text-[11px] font-mono text-[#FFFFFF] focus:outline-none"
            />
          </div>
        )}

        {/* Free-Form Editable Message / Clearance Textarea */}
        <form onSubmit={handleTransmitToPilot} className="space-y-2">
          <div>
            <label className="block text-[9px] font-mono text-[#FFFFFF]/80 uppercase mb-0.5">
              {composerMode === 'OPTIONS'
                ? 'Editable Options Message to Pilot (Data Link)'
                : 'Editable ATC Command Text to Pilot'}
            </label>
            <textarea
              rows={2}
              value={commandText}
              onChange={(e) => setCommandText(e.target.value)}
              placeholder={
                composerMode === 'OPTIONS'
                  ? 'Type custom options for the pilot to review and select...'
                  : 'Type any custom ATC clearance or instruction for the pilot...'
              }
              className="w-full bg-[#0A1830] border border-[#F5A623]/60 focus:border-[#F5A623] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#FFFFFF] placeholder-[#FFFFFF]/40 focus:outline-none resize-none"
            />
          </div>

          {transmitBanner && (
            <div className="p-2 rounded-lg bg-[#0F2444] border border-[#F5A623] text-[10px] font-mono text-[#FFFFFF] flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#F5A623] shrink-0" />
              <span className="truncate">{transmitBanner}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full py-2 px-3 rounded-lg bg-[#F5A623] hover:bg-[#F7B84B] disabled:opacity-50 text-[#0A1830] text-xs font-mono font-bold flex items-center justify-center space-x-2 shadow-md transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {sending
                ? 'Transmitting...'
                : composerMode === 'OPTIONS'
                ? `Send Options to ${targetFlightId || 'Pilot'}`
                : `Transmit Command to ${targetFlightId || 'Pilot'}`}
            </span>
          </button>
        </form>
      </div>

      {/* Deterministic Emergency Sequence Change Risk Advisor Modal */}
      <EmergencyAdvisorModal
        isOpen={advisorOpen}
        onClose={() => setAdvisorOpen(false)}
        initialAircraftId={targetFlightId || selectedAircraftId}
      />
    </div>
  );
};
