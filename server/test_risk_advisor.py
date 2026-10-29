import copy
from app.state import AppState
from app.risk_advisor import EmergencySequenceRiskAdvisor
from app.knowledge_core import default_knowledge_core
from app.models import (
    PriorityLevel,
    EmergencyDeclarationType,
    DeclarationStatus,
    LvpApproach,
    RunwayOperationalState,
    RunwayOperationalStatus,
    RunwayMode,
    RvrItem,
)


def _fresh_state() -> AppState:
    return AppState()


def test_knowledge_core_loaded_and_versioned():
    kc = default_knowledge_core
    assert kc.policy_version == "OMDB-KC-2026.10-v1.0.0"
    meta = kc.get_metadata_summary()
    assert meta["aerodromeIcao"] == "OMDB"
    assert len(meta["references"]) >= 5
    # Verify GCAA wake matrix values (not 3 NM / 6 NM demo values)
    sep_lvo = kc.get_inter_arrival_separation_sec("SUPER", "MEDIUM", lvp_active=True, lvp_phase="LVP_ACTIVE")
    assert sep_lvo["requiredDistanceNm"] >= 7.0
    assert sep_lvo["requiredSeparationSec"] >= 180.0


def test_1_normal_traffic_requires_manual_review():
    st = _fresh_state()
    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="UAE231",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "MANUAL_REVIEW_REQUIRED"
    assert any("NO_CONFIRMED_EMERGENCY_DECLARATION" in r for r in res.statusReasons)
    assert len(res.recommendedCandidates) == 0


def test_2_confirmed_mayday_feasible_resequencing_and_frozen_slot_protection():
    st = _fresh_state()
    # BAW107 is on 30L in HOLDING (seq #8 globally, #5 on 30L behind frozen SIA317 on FINAL at 5.2 NM)
    baw = st.aircraft["BAW107"]
    baw.priority.level = PriorityLevel.EMERGENCY
    baw.priority.declarationType = EmergencyDeclarationType.MAYDAY
    baw.priority.declarationStatus = DeclarationStatus.CONFIRMED

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="BAW107",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "FEASIBLE_CANDIDATES_AVAILABLE"
    assert len(res.recommendedCandidates) >= 1
    assert len(res.recommendedCandidates) <= 3

    best = res.recommendedCandidates[0]
    assert best.feasible is True
    assert best.emergencyTimeGainedSec > 180.0  # Gains > 3 minutes over baseline
    # Frozen short-final flight SIA317 (5.2 NM on FINAL) must remain untouched at Slot #1 on 30L
    sia_imp = next(i for i in best.perAircraftImpacts if i.callsign == "SIA317")
    assert sia_imp.isCommittedSlot is True
    assert sia_imp.proposedRunway == "30L"
    assert sia_imp.proposedRunwaySequenceNumber == 1
    assert abs(sia_imp.landingTimeDeltaSec) <= 5.0

    # Verify the unconstrained Slot #1 override probe that displaced SIA317 was explicitly rejected
    rejected_ids = {rc.candidateId: rc for rc in res.rejectedCandidates}
    assert "CAND_UNCONSTRAINED_SLOT1_30L" in rejected_ids
    slot1_probe = rejected_ids["CAND_UNCONSTRAINED_SLOT1_30L"]
    assert slot1_probe.feasible is False
    assert any("FROZEN_SLOT_VIOLATION:SIA317" in f for f in slot1_probe.hardConstraintFailures)


def test_3_confirmed_pan_pan_resequencing_and_cps_swap():
    st = _fresh_state()
    # FDB512 is on 30R at 23.5 NM (seq #4 on 30R behind THY762, IGO1433, JAL36)
    fdb = st.aircraft["FDB512"]
    fdb.priority.level = PriorityLevel.EMERGENCY
    fdb.priority.declarationType = EmergencyDeclarationType.PAN_PAN
    fdb.priority.declarationStatus = DeclarationStatus.CONFIRMED

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "FEASIBLE_CANDIDATES_AVAILABLE"
    best = res.recommendedCandidates[0]
    assert best.feasible is True
    assert best.emergencyTimeGainedSec > 120.0
    # Stress scenarios must be present and labeled as scenario results
    assert len(best.stressScenarioResults) == 4
    assert "NOT CALIBRATED PROBABILITIES" in res.uncertaintyAssumptions["disclaimer"].upper()


