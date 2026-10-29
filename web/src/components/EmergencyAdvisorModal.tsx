import React, { useState, useEffect } from 'react';
import { useAtcStore } from '../store/useAtcStore';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Fuel,
  Plane,
  RefreshCw,
  Send,
  FileCheck,
  Info,
  Lock,
} from 'lucide-react';

const API_BASE = `http://${window.location.hostname || 'localhost'}:8000`;

interface EmergencyAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAircraftId?: string | null;
}

export const EmergencyAdvisorModal: React.FC<EmergencyAdvisorModalProps> = ({
  isOpen,
  onClose,
  initialAircraftId,
}) => {
  const aircraftMap = useAtcStore((s) => s.aircraft);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const approvedSequenceAdvisory = useAtcStore((s) => s.approvedSequenceAdvisory);
  const updateAircraft = useAtcStore((s) => s.updateAircraft);

  const arrivalAircraft = Object.values(aircraftMap).filter((a) =>
    ['ARRIVAL', 'APPROACH', 'FINAL', 'HOLDING'].includes(a.flightPhase)
  );

  const [targetId, setTargetId] = useState<string>(initialAircraftId || 'FDB512');
  const [evaluation, setEvaluation] = useState<any | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [approving, setApproving] = useState<boolean>(false);
  const [approvalBanner, setApprovalBanner] = useState<string | null>(null);
  const [commandBanner, setCommandBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialAircraftId && aircraftMap[initialAircraftId]) {
      setTargetId(initialAircraftId);
    }
  }, [initialAircraftId, aircraftMap]);

  const runEvaluation = async (acId: string) => {
    if (!acId) return;
    setLoading(true);
    setErrorMsg(null);
    setApprovalBanner(null);
    setCommandBanner(null);
    try {
      const res = await fetch(`${API_BASE}/api/risk-advisor/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyAircraftId: acId,
          includeAiExplanation: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Evaluation request failed');
      }
      const data = await res.json();
      setEvaluation(data);
      if (data.recommendedCandidates && data.recommendedCandidates.length > 0) {
        setSelectedCandidateId(data.recommendedCandidates[0].candidateId);
      } else {
        setSelectedCandidateId('BASELINE_CURRENT_ORDER');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Unable to evaluate emergency sequence.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && targetId) {
      runEvaluation(targetId);
    }
  }, [isOpen, targetId]);

  if (!isOpen) return null;

  const targetAc = aircraftMap[targetId];

  const handleConfirmDeclaration = async (
    declType: 'NONE' | 'PAN_PAN' | 'MAYDAY',
    declStatus: 'NONE' | 'UNCONFIRMED' | 'CONFIRMED'
  ) => {
    try {
      const ctrlId = activeControllerId === 'ALL' ? 'CTRL-ARR-01' : activeControllerId;
      const res = await fetch(`${API_BASE}/api/risk-advisor/declaration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId: targetId,
          declarationType: declType,
          declarationStatus: declStatus,
          controllerId: ctrlId,
        }),
      });
      if (res.ok) {
        const updatedAc = await res.json();
        updateAircraft(updatedAc);
        await runEvaluation(targetId);
      }
    } catch {
      setErrorMsg('Failed to update declaration status.');
    }
  };

  const handleToggleRunwayState = async (
    runway: string,
    status: 'OPEN' | 'CLOSED' | 'LVO_DEDICATED_DEPARTURE'
  ) => {
    try {
      const serviceable = status === 'OPEN';
      const mode =
        status === 'CLOSED'
          ? 'CLOSED'
          : status === 'LVO_DEDICATED_DEPARTURE'
          ? 'DEPARTURE'
          : 'MIXED';
      await fetch(`${API_BASE}/api/risk-advisor/runway-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runway,
          serviceable,
          status,
          mode,
          smrServiceable: true,
          reason: status === 'CLOSED' ? 'Controller manual runway closure' : null,
        }),
      });
      await runEvaluation(targetId);
    } catch {
      setErrorMsg('Failed to update runway operational state.');
    }
  };

  // Step 2 (Separate from Evaluation and Separate from Formal ATC Clearance):
  // Controller approves estimated sequence advisory
  const handleApproveAdvisorySequence = async (candId: string) => {
    setApproving(true);
    setApprovalBanner(null);
    setErrorMsg(null);
    try {
      const ctrlId = activeControllerId === 'ALL' ? 'CTRL-ARR-01' : activeControllerId;
      const res = await fetch(`${API_BASE}/api/risk-advisor/approve-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyAircraftId: targetId,
          candidateId: candId,
          controllerId: ctrlId,
          controllerNotes: `Approved via Emergency Sequence Risk Advisor (${candId})`,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Approval failed');
      }
      const adv = await res.json();
      setApprovalBanner(
        `Approved Estimated Sequence Advisory (${adv.advisoryId}): '${adv.candidateLabel}' at ${adv.approvedAtUtc}. ` +
          `Displayed as CONTROLLER_APPROVED_ESTIMATE on ground & pilot displays. No ATC clearance has been issued.`
      );
    } catch (e: any) {
      setErrorMsg(e.message || 'Unable to approve sequence advisory.');
    } finally {
      setApproving(false);
    }
  };

  // Step 3 (Separate Formal Operational ATC Command via existing command workflow)
  const handleIssueFormalCommand = async (cand: any) => {
    if (!cand) return;
    setCommandBanner(null);
    setErrorMsg(null);
    try {
      const ctrlId = activeControllerId === 'ALL' ? 'CTRL-ARR-01' : activeControllerId;
      const isRwyChange =
        targetAc && cand.emergencyRunway && cand.emergencyRunway !== targetAc.assignedRunway;
      const instructionType = isRwyChange ? 'RUNWAY_CHANGE' : 'APPROACH_CLEARANCE';
      const displayText = isRwyChange
        ? `${targetId}, sidestep approved to Runway ${cand.emergencyRunway}, cleared ILS approach RWY ${cand.emergencyRunway} (Sequence #${
            cand.perAircraftImpacts?.find((i: any) => i.callsign === targetId)
              ?.proposedRunwaySequenceNumber || 1
          })`
        : `${targetId}, priority direct approach approved Runway ${cand.emergencyRunway}, cleared ILS RWY ${cand.emergencyRunway}`;

      const res = await fetch(`${API_BASE}/demo/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId: targetId,
          controllerId: ctrlId,
          instructionType,
          newRunway: isRwyChange ? cand.emergencyRunway : undefined,
          approach: `ILS ${cand.emergencyRunway}`,
          displayText,
        }),
      });
      if (res.ok) {
        const cmd = await res.json();
        setCommandBanner(
          `Formal ATC Command ${cmd.commandId} (${cmd.instructionType}) SENT to ${targetId}: "${cmd.displayText}". Awaiting pilot WILCO.`
        );
      }
    } catch {
      setErrorMsg('Failed to issue formal ATC command.');
    }
  };

  // Find currently selected plan to inspect in the per-aircraft impact table
  const allPlans: any[] = [];
  if (evaluation) {
    if (evaluation.recommendedCandidates) {
      allPlans.push(...evaluation.recommendedCandidates);
    }
    if (evaluation.baseline) {
      allPlans.push(evaluation.baseline);
    }
    if (evaluation.fcfsBaseline) {
      allPlans.push(evaluation.fcfsBaseline);
    }
    if (evaluation.rejectedCandidates) {
      allPlans.push(...evaluation.rejectedCandidates);
    }
  }
  const activePlan =
    allPlans.find((p) => p.candidateId === selectedCandidateId) || evaluation?.baseline || null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-advisor-title"
    >
      <div className="bg-[#0B1220] border border-[#223554] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-[#111D33] via-[#172642] to-[#1D1B38] border-b border-[#243757] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 id="emergency-advisor-title" className="text-base font-bold tracking-tight text-white">
                  Emergency Sequence Change Risk Advisor
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  {evaluation?.policyVersion || 'OMDB-KC-2026.10-v1.0.0'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  DECISION SUPPORT ONLY — NON-AUTONOMOUS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Deterministic Kinematic, Wake/LVO Separation & Fuel-Reserve Impact Evaluator (Never Mutates State or Issues Clearances)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#16233A] hover:bg-[#1F3150] text-slate-300 transition-colors"
            title="Close Advisor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Control & Declaration Verification Bar */}
        <div className="px-5 py-3 bg-[#0F1829] border-b border-[#1D2E4A] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase mb-0.5">
                Target Arrival Aircraft
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="bg-[#080E1A] border border-[#263B5E] rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-400"
              >
                {arrivalAircraft.map((a) => (
                  <option key={a.callsign} value={a.callsign}>
                    {a.callsign} ({a.aircraftType}/{a.wakeCategory}) — RWY {a.assignedRunway} —{' '}
                    {a.priority.level} [{a.priority.declarationType || 'NONE'}]
                  </option>
                ))}
              </select>
            </div>

            {/* Pilot Declaration Verification Controls */}
            {targetAc && (
              <div className="bg-[#131F35] border border-[#223656] rounded-lg px-3 py-1.5 flex items-center space-x-2">
                <div className="text-[10px] font-mono">
                  <div className="text-slate-400 uppercase">Declaration Status (GCAA eAIC 2020-06)</div>
                  <div className="font-bold text-white">
                    Type:{' '}
                    <span
                      className={
                        targetAc.priority.declarationType === 'MAYDAY'
                          ? 'text-rose-400'
                          : targetAc.priority.declarationType === 'PAN_PAN'
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }
                    >
                      {targetAc.priority.declarationType || 'NONE'}
                    </span>{' '}
                    | Status:{' '}
                    <span
                      className={
                        targetAc.priority.declarationStatus === 'CONFIRMED'
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                      }
                    >
                      {targetAc.priority.declarationStatus || 'NONE'}
                    </span>
                  </div>
                </div>
                <div className="flex space-x-1 pl-2 border-l border-[#253B5E]">
                  <button
                    onClick={() => handleConfirmDeclaration('MAYDAY', 'CONFIRMED')}
                    className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-rose-600/80 hover:bg-rose-500 text-white"
                    title="Confirm Pilot MAYDAY Declaration via RTF"
                  >
                    Confirm MAYDAY
                  </button>
                  <button
                    onClick={() => handleConfirmDeclaration('PAN_PAN', 'CONFIRMED')}
                    className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-amber-600/80 hover:bg-amber-500 text-white"
                    title="Confirm Pilot PAN PAN Declaration via RTF"
                  >
                    Confirm PAN PAN
                  </button>
                  <button
                    onClick={() => handleConfirmDeclaration('NONE', 'NONE')}
                    className="px-2 py-1 rounded text-[10px] font-mono bg-slate-700 hover:bg-slate-600 text-slate-200"
                    title="Clear Confirmed Declaration"
                  >
                    Reset Decl
                  </button>
                </div>
              </div>
            )}

            {/* Runway Quick State Controls */}
            <div className="bg-[#131F35] border border-[#223656] rounded-lg px-3 py-1.5 flex items-center space-x-2 text-[10px] font-mono">
              <span className="text-slate-400 uppercase">RWY 30R Mode:</span>
              <button
                onClick={() => handleToggleRunwayState('30R', 'OPEN')}
                className="px-1.5 py-0.5 rounded bg-emerald-700/60 hover:bg-emerald-600 text-emerald-100"
              >
                30R OPEN
              </button>
              <button
                onClick={() => handleToggleRunwayState('30R', 'CLOSED')}
                className="px-1.5 py-0.5 rounded bg-rose-700/60 hover:bg-rose-600 text-rose-100"
              >
                30R CLOSED
              </button>
            </div>
          </div>

          <button
            onClick={() => runEvaluation(targetId)}
            disabled={loading}
            className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center space-x-1.5 shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Evaluating...' : 'Evaluate Snapshot (Read-Only)'}</span>
          </button>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/60 text-xs text-rose-200 font-mono flex items-center space-x-2">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {approvalBanner && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/60 text-xs text-emerald-200 font-mono flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{approvalBanner}</span>
            </div>
          )}

          {commandBanner && (
            <div className="p-3 rounded-xl bg-purple-950/60 border border-purple-500/60 text-xs text-purple-200 font-mono flex items-center space-x-2">
              <Send className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{commandBanner}</span>
            </div>
          )}

          {evaluation && (
            <>
              {/* Evaluation Gate / Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-4 ${
                  evaluation.evaluationStatus === 'FEASIBLE_CANDIDATES_AVAILABLE'
                    ? 'bg-emerald-950/25 border-emerald-500/40'
                    : evaluation.evaluationStatus === 'MANUAL_REVIEW_REQUIRED'
                    ? 'bg-amber-950/30 border-amber-500/50'
                    : 'bg-rose-950/30 border-rose-500/50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        evaluation.evaluationStatus === 'FEASIBLE_CANDIDATES_AVAILABLE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : evaluation.evaluationStatus === 'MANUAL_REVIEW_REQUIRED'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {evaluation.evaluationStatus}
                    </span>
                    <span className="text-xs font-mono text-slate-300">
                      Evaluated at {evaluation.evaluatedAtUtc} | Max Telemetry Age:{' '}
                      {evaluation.freshnessSummary?.maxObservedFreshnessSec ?? 0}s (Limit:{' '}
                      {evaluation.freshnessSummary?.staleThresholdSec ?? 30}s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-sans">{evaluation.statusSummary}</p>
                  {evaluation.statusReasons && evaluation.statusReasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {evaluation.statusReasons.map((r: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0A1220] border border-[#253B5E] text-slate-300"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Approved Advisory Indicator */}
                {approvedSequenceAdvisory && (
                  <div className="shrink-0 bg-cyan-950/50 border border-cyan-500/40 rounded-lg p-2.5 text-[10px] font-mono text-cyan-200 max-w-xs">
                    <div className="font-bold text-cyan-300 uppercase">
                      Active Controller-Approved Estimate
                    </div>
                    <div>
                      {approvedSequenceAdvisory.emergencyAircraftId}:{' '}
                      {approvedSequenceAdvisory.candidateLabel}
                    </div>
                    <div className="text-cyan-400/80">
                      Approved by {approvedSequenceAdvisory.approvedByControllerId} @{' '}
                      {approvedSequenceAdvisory.approvedAtUtc}
                    </div>
                  </div>
                )}
              </div>

              {/* Candidate Comparison Strip: Baseline vs FCFS vs Feasible Options */}
              <div>
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Sequence Comparison: Baseline vs Feasible Resequencing Candidates (Click to Inspect Full Impact Table)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Current Baseline Card */}
                  {evaluation.baseline && (
                    <div
                      onClick={() => setSelectedCandidateId(evaluation.baseline.candidateId)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedCandidateId === evaluation.baseline.candidateId
                          ? 'bg-[#16243D] border-cyan-400 shadow-lg'
                          : 'bg-[#101A2D] border-[#1F3252] hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 font-bold">
                          CURRENT ORDER (BASELINE)
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          RWY {evaluation.baseline.emergencyRunway}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white mb-2">
                        {evaluation.baseline.label}
                      </p>
                      <div className="space-y-1 text-[11px] font-mono text-slate-300">
                        <div>
                          {targetId} ETA:{' '}
                          <span className="text-white font-bold">
                            {evaluation.baseline.emergencyProposedLandingTimeUtc.slice(11, 19)}Z
                          </span>
                        </div>
                        <div>
                          {targetId} Reserve Margin:{' '}
                          <span className="text-amber-300 font-bold">
                            {evaluation.baseline.emergencyLandingFuelMarginKg !== null
                              ? `${evaluation.baseline.emergencyLandingFuelMarginKg} kg`
                              : 'UNKNOWN'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          Order: {evaluation.baseline.proposedOrder.slice(0, 6).join(' → ')}...
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Up to 3 Feasible Candidates */}
                  {evaluation.recommendedCandidates &&
                    evaluation.recommendedCandidates.map((cand: any) => (
                      <div
                        key={cand.candidateId}
                        onClick={() => setSelectedCandidateId(cand.candidateId)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          selectedCandidateId === cand.candidateId
                            ? 'bg-[#15283E] border-emerald-400 shadow-lg'
                            : 'bg-[#101E30] border-emerald-500/40 hover:border-emerald-400/80'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                              OPTION #{cand.recommendedRank} (FEASIBLE)
                            </span>
                            <span className="text-[10px] font-mono text-cyan-300 font-bold">
                              RWY {cand.emergencyRunway}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-white mb-1.5">{cand.label}</p>
                          <div className="space-y-1 text-[11px] font-mono text-slate-200">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Emergency Time Saved:</span>
                              <span className="text-emerald-400 font-bold">
                                +{cand.emergencyTimeGainedMin} min ({cand.emergencyTimeGainedSec}s)
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">{targetId} Fuel Margin:</span>
                              <span className="text-white font-bold">
                                {cand.emergencyLandingFuelMarginKg} kg
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Displaced Flights:</span>
                              <span className="text-amber-300 font-bold">
                                {cand.displacedAircraftCount} (+{cand.totalAddedDelayMin}m total)
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min Displaced Margin:</span>
                              <span className="text-cyan-300 font-bold">
                                {cand.minDisplacedFuelMarginKg !== null
                                  ? `${cand.minDisplacedFuelMarginKg} kg (${cand.worstDisplacedCallsign})`
                                  : 'None displaced'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate pt-1">
                              Order: {cand.proposedOrder.slice(0, 6).join(' → ')}...
                            </div>
                          </div>
                        </div>

                        {/* Separate Action Buttons: Approve Advisory vs Issue ATC Command */}
                        <div className="mt-3 pt-2 border-t border-[#223959] flex flex-col gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveAdvisorySequence(cand.candidateId);
                            }}
                            disabled={approving}
                            className="w-full py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono font-bold flex items-center justify-center space-x-1"
                            title="Approve Estimated Sequence Advisory (Does NOT issue an ATC clearance)"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>1. Approve Estimated Sequence (Advisory Only)</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleIssueFormalCommand(cand);
                            }}
                            className="w-full py-1.5 px-2 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white text-[10px] font-mono font-bold flex items-center justify-center space-x-1"
                            title="Send Formal Operational ATC Clearance via Data Link Command Workflow"
                          >
                            <Send className="w-3 h-3" />
                            <span>2. Issue Formal ATC Clearance Command</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Per-Aircraft Impact Table for Selected Plan */}
              {activePlan && (
                <div className="bg-[#0F182A] border border-[#1E304F] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#142038] border-b border-[#223556] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Plane className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-mono font-bold uppercase text-white">
                        Per-Aircraft Impact Breakdown — {activePlan.label}
                      </h4>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          activePlan.feasible
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {activePlan.feasible ? 'FEASIBLE' : 'INFEASIBLE / REJECTED'}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-300">
                      Proposed Global Sequence: {activePlan.proposedOrder.join(' → ')}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead>
                        <tr className="bg-[#0B1322] text-slate-400 border-b border-[#1E2F4D] uppercase text-[10px]">
                          <th className="py-2 px-3">Seq (Base→Prop)</th>
                          <th className="py-2 px-3">Callsign (Type/Wake)</th>
                          <th className="py-2 px-3">State / Slot</th>
                          <th className="py-2 px-3">RWY (Base→Prop)</th>
                          <th className="py-2 px-3">Landing UTC (Δ Time)</th>
                          <th className="py-2 px-3">Added Hold</th>
                          <th className="py-2 px-3">Wake / LVO Spacing Behind Leader</th>
                          <th className="py-2 px-3">Landing Fuel Margin (Δ vs Base)</th>
                          <th className="py-2 px-3">Constraint / Blocker Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#182640]">
                        {activePlan.perAircraftImpacts.map((imp: any) => {
                          const isTarget = imp.isEmergencyTarget;
                          const isDisplaced = imp.landingTimeDeltaSec > 5.0;
                          return (
                            <tr
                              key={imp.callsign}
                              className={
                                isTarget
                                  ? 'bg-amber-500/10 text-amber-100'
                                  : isDisplaced
                                  ? 'bg-rose-950/15 text-slate-200'
                                  : 'text-slate-300'
                              }
                            >
                              <td className="py-2 px-3 font-bold">
                                #{imp.baselineSequenceNumber} → #{imp.proposedSequenceNumber}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-bold text-white">{imp.callsign}</span>{' '}
                                <span className="text-slate-400">
                                  ({imp.aircraftType}/{imp.wakeCategory})
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                {isTarget && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 text-[10px] font-bold mr-1">
                                    TARGET ({imp.declarationType})
                                  </span>
                                )}
                                {imp.isCommittedSlot ? (
                                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] inline-flex items-center space-x-1">
                                    <Lock className="w-2.5 h-2.5 mr-0.5" />
                                    <span>FROZEN</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">{imp.priorityLevel}</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {imp.baselineRunway} (#{imp.baselineRunwaySequenceNumber}) →{' '}
                                <span
                                  className={
                                    imp.runwayChanged ? 'text-amber-300 font-bold' : 'text-white'
                                  }
                                >
                                  {imp.proposedRunway} (#{imp.proposedRunwaySequenceNumber})
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span>{imp.proposedLandingTimeUtc.slice(11, 19)}Z</span>{' '}
                                {imp.landingTimeDeltaSec !== 0 && (
                                  <span
                                    className={
                                      imp.landingTimeDeltaSec < 0
                                        ? 'text-emerald-400 font-bold'
                                        : 'text-rose-400 font-bold'
                                    }
                                  >
                                    ({imp.landingTimeDeltaSec > 0 ? '+' : ''}
                                    {imp.landingTimeDeltaMin}m)
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {imp.addedHoldingTimeSec > 0 ? (
                                  <span className="text-amber-300">
                                    +{imp.addedHoldingTimeMin}m ({imp.addedHoldingTimeSec}s)
                                  </span>
                                ) : (
                                  <span className="text-slate-500">0m</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-[10px]">
                                {imp.leaderCallsign ? (
                                  <span>
                                    Behind {imp.leaderCallsign}: {imp.requiredSeparationDistanceNm}{' '}
                                    NM / {imp.requiredSeparationBehindLeaderSec}s (
                                    {imp.governingSeparationRule})
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Lead on RWY {imp.proposedRunway}</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {imp.fuelStatus === 'UNKNOWN' || imp.landingFuelMarginKg === null ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 font-bold">
                                    UNKNOWN (Review Req)
                                  </span>
                                ) : (
                                  <div>
                                    <span
                                      className={`font-bold ${
                                        imp.fuelStatus === 'BELOW_RESERVE'
                                          ? 'text-rose-400'
                                          : imp.fuelStatus === 'NEAR_RESERVE'
                                          ? 'text-amber-300'
                                          : 'text-emerald-400'
                                      }`}
                                    >
                                      {imp.landingFuelMarginKg} kg
                                    </span>{' '}
                                    <span className="text-[10px] text-slate-400">
                                      ({imp.fuelStatus})
                                    </span>
                                    {imp.fuelMarginDeltaKg !== 0 && (
                                      <span
                                        className={`ml-1 text-[10px] ${
                                          imp.fuelMarginDeltaKg > 0
                                            ? 'text-emerald-400'
                                            : 'text-rose-400'
                                        }`}
                                      >
                                        [{imp.fuelMarginDeltaKg > 0 ? '+' : ''}
                                        {imp.fuelMarginDeltaKg} kg]
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {imp.constraintFailures && imp.constraintFailures.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {imp.constraintFailures.map((cf: string, i: number) => (
                                      <div
                                        key={i}
                                        className="text-[10px] text-rose-300 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/40"
                                      >
                                        {cf}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-emerald-400 text-[10px]">PASS</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Bottom Grid: Rejected Candidates & Stress Scenarios & AI Explanation */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Rejected Alternatives & Clear Blockers */}
                <div className="bg-[#0F182A] border border-[#1E304F] rounded-xl p-3.5">
                  <div className="flex items-center space-x-2 mb-2">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <h4 className="text-xs font-mono font-bold uppercase text-white">
                      Rejected Alternatives & Hard Constraint Blockers (
                      {evaluation.rejectedCandidates?.length || 0})
                    </h4>
                  </div>
                  {evaluation.rejectedCandidates && evaluation.rejectedCandidates.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {evaluation.rejectedCandidates.map((rc: any) => (
                        <div
                          key={rc.candidateId}
                          onClick={() => setSelectedCandidateId(rc.candidateId)}
                          className={`p-2.5 rounded-lg border cursor-pointer text-xs font-mono ${
                            selectedCandidateId === rc.candidateId
                              ? 'bg-rose-950/40 border-rose-400'
                              : 'bg-[#0A111F] border-rose-500/30 hover:border-rose-400/60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-rose-200">{rc.label}</span>
                            <span className="text-[10px] text-rose-400">REJECTED (Click to View)</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {rc.hardConstraintFailures.map((f: string, idx: number) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/40"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-mono">
                      No rejected candidate alternatives in this evaluation.
                    </p>
                  )}
                </div>

                {/* Deterministic Uncertainty Stress Scenarios */}
                <div className="bg-[#0F182A] border border-[#1E304F] rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-mono font-bold uppercase text-white">
                        Deterministic Stress Scenarios ({activePlan?.candidateId})
                      </h4>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      SCENARIO RESULTS — NOT CALIBRATED PROBABILITIES
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono mb-2">
                    {evaluation.uncertaintyAssumptions?.disclaimer}
                  </p>
                  {activePlan?.stressScenarioResults && (
                    <table className="w-full text-left border-collapse text-[10px] font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-[#1E2F4D]">
                          <th className="py-1 px-2">Scenario</th>
                          <th className="py-1 px-2">Perturbation</th>
                          <th className="py-1 px-2">{targetId} Margin</th>
                          <th className="py-1 px-2">Worst Displaced</th>
                          <th className="py-1 px-2">Outcome</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#182640]">
                        {activePlan.stressScenarioResults.map((sc: any) => (
                          <tr key={sc.scenarioId}>
                            <td className="py-1.5 px-2 text-slate-200 font-bold">{sc.label}</td>
                            <td className="py-1.5 px-2 text-slate-400">
                              ETA +{sc.etaDeltaSec}s, Burn ×{sc.fuelBurnMultiplier}, ROT +
                              {sc.rotDeltaSec}s
                            </td>
                            <td className="py-1.5 px-2 text-white">
                              {sc.emergencyLandingFuelMarginKg !== null
                                ? `${sc.emergencyLandingFuelMarginKg} kg`
                                : 'UNKNOWN'}
                            </td>
                            <td className="py-1.5 px-2 text-slate-300">
                              {sc.worstDisplacedFuelMarginKg !== null
                                ? `${sc.worstDisplacedFuelMarginKg} kg (${sc.worstDisplacedCallsign})`
                                : 'N/A'}
                            </td>
                            <td className="py-1.5 px-2">
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  sc.feasibleUnderStress
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {sc.feasibleUnderStress ? 'PASS' : 'FAIL'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Grounded Plain-Language Explanation */}
              {evaluation.llmExplanation && (
                <div className="bg-[#0D1627] border border-cyan-500/30 rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <Info className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-mono font-bold uppercase text-cyan-300">
                        Plain-Language Explanation ({evaluation.llmExplanation.source})
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {evaluation.llmExplanation.guardrailNote}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-sans leading-relaxed">
                    {evaluation.llmExplanation.explanation}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
