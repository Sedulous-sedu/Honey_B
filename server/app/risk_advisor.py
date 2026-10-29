"""
Deterministic Emergency Sequence Change Risk Advisor for Honey B (OMDB).

Pure, testable decision-support module independent of Gemini or any LLM API.
Evaluates proposed emergency landing resequencing candidates against:
  - Confirmed emergency declaration status (MAYDAY / PAN PAN vs MINIMUM_FUEL / unconfirmed MEDICAL)
  - AMAN freeze horizon / committed slots
  - Pairwise wake-turbulence separation & LVO longitudinal spacing (GCAA OMDB AIP AD 2.22)
  - Runway occupancy time (ROT), runway mode, and runway serviceability
  - Weather / RVR / ceiling / operator approach eligibility
  - Phase-specific fuel burn and final reserve margins for both emergency and displaced flights
  - Configurable deterministic stress scenarios (NASA NTRS 20120004194)
  - Lexicographic ranking (NASA NTRS 20060053296 / ICAO APAC ATMAS TF/6)

Never mutates live server state and never issues ATC clearances.
"""

import copy
import datetime
from typing import Dict, List, Optional, Any, Tuple
from pydantic import BaseModel, Field

from app.models import (
    AircraftStatePayload,
    WeatherPayload,
    RunwayOperationalState,
    RunwayOperationalStatus,
    RunwayMode,
    FlightPhase,
    PriorityLevel,
    EmergencyDeclarationType,
    DeclarationStatus,
    LvpApproach,
)
from app.knowledge_core import KnowledgeCore, default_knowledge_core


ARRIVAL_PHASES = {
    FlightPhase.ARRIVAL,
    FlightPhase.APPROACH,
    FlightPhase.FINAL,
    FlightPhase.HOLDING,
}

APPROACH_CATEGORY_RANK = {
    "CAT_I": 1,
    "CAT_II": 2,
    "CAT_IIIA": 3,
    "CAT_IIIB": 4,
}


class PerAircraftSequenceImpact(BaseModel):
    callsign: str
    aircraftType: str
    wakeCategory: str
    isEmergencyTarget: bool = False
    declarationType: str = "NONE"
    declarationStatus: str = "NONE"
    priorityLevel: str = "NORMAL"
    isCommittedSlot: bool = False
    committedReason: Optional[str] = None

    baselineRunway: str
    proposedRunway: str
    runwayChanged: bool = False

    baselineSequenceNumber: int
    proposedSequenceNumber: int
    baselineRunwaySequenceNumber: int
    proposedRunwaySequenceNumber: int
    sequenceShift: int = 0

    earliestUnconstrainedEtaUtc: str
    baselineLandingTimeUtc: str
    proposedLandingTimeUtc: str
    landingTimeDeltaSec: float = 0.0
    landingTimeDeltaMin: float = 0.0
    addedHoldingTimeSec: float = 0.0
    addedHoldingTimeMin: float = 0.0

    requiredSeparationBehindLeaderSec: float = 0.0
    requiredSeparationDistanceNm: float = 0.0
    governingSeparationRule: Optional[str] = None
    leaderCallsign: Optional[str] = None

    currentFuelKg: Optional[float] = None
    finalReserveKg: Optional[float] = None
    estimatedLandingFuelKg: Optional[float] = None
    baselineLandingFuelMarginKg: Optional[float] = None
    landingFuelMarginKg: Optional[float] = None
    fuelMarginDeltaKg: Optional[float] = None
    fuelStatus: str = "SAFE"  # SAFE, NEAR_RESERVE, BELOW_RESERVE, UNKNOWN

    constraintFailures: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


classLexicographicTierBreakdown = Dict[str, Any]


class StressScenarioOutcome(BaseModel):
    scenarioId: str
    label: str
    etaDeltaSec: float
    fuelBurnMultiplier: float
    rotDeltaSec: float
    feasibleUnderStress: bool
    emergencyLandingTimeUtc: Optional[str] = None
    emergencyLandingFuelMarginKg: Optional[float] = None
    worstDisplacedCallsign: Optional[str] = None
    worstDisplacedFuelMarginKg: Optional[float] = None
    inducedConstraintFailures: List[str] = Field(default_factory=list)
    epistemicNote: str = "SCENARIO_RESULT_ONLY_NOT_PROBABILITY"


class CandidateSequencePlan(BaseModel):
    candidateId: str
    strategyType: str  # BASELINE, FCFS, EARLIEST_FEASIBLE_INSERTION, NEARBY_SWAP, ALTERNATE_RUNWAY, DUAL_EMERGENCY, REJECTED_PROBE
    label: str
    description: str
    feasible: bool
    recommendedRank: Optional[int] = None

    proposedOrder: List[str]
    runwayOrders: Dict[str, List[str]]

    emergencyCallsign: str
    emergencyRunway: str
    emergencyBaselineLandingTimeUtc: str
    emergencyProposedLandingTimeUtc: str
    emergencyTimeGainedSec: float = 0.0
    emergencyTimeGainedMin: float = 0.0
    emergencyLandingFuelMarginKg: Optional[float] = None
    emergencyFuelStatus: str = "SAFE"

    totalAddedDelaySec: float = 0.0
    totalAddedDelayMin: float = 0.0
    maxDisplacedDelaySec: float = 0.0
    maxDisplacedDelayMin: float = 0.0
    displacedAircraftCount: int = 0
    displacedNearReserveCount: int = 0
    minDisplacedFuelMarginKg: Optional[float] = None
    worstDisplacedCallsign: Optional[str] = None
    runwayChangeCount: int = 0

    hardConstraintFailures: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    lexicographicBreakdown: Dict[str, Any] = Field(default_factory=dict)
    perAircraftImpacts: List[PerAircraftSequenceImpact] = Field(default_factory=list)
    stressScenarioResults: List[StressScenarioOutcome] = Field(default_factory=list)


class InputProvenanceItem(BaseModel):
    callsign: str
    telemetryProvenance: str
    fuelProvenance: str
    priorityProvenance: str
    observedAtUtc: Optional[str] = None
    freshnessSec: float = 0.0
    isStale: bool = False
    missingDataReasons: List[str] = Field(default_factory=list)


class RiskAdvisorEvaluationResult(BaseModel):
    evaluationStatus: str  # FEASIBLE_CANDIDATES_AVAILABLE, NO_FEASIBLE_PLAN, MANUAL_REVIEW_REQUIRED
    statusReasons: List[str] = Field(default_factory=list)
    statusSummary: str
    evaluatedAtUtc: str
    policyVersion: str
    disclaimer: str = (
        "DECISION SUPPORT SIMULATION ONLY — NOT AN AUTONOMOUS ATC SYSTEM. "
        "Controller review is mandatory. Never issues clearances or alters operative routes."
    )

    emergencyAircraftId: str
    declarationType: str
    declarationStatus: str
    secondaryEmergencyAircraftIds: List[str] = Field(default_factory=list)

    knowledgeCoreMetadata: Dict[str, Any]
    inputProvenance: List[InputProvenanceItem]
    freshnessSummary: Dict[str, Any]
    uncertaintyAssumptions: Dict[str, Any]

    baseline: CandidateSequencePlan
    fcfsBaseline: CandidateSequencePlan
    recommendedCandidates: List[CandidateSequencePlan] = Field(default_factory=list)
    rejectedCandidates: List[CandidateSequencePlan] = Field(default_factory=list)
    baselineComparisonSummary: Dict[str, Any] = Field(default_factory=dict)
    llmExplanation: Optional[str] = None