def test_4_minimum_fuel_without_declaration_does_not_infer_mayday():
    st = _fresh_state()
    # FDB512 starts with MINIMUM_FUEL and declarationType=NONE
    fdb = st.aircraft["FDB512"]
    assert fdb.priority.level == PriorityLevel.MINIMUM_FUEL
    assert fdb.priority.declarationType == EmergencyDeclarationType.NONE

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "MANUAL_REVIEW_REQUIRED"
    assert any("MINIMUM_FUEL_NO_EMERGENCY_DECLARATION" in r for r in res.statusReasons)
    assert len(res.recommendedCandidates) == 0


def test_5_medical_report_awaiting_confirmation_blocks_autonomous_resequence():
    st = _fresh_state()
    # THY762 starts with MEDICAL and declarationStatus=UNCONFIRMED
    thy = st.aircraft["THY762"]
    assert thy.priority.level == PriorityLevel.MEDICAL
    assert thy.priority.declarationStatus == DeclarationStatus.UNCONFIRMED

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="THY762",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "MANUAL_REVIEW_REQUIRED"
    assert any("MEDICAL_REPORT_AWAITING_DECLARATION_CONFIRMATION" in r for r in res.statusReasons)
    assert len(res.recommendedCandidates) == 0


def test_6_two_simultaneous_emergencies_hierarchy_and_parallel_split():
    st = _fresh_state()
    # Emergency 1: THY762 on 30R confirmed MAYDAY
    thy = st.aircraft["THY762"]
    thy.priority.level = PriorityLevel.EMERGENCY
    thy.priority.declarationType = EmergencyDeclarationType.MAYDAY
    thy.priority.declarationStatus = DeclarationStatus.CONFIRMED

    # Emergency 2: FDB512 on 30R confirmed PAN_PAN
    fdb = st.aircraft["FDB512"]
    fdb.priority.level = PriorityLevel.EMERGENCY
    fdb.priority.declarationType = EmergencyDeclarationType.PAN_PAN
    fdb.priority.declarationStatus = DeclarationStatus.CONFIRMED

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "FEASIBLE_CANDIDATES_AVAILABLE"
    assert "THY762" in res.secondaryEmergencyAircraftIds
    # In any feasible candidate where both are on 30R, FDB512 (PAN_PAN) must NOT be sequenced ahead of THY762 (MAYDAY)
    for cand in res.recommendedCandidates:
        r30r = cand.runwayOrders.get("30R", [])
        if "THY762" in r30r and "FDB512" in r30r:
            assert r30r.index("THY762") < r30r.index("FDB512")

    dual_candidates = [c for c in res.recommendedCandidates if c.strategyType == "DUAL_EMERGENCY"]
    assert len(dual_candidates) >= 1


def test_7_low_visibility_approach_ineligibility_and_smr_check():
    st = _fresh_state()
    # Set dense fog LVP weather (RVR 400m / 450m, ceiling 100ft, LVP active)
    from app.models import WeatherPayload
    st.weather = WeatherPayload(**st.weather_timeline[3])
    # Make IGO1433 (which is only CAT_I capable, requiring RVR >= 550m) declare confirmed MAYDAY in LVP RVR 350m
    igo = st.aircraft["IGO1433"]
    assert igo.capability.lvpApproach == LvpApproach.CAT_I
    igo.priority.level = PriorityLevel.EMERGENCY
    igo.priority.declarationType = EmergencyDeclarationType.MAYDAY
    igo.priority.declarationStatus = DeclarationStatus.CONFIRMED

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="IGO1433",
        sim_time_iso=st.get_sim_time_iso(),
    )
    # Because OMDB RVR is 300-350m and IGO1433 is CAT_I (min 550m RVR), all OMDB landing candidates fail approach eligibility
    assert res.evaluationStatus == "NO_FEASIBLE_PLAN"
    assert any("APPROACH_VISIBILITY_INELIGIBLE:IGO1433" in r for r in res.statusReasons)
    assert len(res.recommendedCandidates) == 0

    # Also test SMR unserviceable when RVR <= 300m on 30R for a CAT_IIIA aircraft (FDB512)
    st2 = _fresh_state()
    fdb = st2.aircraft["FDB512"]
    fdb.priority.level = PriorityLevel.EMERGENCY
    fdb.priority.declarationType = EmergencyDeclarationType.MAYDAY
    fdb.priority.declarationStatus = DeclarationStatus.CONFIRMED
    st2.weather.smrServiceable = False
    st2.weather.rvr = [RvrItem(runway="30L", valueM=250), RvrItem(runway="30R", valueM=250)]

    res_smr = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st2.aircraft.values()),
        weather=st2.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st2.get_sim_time_iso(),
    )
    assert res_smr.evaluationStatus == "NO_FEASIBLE_PLAN"
    assert any("SMR_UNSERVICEABLE_BELOW_300M_RVR" in r for r in res_smr.statusReasons)