def _parse_iso_utc(ts: str) -> datetime.datetime:
    clean = ts.strip()
    if clean.endswith("Z"):
        clean = clean[:-1] + "+00:00"
    dt = datetime.datetime.fromisoformat(clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt


def _format_iso_utc(dt: datetime.datetime) -> str:
    return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class EmergencySequenceRiskAdvisor:
    """
    Pure deterministic evaluator for emergency arrival sequence changes at OMDB.
    """

    @staticmethod
    def evaluate(
        aircraft_list: List[AircraftStatePayload],
        weather: WeatherPayload,
        target_aircraft_id: str,
        sim_time_iso: str = "2026-10-28T03:00:00Z",
        runway_states: Optional[Any] = None,
        knowledge_core: Optional[KnowledgeCore] = None,
    ) -> RiskAdvisorEvaluationResult:
        kc = knowledge_core or default_knowledge_core
        now_dt = _parse_iso_utc(sim_time_iso)

        # Deep-copy inputs to guarantee zero mutation of caller state
        ac_copy = [copy.deepcopy(a) for a in aircraft_list]
        wx_copy = copy.deepcopy(weather)
        rwy_map: Dict[str, RunwayOperationalState] = {}
        if runway_states:
            if isinstance(runway_states, dict):
                rwy_map = {k: copy.deepcopy(v) for k, v in runway_states.items()}
            elif isinstance(runway_states, list):
                rwy_map = {v.runway: copy.deepcopy(v) for v in runway_states}
        elif wx_copy.runwayStates:
            if isinstance(wx_copy.runwayStates, dict):
                rwy_map = {k: copy.deepcopy(v) for k, v in wx_copy.runwayStates.items()}
            elif isinstance(wx_copy.runwayStates, list):
                rwy_map = {v.runway: copy.deepcopy(v) for v in wx_copy.runwayStates}
        else:
            rwy_map = {
                "30L": RunwayOperationalState(
                    runway="30L",
                    serviceable=True,
                    status=RunwayOperationalStatus.OPEN,
                    mode=RunwayMode.ARRIVAL,
                    ilsCategory=LvpApproach.CAT_IIIB,
                    smrServiceable=wx_copy.smrServiceable,
                    observedAtUtc=sim_time_iso,
                ),
                "30R": RunwayOperationalState(
                    runway="30R",
                    serviceable=True,
                    status=RunwayOperationalStatus.OPEN,
                    mode=RunwayMode.MIXED,
                    ilsCategory=LvpApproach.CAT_IIIB,
                    smrServiceable=wx_copy.smrServiceable,
                    observedAtUtc=sim_time_iso,
                ),
            }

        # Filter arrival stream aircraft
        arrivals = [a for a in ac_copy if a.flightPhase in ARRIVAL_PHASES]
        ac_by_id: Dict[str, AircraftStatePayload] = {a.callsign: a for a in arrivals}

        # Ensure target aircraft is in arrivals
        target_ac = ac_by_id.get(target_aircraft_id)
        if not target_ac:
            # Check if target exists in non-arrival list
            all_by_id = {a.callsign: a for a in ac_copy}
            if target_aircraft_id not in all_by_id:
                raise ValueError(f"Aircraft '{target_aircraft_id}' not found in snapshot.")
            target_ac = all_by_id[target_aircraft_id]
            arrivals.append(target_ac)
            ac_by_id[target_aircraft_id] = target_ac

        # 1. Build provenance & freshness audit
        provenance_list: List[InputProvenanceItem] = []
        stale_callsigns: List[str] = []
        missing_fuel_callsigns: List[str] = []
        unknown_wake_callsigns: List[str] = []
        stale_threshold_sec = kc.get_stale_telemetry_threshold_sec()

        for a in arrivals:
            freshness_sec = float(a.dataFreshnessSec or 0.0)
            if a.observedAtUtc:
                try:
                    obs_dt = _parse_iso_utc(a.observedAtUtc)
                    computed_age = max(0.0, (now_dt - obs_dt).total_seconds())
                    freshness_sec = max(freshness_sec, computed_age)
                except Exception:
                    pass
            is_stale = bool(a.isStale or freshness_sec > stale_threshold_sec)
            if is_stale:
                stale_callsigns.append(a.callsign)

            missing_reasons = list(a.missingDataReasons)
            for mr in a.fuel.missingDataReasons:
                if mr not in missing_reasons:
                    missing_reasons.append(mr)
            if (
                a.fuel.totalKg is None
                or a.fuel.finalReserveKg is None
                or a.fuel.holdingFuelFlowKgH is None
            ):
                if "MISSING_FUEL_OR_RESERVE_TELEMETRY" not in missing_reasons:
                    missing_reasons.append("MISSING_FUEL_OR_RESERVE_TELEMETRY")
                missing_fuel_callsigns.append(a.callsign)
            elif len(a.fuel.missingDataReasons) > 0:
                missing_fuel_callsigns.append(a.callsign)

            if not kc.is_known_wake_category(a.wakeCategory):
                if "UNKNOWN_WAKE_CATEGORY" not in missing_reasons:
                    missing_reasons.append(f"UNKNOWN_WAKE_CATEGORY:{a.wakeCategory}")
                unknown_wake_callsigns.append(a.callsign)

            provenance_list.append(
                InputProvenanceItem(
                    callsign=a.callsign,
                    telemetryProvenance=a.provenance.value,
                    fuelProvenance=a.fuel.provenance.value,
                    priorityProvenance=a.priority.provenance.value,
                    observedAtUtc=a.observedAtUtc or sim_time_iso,
                    freshnessSec=round(freshness_sec, 1),
                    isStale=is_stale,
                    missingDataReasons=missing_reasons,
                )
            )

        # 2. Identify committed/frozen slots and simultaneous confirmed emergencies
        freeze_nm = kc.get_freeze_horizon_nm()
        committed_map: Dict[str, Tuple[bool, Optional[str]]] = {}
        for a in arrivals:
            if a.slotFrozen:
                committed_map[a.callsign] = (
                    True,
                    f"Committed slot inside AMAN freeze horizon ({a.position.distanceToThresholdNm:.1f} NM, phase={a.flightPhase.value})",
                )
            elif a.flightPhase == FlightPhase.FINAL:
                committed_map[a.callsign] = (
                    True,
                    f"Aircraft established on FINAL ({a.position.distanceToThresholdNm:.1f} NM)",
                )
            elif (
                a.position.distanceToThresholdNm <= freeze_nm
                and a.flightPhase == FlightPhase.APPROACH
            ):
                committed_map[a.callsign] = (
                    True,
                    f"Inside {freeze_nm:.1f} NM freeze horizon on APPROACH ({a.position.distanceToThresholdNm:.1f} NM)",
                )
            else:
                committed_map[a.callsign] = (False, None)

        confirmed_emergencies = [
            a.callsign
            for a in arrivals
            if a.priority.declarationType in (EmergencyDeclarationType.MAYDAY, EmergencyDeclarationType.PAN_PAN)
            and a.priority.declarationStatus == DeclarationStatus.CONFIRMED
        ]
        secondary_emergencies = [
            c for c in confirmed_emergencies if c != target_aircraft_id
        ]

        # 3. Determine baseline runway assignment & baseline arrival ordering
        def _baseline_sort_key(a: AircraftStatePayload) -> Tuple[int, float, str]:
            seq = a.landingSequence if a.landingSequence is not None else 999
            return (seq, a.position.distanceToThresholdNm, a.callsign)

        sorted_baseline_arrivals = sorted(arrivals, key=_baseline_sort_key)
        baseline_runway_orders: Dict[str, List[str]] = {}
        for a in sorted_baseline_arrivals:
            rwy = a.assignedRunway or "30L"
            baseline_runway_orders.setdefault(rwy, []).append(a.callsign)

        # Also build FCFS ordering (sorted purely by unconstrained earliest arrival time on assigned runway)
        unconstrained_eta_map: Dict[str, float] = {}
        for a in arrivals:
            unconstrained_eta_map[a.callsign] = EmergencySequenceRiskAdvisor._compute_unconstrained_eta_sec(
                a, a.assignedRunway or "30L", kc, extra_eta_sec=0.0
            )
        fcfs_runway_orders: Dict[str, List[str]] = {}
        for rwy, c_list in baseline_runway_orders.items():
            fcfs_runway_orders[rwy] = sorted(
                c_list, key=lambda cs: (unconstrained_eta_map[cs], cs)
            )

        # Evaluate Baseline and FCFS Baseline
        baseline_plan = EmergencySequenceRiskAdvisor._evaluate_candidate_order(
            candidate_id="BASELINE_CURRENT_ORDER",
            strategy_type="BASELINE",
            label="Current Sequence (Baseline)",
            description="Existing AMAN arrival sequence and runway assignments without resequencing.",
            runway_orders=baseline_runway_orders,
            baseline_reference=None,
            ac_by_id=ac_by_id,
            wx=wx_copy,
            rwy_map=rwy_map,
            committed_map=committed_map,
            target_id=target_aircraft_id,
            secondary_emergencies=secondary_emergencies,
            now_dt=now_dt,
            kc=kc,
            unknown_wake_callsigns=unknown_wake_callsigns,
            missing_fuel_callsigns=missing_fuel_callsigns,
            stale_callsigns=stale_callsigns,
        )

        fcfs_plan = EmergencySequenceRiskAdvisor._evaluate_candidate_order(
            candidate_id="BASELINE_FCFS_ORDER",
            strategy_type="FCFS",
            label="First-Come-First-Served (FCFS Baseline)",
            description="Unconstrained earliest-arrival order on currently assigned runways.",
            runway_orders=fcfs_runway_orders,
            baseline_reference=baseline_plan,
            ac_by_id=ac_by_id,
            wx=wx_copy,
            rwy_map=rwy_map,
            committed_map=committed_map,
            target_id=target_aircraft_id,
            secondary_emergencies=secondary_emergencies,
            now_dt=now_dt,
            kc=kc,
            unknown_wake_callsigns=unknown_wake_callsigns,
            missing_fuel_callsigns=missing_fuel_callsigns,
            stale_callsigns=stale_callsigns,
        )

        # 4. Check input/declaration gates (do NOT infer MAYDAY/PAN from MEDICAL or MINIMUM_FUEL)
        gate_reasons: List[str] = []
        decl_type = target_ac.priority.declarationType
        decl_status = target_ac.priority.declarationStatus
        prio_level = target_ac.priority.level

        if decl_type == EmergencyDeclarationType.NONE or decl_status != DeclarationStatus.CONFIRMED:
            if prio_level == PriorityLevel.MINIMUM_FUEL and decl_type == EmergencyDeclarationType.NONE:
                gate_reasons.append(
                    f"MINIMUM_FUEL_NO_EMERGENCY_DECLARATION: {target_aircraft_id} has MINIMUM_FUEL flag but no confirmed MAYDAY or PAN PAN declaration. "
                    "Under UAE Rules of the Air / ICAO Doc 4444, MINIMUM FUEL is an advisory state and must not automatically trigger emergency resequencing."
                )
            elif prio_level == PriorityLevel.MEDICAL and (
                decl_type == EmergencyDeclarationType.NONE or decl_status != DeclarationStatus.CONFIRMED
            ):
                gate_reasons.append(
                    f"MEDICAL_REPORT_AWAITING_DECLARATION_CONFIRMATION: {target_aircraft_id} has a medical report onboard (declarationStatus={decl_status.value}, declarationType={decl_type.value}). "
                    "Per GCAA eAIC 2020-06, controller must confirm with Pilot-in-Command whether PAN PAN or MAYDAY is declared before emergency resequencing."
                )
            elif decl_type in (EmergencyDeclarationType.MAYDAY, EmergencyDeclarationType.PAN_PAN) and decl_status != DeclarationStatus.CONFIRMED:
                gate_reasons.append(
                    f"UNCONFIRMED_EMERGENCY_DECLARATION: {target_aircraft_id} declaration {decl_type.value} is {decl_status.value}; awaiting controller confirmation."
                )
            else:
                gate_reasons.append(
                    f"NO_CONFIRMED_EMERGENCY_DECLARATION: {target_aircraft_id} is in {prio_level.value} state with declarationType=NONE."
                )

        if stale_callsigns:
            gate_reasons.append(
                f"STALE_TELEMETRY: Telemetry age exceeds {int(stale_threshold_sec)}s limit for {', '.join(stale_callsigns)}. Revert to voice verification before resequencing."
            )

        if unknown_wake_callsigns:
            gate_reasons.append(
                f"UNKNOWN_WAKE_CATEGORY: Unrecognized wake turbulence category for {', '.join(unknown_wake_callsigns)}. Manual separation review required."
            )

        if missing_fuel_callsigns:
            gate_reasons.append(
                f"MISSING_FUEL_OR_RESERVE_DATA: Missing fuel quantity, fuel flow, or final reserve data for {', '.join(missing_fuel_callsigns)} (reported as UNKNOWN). Manual review required."
            )

        # 5. Generate Candidate Resequencing Plans
        candidate_specs = EmergencySequenceRiskAdvisor._generate_candidate_orders(
            baseline_runway_orders=baseline_runway_orders,
            ac_by_id=ac_by_id,
            rwy_map=rwy_map,
            committed_map=committed_map,
            target_id=target_aircraft_id,
            secondary_emergencies=secondary_emergencies,
            kc=kc,
        )

        evaluated_candidates: List[CandidateSequencePlan] = []
        for c_spec in candidate_specs:
            plan = EmergencySequenceRiskAdvisor._evaluate_candidate_order(
                candidate_id=c_spec["candidateId"],
                strategy_type=c_spec["strategyType"],
                label=c_spec["label"],
                description=c_spec["description"],
                runway_orders=c_spec["runwayOrders"],
                baseline_reference=baseline_plan,
                ac_by_id=ac_by_id,
                wx=wx_copy,
                rwy_map=rwy_map,
                committed_map=committed_map,
                target_id=target_aircraft_id,
                secondary_emergencies=secondary_emergencies,
                now_dt=now_dt,
                kc=kc,
                unknown_wake_callsigns=unknown_wake_callsigns,
                missing_fuel_callsigns=missing_fuel_callsigns,
                stale_callsigns=stale_callsigns,
            )
            evaluated_candidates.append(plan)

        # 6. Separate feasible vs rejected candidates and rank lexicographically
        feasible_candidates: List[CandidateSequencePlan] = []
        rejected_candidates: List[CandidateSequencePlan] = []

        for c in evaluated_candidates:
            if c.feasible and len(gate_reasons) == 0:
                feasible_candidates.append(c)
            else:
                if len(gate_reasons) > 0 and c.feasible:
                    # Candidate is kinematically valid but blocked by policy/data gate
                    c.feasible = False
                    for gr in gate_reasons:
                        code = gr.split(":")[0]
                        if code not in c.hardConstraintFailures:
                            c.hardConstraintFailures.append(code)
                        if gr not in c.warnings:
                            c.warnings.append(gr)
                rejected_candidates.append(c)

        # Sort feasible candidates using lexicographic tuple
        feasible_candidates.sort(
            key=lambda c: EmergencySequenceRiskAdvisor._lexicographic_sort_key(c)
        )
        top_feasible = feasible_candidates[:3]
        for idx, c in enumerate(top_feasible, start=1):
            c.recommendedRank = idx

        # Determine overall evaluation status
        if len(gate_reasons) > 0:
            eval_status = "MANUAL_REVIEW_REQUIRED"
            status_reasons = gate_reasons
            status_summary = (
                f"Manual controller review required for {target_aircraft_id}: "
                + "; ".join(r.split(":")[0] for r in gate_reasons)
            )
        elif len(top_feasible) == 0:
            eval_status = "NO_FEASIBLE_PLAN"
            all_blockers: List[str] = []
            for rc in rejected_candidates:
                for bf in rc.hardConstraintFailures:
                    if bf not in all_blockers:
                        all_blockers.append(bf)
            status_reasons = (
                all_blockers
                if all_blockers
                else ["ALL_CANDIDATES_VIOLATED_HARD_CONSTRAINTS"]
            )
            status_summary = (
                f"No feasible emergency resequencing plan found for {target_aircraft_id}. "
                f"Blockers: {', '.join(status_reasons)}."
            )
        else:
            eval_status = "FEASIBLE_CANDIDATES_AVAILABLE"
            best = top_feasible[0]
            status_reasons = [
                f"CONFIRMED_{decl_type.value}_DECLARATION",
                f"TOP_CANDIDATE:{best.candidateId}",
            ]
            status_summary = (
                f"Found {len(top_feasible)} feasible resequencing option(s) for confirmed {decl_type.value} "
                f"aircraft {target_aircraft_id}. Top option '{best.label}' gains "
                f"{abs(best.emergencyTimeGainedMin):.1f} min while preserving all displaced aircraft fuel reserves and frozen slots."
            )

        # Build comparison summary vs Current Order and FCFS baselines
        best_cand = top_feasible[0] if top_feasible else None
        comparison_summary = {
            "currentOrderBaseline": {
                "emergencyLandingTimeUtc": baseline_plan.emergencyProposedLandingTimeUtc,
                "emergencyFuelMarginKg": baseline_plan.emergencyLandingFuelMarginKg,
                "totalSequenceDelayMin": baseline_plan.totalAddedDelayMin,
                "minOtherAircraftFuelMarginKg": baseline_plan.minDisplacedFuelMarginKg,
            },
            "fcfsBaseline": {
                "emergencyLandingTimeUtc": fcfs_plan.emergencyProposedLandingTimeUtc,
                "emergencyFuelMarginKg": fcfs_plan.emergencyLandingFuelMarginKg,
                "totalSequenceDelayMin": fcfs_plan.totalAddedDelayMin,
                "minOtherAircraftFuelMarginKg": fcfs_plan.minDisplacedFuelMarginKg,
            },
            "topAdvisorCandidate": (
                {
                    "candidateId": best_cand.candidateId,
                    "label": best_cand.label,
                    "emergencyLandingTimeUtc": best_cand.emergencyProposedLandingTimeUtc,
                    "emergencyTimeGainedVsCurrentMin": best_cand.emergencyTimeGainedMin,
                    "emergencyFuelMarginKg": best_cand.emergencyLandingFuelMarginKg,
                    "totalAddedDelayVsCurrentMin": best_cand.totalAddedDelayMin,
                    "minDisplacedFuelMarginKg": best_cand.minDisplacedFuelMarginKg,
                }
                if best_cand
                else None
            ),
        }

        return RiskAdvisorEvaluationResult(
            evaluationStatus=eval_status,
            statusReasons=status_reasons,
            statusSummary=status_summary,
            evaluatedAtUtc=sim_time_iso,
            policyVersion=kc.policy_version,
            emergencyAircraftId=target_aircraft_id,
            declarationType=decl_type.value,
            declarationStatus=decl_status.value,
            secondaryEmergencyAircraftIds=secondary_emergencies,
            knowledgeCoreMetadata=kc.get_metadata_summary(),
            inputProvenance=provenance_list,
            freshnessSummary={
                "maxObservedFreshnessSec": max(
                    (p.freshnessSec for p in provenance_list), default=0.0
                ),
                "staleThresholdSec": stale_threshold_sec,
                "staleAircraft": stale_callsigns,
                "missingFuelAircraft": missing_fuel_callsigns,
                "unknownWakeAircraft": unknown_wake_callsigns,
            },
            uncertaintyAssumptions={
                "disclaimer": kc.get_uncertainty_disclaimer(),
                "scenarios": [s.model_dump() for s in kc.get_stress_scenarios()],
            },
            baseline=baseline_plan,
            fcfsBaseline=fcfs_plan,
            recommendedCandidates=top_feasible,
            rejectedCandidates=rejected_candidates,
            baselineComparisonSummary=comparison_summary,
        )

    @staticmethod
    def _compute_unconstrained_eta_sec(
        ac: AircraftStatePayload,
        target_runway: str,
        kc: KnowledgeCore,
        extra_eta_sec: float = 0.0,
        expedite_direct: bool = False,
    ) -> float:
        dist_nm = max(0.05, float(ac.position.distanceToThresholdNm))
        gs_kt = max(120.0, float(ac.speed.groundSpeedKt or 210.0))
        final_gs_kt = (
            kc.get_final_approach_speed_kt(ac.wakeCategory)
            if kc.is_known_wake_category(ac.wakeCategory)
            else 140.0
        )

        if dist_nm <= 6.0:
            eff_gs = max(120.0, min(gs_kt, final_gs_kt + 15.0))
            transit_sec = (dist_nm / eff_gs) * 3600.0
        else:
            outer_nm = dist_nm - 6.0
            # Standard STAR trombone path has ~15% lateral path extension beyond 8 NM unless given direct priority vector
            if ac.flightPhase == FlightPhase.ARRIVAL and dist_nm > 8.0 and not expedite_direct:
                outer_nm *= 1.15
            outer_gs = min(250.0, gs_kt + 15.0) if expedite_direct else gs_kt
            transit_sec = (outer_nm / outer_gs) * 3600.0 + (6.0 / final_gs_kt) * 3600.0

        # If currently in HOLDING pattern, add pattern exit time (45s expedited vs 90s standard)
        if ac.flightPhase == FlightPhase.HOLDING:
            transit_sec += 45.0 if expedite_direct else 90.0

        # Runway change maneuvering time penalty
        orig_rwy = ac.assignedRunway or "30L"
        if target_runway != orig_rwy:
            _, sidestep_pen_sec = kc.get_sidestep_policy()
            transit_sec += sidestep_pen_sec

        # Committed short-final flights do not take full outer ETA jitter
        if ac.flightPhase == FlightPhase.FINAL:
            transit_sec += extra_eta_sec * 0.25
        else:
            transit_sec += extra_eta_sec

        return round(max(5.0, transit_sec), 1)

    @staticmethod
    def _generate_candidate_orders(
        baseline_runway_orders: Dict[str, List[str]],
        ac_by_id: Dict[str, AircraftStatePayload],
        rwy_map: Dict[str, RunwayOperationalState],
        committed_map: Dict[str, Tuple[bool, Optional[str]]],
        target_id: str,
        secondary_emergencies: List[str],
        kc: KnowledgeCore,
    ) -> List[Dict[str, Any]]:
        """
        Generates candidate resequencing orders:
          1. Earliest feasible insertion on assigned runway (preserving committed/frozen slots & higher/equal priority emergencies)
          2. Limited nearby swaps (CPS k=1 and k=2 ahead on assigned runway)
          3. Alternate parallel runway insertion (e.g. 30R <-> 30L)
          4. Multi-emergency coordinated split/tandem when >= 2 confirmed emergencies exist
          5. Frozen-slot violation probe (if a frozen aircraft is ahead on the assigned runway, explicitly records why slot #1 ahead of the frozen flight is rejected)
        """
        candidates: List[Dict[str, Any]] = []
        seen_signatures = set()

        def _sig(orders: Dict[str, List[str]]) -> str:
            return "|".join(
                f"{r}:{','.join(orders.get(r, []))}" for r in sorted(orders.keys())
            )

        baseline_sig = _sig(baseline_runway_orders)
        seen_signatures.add(baseline_sig)

        target_ac = ac_by_id[target_id]
        orig_rwy = target_ac.assignedRunway or "30L"
        orig_stream = list(baseline_runway_orders.get(orig_rwy, []))
        if target_id not in orig_stream:
            orig_stream.append(target_id)
        curr_idx = orig_stream.index(target_id)

        # Find earliest non-frozen index on orig_rwy that also respects higher/equal emergency priority
        target_decl_rank = 1 if target_ac.priority.declarationType == EmergencyDeclarationType.MAYDAY else 2
        earliest_valid_idx = 0
        for idx, cs in enumerate(orig_stream):
            if cs == target_id:
                break
            is_comm, _ = committed_map.get(cs, (False, None))
            other_ac = ac_by_id[cs]
            other_is_conf_emerg = (
                other_ac.priority.declarationType in (EmergencyDeclarationType.MAYDAY, EmergencyDeclarationType.PAN_PAN)
                and other_ac.priority.declarationStatus == DeclarationStatus.CONFIRMED
            )
            other_rank = 1 if other_ac.priority.declarationType == EmergencyDeclarationType.MAYDAY else 2
            if is_comm or (other_is_conf_emerg and other_rank <= target_decl_rank):
                earliest_valid_idx = idx + 1

        # Candidate A: Earliest Feasible Insertion on current runway
        if earliest_valid_idx < curr_idx:
            new_stream = [c for c in orig_stream if c != target_id]
            new_stream.insert(earliest_valid_idx, target_id)
            orders_a = copy.deepcopy(baseline_runway_orders)
            orders_a[orig_rwy] = new_stream
            if _sig(orders_a) not in seen_signatures:
                seen_signatures.add(_sig(orders_a))
                candidates.append({
                    "candidateId": f"CAND_EARLIEST_{orig_rwy}_SLOT{earliest_valid_idx + 1}",
                    "strategyType": "EARLIEST_FEASIBLE_INSERTION",
                    "label": f"Earliest Feasible Insertion on RWY {orig_rwy} (Slot #{earliest_valid_idx + 1})",
                    "description": (
                        f"Insert {target_id} at slot #{earliest_valid_idx + 1} on RWY {orig_rwy}, "
                        "immediately behind committed freeze-horizon traffic."
                    ),
                    "runwayOrders": orders_a,
                })
        elif earliest_valid_idx == curr_idx:
            orders_direct = copy.deepcopy(baseline_runway_orders)
            candidates.append({
                "candidateId": f"CAND_PRIORITY_DIRECT_{orig_rwy}_SLOT{curr_idx + 1}",
                "strategyType": "EARLIEST_FEASIBLE_INSERTION",
                "label": f"Priority Direct Approach on RWY {orig_rwy} (Slot #{curr_idx + 1})",
                "description": (
                    f"Retain {target_id} at earliest feasible slot #{curr_idx + 1} on RWY {orig_rwy} "
                    "with priority direct routing and speed clearance."
                ),
                "runwayOrders": orders_direct,
            })

        # Candidate B1 & B2: Nearby Swaps (CPS k=1 and k=2 ahead on current runway)
        max_cps = kc.get_max_cps_shift()
        for shift in range(1, max_cps + 1):
            swap_idx = curr_idx - shift
            if swap_idx >= 0:
                new_stream = [c for c in orig_stream if c != target_id]
                new_stream.insert(swap_idx, target_id)
                orders_b = copy.deepcopy(baseline_runway_orders)
                orders_b[orig_rwy] = new_stream
                if _sig(orders_b) not in seen_signatures:
                    seen_signatures.add(_sig(orders_b))
                    displaced_cs = orig_stream[swap_idx:curr_idx]
                    candidates.append({
                        "candidateId": f"CAND_SWAP_{orig_rwy}_UP{shift}",
                        "strategyType": "NEARBY_SWAP",
                        "label": f"Nearby Swap +{shift} Slot(s) on RWY {orig_rwy} (Slot #{swap_idx + 1})",
                        "description": (
                            f"Constrained position shift advancing {target_id} by {shift} slot(s) "
                            f"ahead of {', '.join(displaced_cs)} on RWY {orig_rwy}."
                        ),
                        "runwayOrders": orders_b,
                    })

        # Candidate C: Frozen-slot probe if earliest_valid_idx > 0 and curr_idx > 0
        if earliest_valid_idx > 0 and curr_idx > 0:
            probe_stream = [c for c in orig_stream if c != target_id]
            probe_stream.insert(0, target_id)
            orders_probe = copy.deepcopy(baseline_runway_orders)
            orders_probe[orig_rwy] = probe_stream
            if _sig(orders_probe) not in seen_signatures:
                seen_signatures.add(_sig(orders_probe))
                candidates.append({
                    "candidateId": f"CAND_UNCONSTRAINED_SLOT1_{orig_rwy}",
                    "strategyType": "REJECTED_PROBE",
                    "label": f"Immediate Slot #1 Override on RWY {orig_rwy} (Displaces Frozen Final)",
                    "description": (
                        f"Attempts to place {target_id} at Slot #1 on RWY {orig_rwy} ahead of committed final-approach traffic."
                    ),
                    "runwayOrders": orders_probe,
                })

        # Candidate D: Eligible Alternate Parallel Runway Options (e.g. 30R <-> 30L)
        alt_runways = ["30R", "30L"] if orig_rwy == "30L" else ["30L", "30R"]
        for alt_rwy in alt_runways:
            if alt_rwy == orig_rwy:
                continue
            alt_stream = list(baseline_runway_orders.get(alt_rwy, []))
            # Find earliest non-frozen slot on alt_rwy
            alt_insert_idx = 0
            for idx, cs in enumerate(alt_stream):
                is_comm, _ = committed_map.get(cs, (False, None))
                other_ac = ac_by_id[cs]
                other_is_conf_emerg = (
                    other_ac.priority.declarationType in (EmergencyDeclarationType.MAYDAY, EmergencyDeclarationType.PAN_PAN)
                    and other_ac.priority.declarationStatus == DeclarationStatus.CONFIRMED
                )
                other_rank = 1 if other_ac.priority.declarationType == EmergencyDeclarationType.MAYDAY else 2
                if is_comm or (other_is_conf_emerg and other_rank <= target_decl_rank):
                    alt_insert_idx = idx + 1

            orders_alt = copy.deepcopy(baseline_runway_orders)
            orders_alt[orig_rwy] = [c for c in orig_stream if c != target_id]
            new_alt_stream = list(alt_stream)
            new_alt_stream.insert(alt_insert_idx, target_id)
            orders_alt[alt_rwy] = new_alt_stream
            if _sig(orders_alt) not in seen_signatures:
                seen_signatures.add(_sig(orders_alt))
                candidates.append({
                    "candidateId": f"CAND_ALT_RWY_{alt_rwy}_SLOT{alt_insert_idx + 1}",
                    "strategyType": "ALTERNATE_RUNWAY",
                    "label": f"Sidestep to Parallel RWY {alt_rwy} (Slot #{alt_insert_idx + 1})",
                    "description": (
                        f"Reassign {target_id} from RWY {orig_rwy} to parallel RWY {alt_rwy} at slot #{alt_insert_idx + 1} "
                        "to reduce single-runway arrival queue displacement."
                    ),
                    "runwayOrders": orders_alt,
                })

        # Candidate E: Dual-emergency coordination when secondary confirmed emergencies exist
        if secondary_emergencies:
            sec_id = secondary_emergencies[0]
            sec_ac = ac_by_id[sec_id]
            # Order both emergencies on parallel runways (target on 30L, secondary on 30R or vice versa)
            orders_dual = copy.deepcopy(baseline_runway_orders)
            for r in ["30L", "30R"]:
                orders_dual.setdefault(r, [])
                orders_dual[r] = [c for c in orders_dual[r] if c not in (target_id, sec_id)]

            # Determine which emergency has higher priority
            t_rank = 1 if target_ac.priority.declarationType == EmergencyDeclarationType.MAYDAY else 2
            s_rank = 1 if sec_ac.priority.declarationType == EmergencyDeclarationType.MAYDAY else 2

            # Place target on its preferred open runway, secondary on parallel runway
            r_t = orig_rwy
            r_s = "30R" if r_t == "30L" else "30L"

            def _insert_after_committed(stream: List[str], insert_cs: str) -> List[str]:
                ins_i = 0
                for idx, cs in enumerate(stream):
                    if committed_map.get(cs, (False, None))[0]:
                        ins_i = idx + 1
                res = list(stream)
                res.insert(ins_i, insert_cs)
                return res

            orders_dual[r_t] = _insert_after_committed(orders_dual[r_t], target_id)
            orders_dual[r_s] = _insert_after_committed(orders_dual[r_s], sec_id)
            if _sig(orders_dual) not in seen_signatures:
                seen_signatures.add(_sig(orders_dual))
                candidates.append({
                    "candidateId": f"CAND_DUAL_EMERG_SPLIT_{r_t}_{r_s}",
                    "strategyType": "DUAL_EMERGENCY",
                    "label": f"Dual-Emergency Parallel Split ({target_id} on {r_t}, {sec_id} on {r_s})",
                    "description": (
                        f"Coordinate simultaneous emergencies across parallel runways: {target_id} ({target_ac.priority.declarationType.value}) "
                        f"on RWY {r_t} and {sec_id} ({sec_ac.priority.declarationType.value}) on RWY {r_s}."
                    ),
                    "runwayOrders": orders_dual,
                })

            # Also generate single-runway tandem emergency sequence (in case one runway is closed/ineligible)
            orders_tandem = copy.deepcopy(baseline_runway_orders)
            for r in list(orders_tandem.keys()):
                orders_tandem[r] = [c for c in orders_tandem[r] if c not in (target_id, sec_id)]
            first_em, second_em = (target_id, sec_id) if t_rank <= s_rank else (sec_id, target_id)
            base_r_stream = orders_tandem.get(orig_rwy, [])
            ins_i = 0
            for idx, cs in enumerate(base_r_stream):
                if committed_map.get(cs, (False, None))[0]:
                    ins_i = idx + 1
            base_r_stream.insert(ins_i, first_em)
            base_r_stream.insert(ins_i + 1, second_em)
            orders_tandem[orig_rwy] = base_r_stream
            if _sig(orders_tandem) not in seen_signatures:
                seen_signatures.add(_sig(orders_tandem))
                candidates.append({
                    "candidateId": f"CAND_DUAL_EMERG_TANDEM_{orig_rwy}",
                    "strategyType": "DUAL_EMERGENCY",
                    "label": f"Dual-Emergency Tandem Sequence on RWY {orig_rwy} ({first_em} → {second_em})",
                    "description": (
                        f"Sequence both confirmed emergencies on RWY {orig_rwy} in priority order ({first_em} followed by {second_em})."
                    ),
                    "runwayOrders": orders_tandem,
                })

        return candidates

    @staticmethod
    def _evaluate_candidate_order(
        candidate_id: str,
        strategy_type: str,
        label: str,
        description: str,
        runway_orders: Dict[str, List[str]],
        baseline_reference: Optional[CandidateSequencePlan],
        ac_by_id: Dict[str, AircraftStatePayload],
        wx: WeatherPayload,
        rwy_map: Dict[str, RunwayOperationalState],
        committed_map: Dict[str, Tuple[bool, Optional[str]]],
        target_id: str,
        secondary_emergencies: List[str],
        now_dt: datetime.datetime,
        kc: KnowledgeCore,
        unknown_wake_callsigns: List[str],
        missing_fuel_callsigns: List[str],
        stale_callsigns: List[str],
    ) -> CandidateSequencePlan:
        # Run nominal simulation (scenario delta = 0)
        sim_out = EmergencySequenceRiskAdvisor._simulate_schedule(
            runway_orders=runway_orders,
            baseline_reference=baseline_reference,
            ac_by_id=ac_by_id,
            wx=wx,
            rwy_map=rwy_map,
            committed_map=committed_map,
            target_id=target_id,
            secondary_emergencies=secondary_emergencies,
            now_dt=now_dt,
            kc=kc,
            unknown_wake_callsigns=unknown_wake_callsigns,
            missing_fuel_callsigns=missing_fuel_callsigns,
            eta_delta_sec=0.0,
            fuel_burn_mult=1.0,
            rot_delta_sec=0.0,
            is_baseline=(baseline_reference is None),
            strategy_type=strategy_type,
        )

        # Run deterministic stress scenarios
        stress_outcomes: List[StressScenarioOutcome] = []
        adverse_passed_count = 0
        for sc in kc.get_stress_scenarios():
            sc_out = EmergencySequenceRiskAdvisor._simulate_schedule(
                runway_orders=runway_orders,
                baseline_reference=baseline_reference,
                ac_by_id=ac_by_id,
                wx=wx,
                rwy_map=rwy_map,
                committed_map=committed_map,
                target_id=target_id,
                secondary_emergencies=secondary_emergencies,
                now_dt=now_dt,
                kc=kc,
                unknown_wake_callsigns=unknown_wake_callsigns,
                missing_fuel_callsigns=missing_fuel_callsigns,
                eta_delta_sec=sc.etaDeltaSec,
                fuel_burn_mult=sc.fuelBurnMultiplier,
                rot_delta_sec=sc.rotDeltaSec,
                is_baseline=(baseline_reference is None),
                strategy_type=strategy_type,
            )
            if sc_out["feasible"]:
                adverse_passed_count += 1
            stress_outcomes.append(
                StressScenarioOutcome(
                    scenarioId=sc.scenarioId,
                    label=sc.label,
                    etaDeltaSec=sc.etaDeltaSec,
                    fuelBurnMultiplier=sc.fuelBurnMultiplier,
                    rotDeltaSec=sc.rotDeltaSec,
                    feasibleUnderStress=sc_out["feasible"],
                    emergencyLandingTimeUtc=sc_out["emergencyProposedLandingTimeUtc"],
                    emergencyLandingFuelMarginKg=sc_out["emergencyLandingFuelMarginKg"],
                    worstDisplacedCallsign=sc_out["worstDisplacedCallsign"],
                    worstDisplacedFuelMarginKg=sc_out["minDisplacedFuelMarginKg"],
                    inducedConstraintFailures=sc_out["hardConstraintFailures"],
                )
            )

        lex_breakdown = {
            "tier1_hardConstraintFeasible": sim_out["feasible"],
            "tier1_hardConstraintViolationCount": len(sim_out["hardConstraintFailures"]),
            "tier2_displacedNearReserveCount": sim_out["displacedNearReserveCount"],
            "tier2_emergencyLandingTimeSec": sim_out["emergencyLandingSec"],
            "tier2_minDisplacedFuelMarginKg": sim_out["minDisplacedFuelMarginKg"],
            "tier2_stressScenariosPassed": f"{adverse_passed_count}/{len(stress_outcomes)}",
            "tier3_totalAddedDelaySec": sim_out["totalAddedDelaySec"],
            "tier3_maxDisplacedDelaySec": sim_out["maxDisplacedDelaySec"],
            "tier3_displacedAircraftCount": sim_out["displacedAircraftCount"],
            "tier3_runwayChangeCount": sim_out["runwayChangeCount"],
        }

        return CandidateSequencePlan(
            candidateId=candidate_id,
            strategyType=strategy_type,
            label=label,
            description=description,
            feasible=sim_out["feasible"],
            proposedOrder=sim_out["proposedOrder"],
            runwayOrders={k: list(v) for k, v in runway_orders.items() if v},
            emergencyCallsign=target_id,
            emergencyRunway=sim_out["emergencyRunway"],
            emergencyBaselineLandingTimeUtc=sim_out["emergencyBaselineLandingTimeUtc"],
            emergencyProposedLandingTimeUtc=sim_out["emergencyProposedLandingTimeUtc"],
            emergencyTimeGainedSec=sim_out["emergencyTimeGainedSec"],
            emergencyTimeGainedMin=sim_out["emergencyTimeGainedMin"],
            emergencyLandingFuelMarginKg=sim_out["emergencyLandingFuelMarginKg"],
            emergencyFuelStatus=sim_out["emergencyFuelStatus"],
            totalAddedDelaySec=sim_out["totalAddedDelaySec"],
            totalAddedDelayMin=sim_out["totalAddedDelayMin"],
            maxDisplacedDelaySec=sim_out["maxDisplacedDelaySec"],
            maxDisplacedDelayMin=sim_out["maxDisplacedDelayMin"],
            displacedAircraftCount=sim_out["displacedAircraftCount"],
            displacedNearReserveCount=sim_out["displacedNearReserveCount"],
            minDisplacedFuelMarginKg=sim_out["minDisplacedFuelMarginKg"],
            worstDisplacedCallsign=sim_out["worstDisplacedCallsign"],
            runwayChangeCount=sim_out["runwayChangeCount"],
            hardConstraintFailures=sim_out["hardConstraintFailures"],
            warnings=sim_out["warnings"],
            lexicographicBreakdown=lex_breakdown,
            perAircraftImpacts=sim_out["perAircraftImpacts"],
            stressScenarioResults=stress_outcomes,
        )

    @staticmethod
    def _simulate_schedule(
        runway_orders: Dict[str, List[str]],
        baseline_reference: Optional[CandidateSequencePlan],
        ac_by_id: Dict[str, AircraftStatePayload],
        wx: WeatherPayload,
        rwy_map: Dict[str, RunwayOperationalState],
        committed_map: Dict[str, Tuple[bool, Optional[str]]],
        target_id: str,
        secondary_emergencies: List[str],
        now_dt: datetime.datetime,
        kc: KnowledgeCore,
        unknown_wake_callsigns: List[str],
        missing_fuel_callsigns: List[str],
        eta_delta_sec: float,
        fuel_burn_mult: float,
        rot_delta_sec: float,
        is_baseline: bool,
        strategy_type: str = "BASELINE",
    ) -> Dict[str, Any]:
        lvp_active = bool(wx.lvp.active)
        lvp_phase = wx.lvp.phase.value if wx.lvp else "NONE"
        rvr_by_rwy: Dict[str, float] = {item.runway: float(item.valueM) for item in wx.rvr}

        # Map baseline metrics if baseline_reference is provided
        base_impact_by_cs: Dict[str, PerAircraftSequenceImpact] = {}
        if baseline_reference:
            for imp in baseline_reference.perAircraftImpacts:
                base_impact_by_cs[imp.callsign] = imp

        hard_failures: List[str] = []
        warnings: List[str] = []

        scheduled_sec_by_cs: Dict[str, float] = {}
        unconstrained_sec_by_cs: Dict[str, float] = {}
        rwy_by_cs: Dict[str, str] = {}
        rwy_seq_by_cs: Dict[str, int] = {}
        sep_info_by_cs: Dict[str, Dict[str, Any]] = {}
        leader_by_cs: Dict[str, Optional[str]] = {}
        per_ac_failures: Dict[str, List[str]] = {cs: [] for cs in ac_by_id}
        per_ac_warnings: Dict[str, List[str]] = {cs: [] for cs in ac_by_id}

        min_sidestep_nm, _ = kc.get_sidestep_policy()
        smr_thresh_m = kc.get_smr_required_threshold_m()

        # 1. Compute runway-by-runway landing times & check runway/weather/wake constraints
        for rwy, stream in runway_orders.items():
            if not stream:
                continue
            rwy_state = rwy_map.get(
                rwy,
                RunwayOperationalState(runway=rwy, serviceable=True, status=RunwayOperationalStatus.OPEN, mode=RunwayMode.MIXED),
            )
            rwy_rvr = rvr_by_rwy.get(rwy, float(wx.visibilityM))

            prev_landing_sec: Optional[float] = None
            prev_ac: Optional[AircraftStatePayload] = None

            for idx, cs in enumerate(stream):
                ac = ac_by_id[cs]
                rwy_by_cs[cs] = rwy
                rwy_seq_by_cs[cs] = idx + 1

                orig_rwy = ac.assignedRunway or "30L"
                rwy_changed = (rwy != orig_rwy)

                # Check runway serviceability & mode
                is_emerg_or_moved = (cs == target_id or cs in secondary_emergencies or rwy_changed)
                if not rwy_state.serviceable or rwy_state.status == RunwayOperationalStatus.CLOSED or rwy_state.mode == RunwayMode.CLOSED:
                    if is_emerg_or_moved:
                        code = f"RUNWAY_CLOSED:{rwy}({cs})"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                    else:
                        per_ac_warnings[cs].append(f"Background flight {cs} is assigned to closed RWY {rwy} and requires runway reassignment/holding.")
                elif rwy_state.status == RunwayOperationalStatus.LVO_DEDICATED_DEPARTURE or rwy_state.mode == RunwayMode.DEPARTURE:
                    if is_emerg_or_moved:
                        code = f"RUNWAY_MODE_DEPARTURE_ONLY:{rwy}({cs})"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                    else:
                        per_ac_warnings[cs].append(f"Background flight {cs} is assigned to departure-only RWY {rwy} and requires reassignment.")

                # Check sidestep minimum distance if runway changed
                if rwy_changed and ac.position.distanceToThresholdNm < min_sidestep_nm:
                    code = f"RUNWAY_CHANGE_TOO_CLOSE_TO_THRESHOLD:{cs}({ac.position.distanceToThresholdNm:.1f}NM<{min_sidestep_nm:.1f}NM)"
                    per_ac_failures[cs].append(code)
                    if code not in hard_failures:
                        hard_failures.append(code)

                # Check aircraft eligible runways
                if rwy not in ac.capability.eligibleRunways:
                    if is_emerg_or_moved:
                        code = f"RUNWAY_NOT_ELIGIBLE_FOR_AIRCRAFT:{cs}->{rwy}"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                    else:
                        per_ac_warnings[cs].append(f"Background flight {cs} is not eligible for RWY {rwy}.")

                # Check SMR requirement when RVR <= 300m
                if rwy_rvr <= smr_thresh_m and (not wx.smrServiceable or not rwy_state.smrServiceable):
                    if is_emerg_or_moved:
                        code = f"SMR_UNSERVICEABLE_BELOW_300M_RVR:{rwy}({cs})"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                    else:
                        per_ac_warnings[cs].append(f"SMR unserviceable on RWY {rwy} with RVR <= {int(smr_thresh_m)}m.")

                # Check approach / visibility / operator eligibility
                app_minima = kc.get_approach_minima(ac.capability.lvpApproach.value)
                req_rvr = max(app_minima["minRvrM"], float(ac.capability.minApprovedRvrM or 0.0))
                req_ceil = app_minima["minCeilingFt"]
                rwy_ils_rank = APPROACH_CATEGORY_RANK.get(rwy_state.ilsCategory.value, 4)
                ac_app_rank = APPROACH_CATEGORY_RANK.get(ac.capability.lvpApproach.value, 1)

                if lvp_active and not ac.capability.operatorLvoApproved:
                    if cs == target_id or rwy_changed:
                        code = f"OPERATOR_NOT_LVO_APPROVED:{cs}"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                    else:
                        per_ac_warnings[cs].append(f"{cs} operator not LVO approved; requires hold/diversion.")

                if rwy_rvr < req_rvr or wx.ceilingFt < req_ceil or rwy_ils_rank < ac_app_rank:
                    if cs == target_id or cs in secondary_emergencies or rwy_changed:
                        code = (
                            f"APPROACH_VISIBILITY_INELIGIBLE:{cs}({ac.capability.lvpApproach.value}_requires_RVR>={int(req_rvr)}m_actual={int(rwy_rvr)}m)"
                        )
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                    else:
                        per_ac_warnings[cs].append(
                            f"Background flight {cs} ({ac.capability.lvpApproach.value}) is below RVR {int(req_rvr)}m minimum (actual {int(rwy_rvr)}m) and requires hold/divert."
                        )

                # Compute earliest unconstrained landing time
                is_expedited_emerg = (
                    not is_baseline
                    and strategy_type != "FCFS"
                    and (cs == target_id or cs in secondary_emergencies)
                )
                e_sec = EmergencySequenceRiskAdvisor._compute_unconstrained_eta_sec(
                    ac, rwy, kc, extra_eta_sec=eta_delta_sec, expedite_direct=is_expedited_emerg
                )
                unconstrained_sec_by_cs[cs] = e_sec

                if prev_landing_sec is None or prev_ac is None:
                    t_sec = e_sec
                    leader_by_cs[cs] = None
                    sep_info_by_cs[cs] = {
                        "requiredSeparationSec": 0.0,
                        "requiredDistanceNm": 0.0,
                        "governingConstraint": None,
                    }
                else:
                    leader_by_cs[cs] = prev_ac.callsign
                    # Check wake category validity
                    if not kc.is_known_wake_category(prev_ac.wakeCategory) or not kc.is_known_wake_category(ac.wakeCategory):
                        bad_cs = prev_ac.callsign if not kc.is_known_wake_category(prev_ac.wakeCategory) else ac.callsign
                        code = f"UNKNOWN_WAKE_CATEGORY:{bad_cs}"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                        sep_info = {
                            "requiredSeparationSec": 150.0,
                            "requiredDistanceNm": 7.0,
                            "governingConstraint": "UNKNOWN_WAKE_FALLBACK",
                        }
                    else:
                        sep_info = kc.get_inter_arrival_separation_sec(
                            leader_wake=prev_ac.wakeCategory,
                            follower_wake=ac.wakeCategory,
                            lvp_active=lvp_active,
                            lvp_phase=lvp_phase,
                            extra_rot_sec=rot_delta_sec,
                        )
                    sep_info_by_cs[cs] = sep_info
                    t_sec = max(e_sec, prev_landing_sec + sep_info["requiredSeparationSec"])

                scheduled_sec_by_cs[cs] = round(t_sec, 1)
                prev_landing_sec = t_sec
                prev_ac = ac

        # 2. Global sequence order sorted by scheduled landing time
        global_order = sorted(
            ac_by_id.keys(), key=lambda cs: (scheduled_sec_by_cs[cs], cs)
        )
        global_seq_by_cs = {cs: i + 1 for i, cs in enumerate(global_order)}

        # 3. Check multi-emergency precedence & committed/frozen slot preservation
        target_ac = ac_by_id[target_id]
        for sec_id in secondary_emergencies:
            sec_ac = ac_by_id[sec_id]
            # If secondary emergency is MAYDAY and target is PAN_PAN, target cannot jump ahead on same runway
            if (
                sec_ac.priority.declarationType == EmergencyDeclarationType.MAYDAY
                and target_ac.priority.declarationType == EmergencyDeclarationType.PAN_PAN
                and rwy_by_cs[sec_id] == rwy_by_cs[target_id]
                and rwy_seq_by_cs[target_id] < rwy_seq_by_cs[sec_id]
            ):
                code = f"EMERGENCY_HIERARCHY_VIOLATION:{target_id}(PAN_PAN)_AHEAD_OF_{sec_id}(MAYDAY)"
                per_ac_failures[target_id].append(code)
                if code not in hard_failures:
                    hard_failures.append(code)

        # 4. Compute per-aircraft impacts, fuel burn, and displaced-flight reserve checks
        caution_margin_kg = kc.get_caution_fuel_margin_kg()
        min_displaced_margin_kg = kc.get_displaced_min_fuel_margin_kg()

        per_aircraft_impacts: List[PerAircraftSequenceImpact] = []
        total_added_delay_sec = 0.0
        max_displaced_delay_sec = 0.0
        displaced_count = 0
        displaced_near_reserve_count = 0
        min_displaced_fuel_margin: Optional[float] = None
        worst_displaced_cs: Optional[str] = None
        runway_change_count = 0

        for cs in global_order:
            ac = ac_by_id[cs]
            is_comm, comm_reason = committed_map.get(cs, (False, None))
            prop_rwy = rwy_by_cs[cs]
            base_imp = base_impact_by_cs.get(cs)

            base_rwy = base_imp.proposedRunway if base_imp else (ac.assignedRunway or "30L")
            base_seq = base_imp.proposedSequenceNumber if base_imp else global_seq_by_cs[cs]
            base_rwy_seq = base_imp.proposedRunwaySequenceNumber if base_imp else rwy_seq_by_cs[cs]
            prop_seq = global_seq_by_cs[cs]
            prop_rwy_seq = rwy_seq_by_cs[cs]

            e_sec = unconstrained_sec_by_cs[cs]
            t_sec = scheduled_sec_by_cs[cs]
            hold_sec = max(0.0, t_sec - e_sec)

            e_utc = _format_iso_utc(now_dt + datetime.timedelta(seconds=e_sec))
            prop_utc = _format_iso_utc(now_dt + datetime.timedelta(seconds=t_sec))
            if base_imp:
                base_utc = base_imp.proposedLandingTimeUtc
                base_t_sec = (_parse_iso_utc(base_utc) - now_dt).total_seconds()
                delta_sec = round(t_sec - base_t_sec, 1)
            else:
                base_utc = prop_utc
                delta_sec = 0.0

            rwy_changed = (prop_rwy != base_rwy)
            if rwy_changed:
                runway_change_count += 1

            # Check frozen slot violation against baseline
            if not is_baseline and is_comm:
                if rwy_changed or prop_rwy_seq > base_rwy_seq or delta_sec > 5.0:
                    code = f"FROZEN_SLOT_VIOLATION:{cs}"
                    per_ac_failures[cs].append(code)
                    if code not in hard_failures:
                        hard_failures.append(code)

            # Fuel estimation at landing (never invent missing fuel!)
            if cs in missing_fuel_callsigns or ac.fuel.totalKg is None or ac.fuel.finalReserveKg is None or ac.fuel.holdingFuelFlowKgH is None:
                fuel_status = "UNKNOWN"
                est_landing_fuel = None
                landing_margin = None
                base_margin = None
                margin_delta = None
                if not is_baseline and (cs == target_id or delta_sec > 5.0):
                    code = f"MISSING_FUEL_OR_RESERVE_DATA:{cs}"
                    per_ac_failures[cs].append(code)
                    if code not in hard_failures:
                        hard_failures.append(code)
            else:
                hold_flow = float(ac.fuel.holdingFuelFlowKgH)
                app_flow = float(ac.fuel.approachFuelFlowKgH or (hold_flow * 0.92))
                desc_flow = float(ac.fuel.descentFuelFlowKgH or (hold_flow * 0.85))
                if ac.flightPhase == FlightPhase.ARRIVAL:
                    transit_flow = 0.5 * desc_flow + 0.5 * app_flow
                else:
                    transit_flow = app_flow

                burn_kg = (
                    (transit_flow * (e_sec / 3600.0)) + (hold_flow * (hold_sec / 3600.0))
                ) * fuel_burn_mult
                est_landing_fuel = round(max(0.0, float(ac.fuel.totalKg) - burn_kg), 1)
                landing_margin = round(est_landing_fuel - float(ac.fuel.finalReserveKg), 1)

                if base_imp and base_imp.landingFuelMarginKg is not None:
                    base_margin = base_imp.landingFuelMarginKg
                    margin_delta = round(landing_margin - base_margin, 1)
                else:
                    base_margin = landing_margin
                    margin_delta = 0.0

                if landing_margin < 0.0:
                    fuel_status = "BELOW_RESERVE"
                elif landing_margin < caution_margin_kg:
                    fuel_status = "NEAR_RESERVE"
                else:
                    fuel_status = "SAFE"

                # Displaced aircraft fuel reserve safety invariant
                is_displaced = (delta_sec > 5.0 or prop_rwy_seq > base_rwy_seq)
                if not is_baseline and cs != target_id and is_displaced:
                    if landing_margin < min_displaced_margin_kg:
                        code = f"DISPLACED_AIRCRAFT_FUEL_RESERVE_BREACH:{cs}(margin={landing_margin:.0f}kg<min={min_displaced_margin_kg:.0f}kg)"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)
                    elif cs in secondary_emergencies and delta_sec > 30.0 and landing_margin < caution_margin_kg:
                        code = f"SECONDARY_EMERGENCY_ENDANGERED:{cs}(delay=+{delta_sec:.0f}s,margin={landing_margin:.0f}kg)"
                        per_ac_failures[cs].append(code)
                        if code not in hard_failures:
                            hard_failures.append(code)

                if not is_baseline and cs == target_id and landing_margin < 0.0:
                    code = f"EMERGENCY_AIRCRAFT_BELOW_FINAL_RESERVE:{cs}(margin={landing_margin:.0f}kg)"
                    per_ac_failures[cs].append(code)
                    if code not in hard_failures:
                        hard_failures.append(code)

            # Aggregate displacement and safety exposure metrics for non-target aircraft
            if cs != target_id:
                if delta_sec > 5.0:
                    displaced_count += 1
                    total_added_delay_sec += delta_sec
                    if delta_sec > max_displaced_delay_sec:
                        max_displaced_delay_sec = delta_sec
                if landing_margin is not None:
                    if (delta_sec > 5.0 or not is_baseline) and landing_margin < caution_margin_kg:
                        if delta_sec > 5.0:
                            displaced_near_reserve_count += 1
                    if delta_sec > 5.0 or is_baseline:
                        if min_displaced_fuel_margin is None or landing_margin < min_displaced_fuel_margin:
                            min_displaced_fuel_margin = landing_margin
                            worst_displaced_cs = cs

            sep_info = sep_info_by_cs[cs]
            per_aircraft_impacts.append(
                PerAircraftSequenceImpact(
                    callsign=cs,
                    aircraftType=ac.aircraftType,
                    wakeCategory=ac.wakeCategory,
                    isEmergencyTarget=(cs == target_id),
                    declarationType=ac.priority.declarationType.value,
                    declarationStatus=ac.priority.declarationStatus.value,
                    priorityLevel=ac.priority.level.value,
                    isCommittedSlot=is_comm,
                    committedReason=comm_reason,
                    baselineRunway=base_rwy,
                    proposedRunway=prop_rwy,
                    runwayChanged=rwy_changed,
                    baselineSequenceNumber=base_seq,
                    proposedSequenceNumber=prop_seq,
                    baselineRunwaySequenceNumber=base_rwy_seq,
                    proposedRunwaySequenceNumber=prop_rwy_seq,
                    sequenceShift=prop_seq - base_seq,
                    earliestUnconstrainedEtaUtc=e_utc,
                    baselineLandingTimeUtc=base_utc,
                    proposedLandingTimeUtc=prop_utc,
                    landingTimeDeltaSec=delta_sec,
                    landingTimeDeltaMin=round(delta_sec / 60.0, 2),
                    addedHoldingTimeSec=round(hold_sec, 1),
                    addedHoldingTimeMin=round(hold_sec / 60.0, 2),
                    requiredSeparationBehindLeaderSec=sep_info["requiredSeparationSec"],
                    requiredSeparationDistanceNm=sep_info["requiredDistanceNm"],
                    governingSeparationRule=sep_info["governingConstraint"],
                    leaderCallsign=leader_by_cs[cs],
                    currentFuelKg=ac.fuel.totalKg,
                    finalReserveKg=ac.fuel.finalReserveKg,
                    estimatedLandingFuelKg=est_landing_fuel,
                    baselineLandingFuelMarginKg=base_margin,
                    landingFuelMarginKg=landing_margin,
                    fuelMarginDeltaKg=margin_delta,
                    fuelStatus=fuel_status,
                    constraintFailures=per_ac_failures[cs],
                    warnings=per_ac_warnings[cs],
                )
            )
            for w in per_ac_warnings[cs]:
                if w not in warnings:
                    warnings.append(w)

        target_imp = next(i for i in per_aircraft_impacts if i.callsign == target_id)
        emerg_gained_sec = round(-target_imp.landingTimeDeltaSec, 1)  # positive = time saved

        # If baseline had no constraint failures on the emergency aircraft (nor secondary emergencies),
        # reject any candidate that makes the emergency aircraft land later than baseline.
        if not is_baseline and strategy_type != "FCFS" and baseline_reference is not None:
            base_target_imp = base_impact_by_cs.get(target_id)
            base_emerg_had_failure = bool(base_target_imp and base_target_imp.constraintFailures)
            for sec_id in secondary_emergencies:
                sec_base_imp = base_impact_by_cs.get(sec_id)
                if sec_base_imp and sec_base_imp.constraintFailures:
                    base_emerg_had_failure = True
            if not base_emerg_had_failure and emerg_gained_sec < 0.0:
                code = f"NO_EMERGENCY_TIME_BENEFIT_OVER_BASELINE:{target_id}(loses_{abs(emerg_gained_sec):.0f}s)"
                target_imp.constraintFailures.append(code)
                if code not in hard_failures:
                    hard_failures.append(code)

        return {
            "feasible": len(hard_failures) == 0,
            "proposedOrder": global_order,
            "emergencyRunway": target_imp.proposedRunway,
            "emergencyLandingSec": scheduled_sec_by_cs[target_id],
            "emergencyBaselineLandingTimeUtc": target_imp.baselineLandingTimeUtc,
            "emergencyProposedLandingTimeUtc": target_imp.proposedLandingTimeUtc,
            "emergencyTimeGainedSec": emerg_gained_sec,
            "emergencyTimeGainedMin": round(emerg_gained_sec / 60.0, 2),
            "emergencyLandingFuelMarginKg": target_imp.landingFuelMarginKg,
            "emergencyFuelStatus": target_imp.fuelStatus,
            "totalAddedDelaySec": round(total_added_delay_sec, 1),
            "totalAddedDelayMin": round(total_added_delay_sec / 60.0, 2),
            "maxDisplacedDelaySec": round(max_displaced_delay_sec, 1),
            "maxDisplacedDelayMin": round(max_displaced_delay_sec / 60.0, 2),
            "displacedAircraftCount": displaced_count,
            "displacedNearReserveCount": displaced_near_reserve_count,
            "minDisplacedFuelMarginKg": min_displaced_fuel_margin,
            "worstDisplacedCallsign": worst_displaced_cs,
            "runwayChangeCount": runway_change_count,
            "hardConstraintFailures": hard_failures,
            "warnings": warnings,
            "perAircraftImpacts": per_aircraft_impacts,
        }

    @staticmethod
    def _lexicographic_sort_key(c: CandidateSequencePlan) -> Tuple[Any, ...]:
        """
        Lexicographic ordering:
          Tier 1: Hard-constraint feasibility (0 violations < >0 violations)
          Tier 2: Other aircraft safety exposure (displacedNearReserveCount ASC) &
                  Emergency response time (emergencyTimeGainedSec DESC) &
                  Worst displaced fuel margin (minDisplacedFuelMarginKg DESC)
          Tier 3: Total delay (totalAddedDelaySec ASC), max displaced delay (ASC),
                  displaced aircraft count (ASC), runway change count (ASC)
        """
        t1_infeasible = 0 if c.feasible else 1
        t1_violations = len(c.hardConstraintFailures)

        t2_near_res = c.displacedNearReserveCount
        t2_emerg_time_gained = -c.emergencyTimeGainedSec
        t2_min_disp_margin = -(c.minDisplacedFuelMarginKg if c.minDisplacedFuelMarginKg is not None else 9999.0)

        t3_total_delay = c.totalAddedDelaySec
        t3_max_delay = c.maxDisplacedDelaySec
        t3_disp_count = c.displacedAircraftCount
        t3_rwy_changes = c.runwayChangeCount

        return (
            t1_infeasible,
            t1_violations,
            t2_near_res,
            t2_emerg_time_gained,
            t2_min_disp_margin,
            t3_total_delay,
            t3_max_delay,
            t3_disp_count,
            t3_rwy_changes,
            c.candidateId,
        )