def test_8_runway_closure_rejects_closed_runway_and_recommends_parallel_sidestep():
    st = _fresh_state()
    # FDB512 on 30R declares confirmed MAYDAY while RWY 30R is CLOSED
    fdb = st.aircraft["FDB512"]
    fdb.priority.level = PriorityLevel.EMERGENCY
    fdb.priority.declarationType = EmergencyDeclarationType.MAYDAY
    fdb.priority.declarationStatus = DeclarationStatus.CONFIRMED

    rwy_states = [
        RunwayOperationalState(
            runway="30L",
            serviceable=True,
            status=RunwayOperationalStatus.OPEN,
            mode=RunwayMode.MIXED,
        ),
        RunwayOperationalState(
            runway="30R",
            serviceable=False,
            status=RunwayOperationalStatus.CLOSED,
            mode=RunwayMode.CLOSED,
            reason="Emergency runway inspection",
        ),
    ]

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st.get_sim_time_iso(),
        runway_states=rwy_states,
    )
    assert res.evaluationStatus == "FEASIBLE_CANDIDATES_AVAILABLE"
    best = res.recommendedCandidates[0]
    assert best.emergencyRunway == "30L"
    assert best.strategyType == "ALTERNATE_RUNWAY"

    # All 30R candidates must be in rejectedCandidates with RUNWAY_CLOSED:30R
    r30r_rejected = [rc for rc in res.rejectedCandidates if rc.emergencyRunway == "30R"]
    assert len(r30r_rejected) >= 1
    for rc in r30r_rejected:
        assert any("RUNWAY_CLOSED:30R" in f for f in rc.hardConstraintFailures)


def test_9_unknown_wake_category_requires_manual_review():
    st = _fresh_state()
    fdb = st.aircraft["FDB512"]
    fdb.priority.level = PriorityLevel.EMERGENCY
    fdb.priority.declarationType = EmergencyDeclarationType.MAYDAY
    fdb.priority.declarationStatus = DeclarationStatus.CONFIRMED
    fdb.wakeCategory = "UNKNOWN_CAT"

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "MANUAL_REVIEW_REQUIRED"
    assert any("UNKNOWN_WAKE_CATEGORY" in r for r in res.statusReasons)
    assert len(res.recommendedCandidates) == 0


def test_10_stale_telemetry_requires_manual_review():
    st = _fresh_state()
    fdb = st.aircraft["FDB512"]
    fdb.priority.level = PriorityLevel.EMERGENCY
    fdb.priority.declarationType = EmergencyDeclarationType.MAYDAY
    fdb.priority.declarationStatus = DeclarationStatus.CONFIRMED
    # Set observedAtUtc 95 seconds older than sim_time_iso (2026-10-28T03:00:00Z)
    fdb.observedAtUtc = "2026-10-28T02:58:25Z"

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "MANUAL_REVIEW_REQUIRED"
    assert any("STALE_TELEMETRY" in r for r in res.statusReasons)
    assert "FDB512" in res.freshnessSummary["staleAircraft"]
    assert len(res.recommendedCandidates) == 0


def test_11_missing_fuel_data_reports_unknown_and_requires_review():
    st = _fresh_state()
    fdb = st.aircraft["FDB512"]
    fdb.priority.level = PriorityLevel.EMERGENCY
    fdb.priority.declarationType = EmergencyDeclarationType.MAYDAY
    fdb.priority.declarationStatus = DeclarationStatus.CONFIRMED
    fdb.fuel.totalKg = None
    fdb.fuel.finalReserveKg = None
    fdb.missingDataReasons.append("Missing ADS-B fuel telemetry")

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="FDB512",
        sim_time_iso=st.get_sim_time_iso(),
    )
    assert res.evaluationStatus == "MANUAL_REVIEW_REQUIRED"
    assert any("MISSING_FUEL_OR_RESERVE_DATA" in r for r in res.statusReasons)
    assert len(res.recommendedCandidates) == 0

    # Verify fuelStatus is UNKNOWN and no fuel quantity was invented
    base_fdb = next(i for i in res.baseline.perAircraftImpacts if i.callsign == "FDB512")
    assert base_fdb.fuelStatus == "UNKNOWN"
    assert base_fdb.estimatedLandingFuelKg is None
    assert base_fdb.landingFuelMarginKg is None


def test_12_plan_helping_emergency_but_endangering_displaced_aircraft_is_rejected():
    st = _fresh_state()
    # KAL51 on 30L (seq #4 on 30L) declares confirmed MAYDAY
    kal = st.aircraft["KAL51"]
    kal.priority.level = PriorityLevel.EMERGENCY
    kal.priority.declarationType = EmergencyDeclarationType.MAYDAY
    kal.priority.declarationStatus = DeclarationStatus.CONFIRMED

    # Put DLH788 and UAE231 (ahead of KAL51 on 30L) right on the edge of their final reserve
    # so any delay on 30L pushes them below the 200 kg minimum reserve margin!
    dlh = st.aircraft["DLH788"]
    dlh.fuel.totalKg = 3150.0  # finalReserveKg is 2800.0; ~275 kg burn to land -> ~75 kg margin if delayed
    uae = st.aircraft["UAE231"]
    uae.fuel.totalKg = 3350.0  # finalReserveKg is 2900.0; ~440 kg burn to land -> < 200 kg margin if delayed

    res = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="KAL51",
        sim_time_iso=st.get_sim_time_iso(),
    )
    # Any candidate that displaces UAE231 or DLH788 on 30L must be rejected with DISPLACED_AIRCRAFT_FUEL_RESERVE_BREACH
    rejected_30l = [
        rc for rc in res.rejectedCandidates
        if rc.candidateId in ("CAND_EARLIEST_30L_SLOT2", "CAND_SWAP_30L_UP1", "CAND_SWAP_30L_UP2")
    ]
    assert len(rejected_30l) >= 2
    for rc in rejected_30l:
        assert rc.feasible is False
        assert any("DISPLACED_AIRCRAFT_FUEL_RESERVE_BREACH" in f for f in rc.hardConstraintFailures)

    # No recommended candidate may violate a hard constraint or breach displaced aircraft reserve
    for rec in res.recommendedCandidates:
        assert rec.feasible is True
        assert len(rec.hardConstraintFailures) == 0


def test_13_determinism_and_non_mutation():
    st = _fresh_state()
    baw = st.aircraft["BAW107"]
    baw.priority.level = PriorityLevel.EMERGENCY
    baw.priority.declarationType = EmergencyDeclarationType.MAYDAY
    baw.priority.declarationStatus = DeclarationStatus.CONFIRMED

    snapshot_before = copy.deepcopy(st.aircraft)
    weather_before = copy.deepcopy(st.weather)

    res1 = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="BAW107",
        sim_time_iso=st.get_sim_time_iso(),
    )
    res2 = EmergencySequenceRiskAdvisor.evaluate(
        aircraft_list=list(st.aircraft.values()),
        weather=st.weather,
        target_aircraft_id="BAW107",
        sim_time_iso=st.get_sim_time_iso(),
    )

    assert res1.model_dump() == res2.model_dump()
    assert {k: v.model_dump() for k, v in st.aircraft.items()} == {
        k: v.model_dump() for k, v in snapshot_before.items()
    }
    assert st.weather.model_dump() == weather_before.model_dump()
