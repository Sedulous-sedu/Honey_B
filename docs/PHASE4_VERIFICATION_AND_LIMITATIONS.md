# Phase 4 — Verification, Baseline Comparison, and Limitations

> **NON-OPERATIONAL DISCLAIMER**: Honey B and the Emergency Sequence Change Risk Advisor are **hackathon simulation decision-support prototypes**, not certified Air Traffic Management (ATM) or Air Traffic Control (ATC) systems. Nothing in this repository constitutes operational safety assurance or regulatory compliance with GCAA CAR-ANS, ICAO Doc 4444, or EUROCAE ED-137/ED-153.

---

## 1. Verification Matrix (`server/test_risk_advisor.py` & `server/test_server.py`)

All 25 automated tests pass (`server/.venv/bin/pytest server/test_risk_advisor.py server/test_server.py -v`):

| # | Test Scenario / Invariant | Test Function | Verified Outcome |
|---|---|---|---|
| 1 | **Normal traffic** (`UAE231`, `NORMAL`, `declarationType=NONE`) | `test_1_normal_traffic_requires_manual_review` | Returns `MANUAL_REVIEW_REQUIRED` (`NO_CONFIRMED_EMERGENCY_DECLARATION`); `recommendedCandidates` is empty. |
| 2 | **Confirmed MAYDAY** (`BAW107` on RWY 30L) + **Frozen slot preservation** (`SIA317` on short final) | `test_2_confirmed_mayday_feasible_resequencing_and_frozen_slot_protection` | Returns `FEASIBLE_CANDIDATES_AVAILABLE`; top candidate `CAND_EARLIEST_30L_SLOT2` saves `6.23 min` (`374.2s`), preserves committed `SIA317` at Slot #1 (`Δt = 0s`), and rejects `CAND_UNCONSTRAINED_SLOT1_30L` with `FROZEN_SLOT_VIOLATION:SIA317`. |
| 3 | **Confirmed PAN PAN** (`FDB512` on RWY 30R) + **CPS nearby swaps** | `test_3_confirmed_pan_pan_resequencing_and_cps_swap` | Returns `FEASIBLE_CANDIDATES_AVAILABLE`; top candidate `CAND_SWAP_30R_UP2` advances `FDB512` by 2 slots to Slot #2 behind `THY762`, saving `2.31 min` (`138.8s`) while avoiding unnecessary delay to `THY762`. |
| 4 | **Minimum fuel without emergency declaration** (`FDB512`, `MINIMUM_FUEL`, `declarationType=NONE`) | `test_4_minimum_fuel_without_declaration_does_not_infer_mayday` | Returns `MANUAL_REVIEW_REQUIRED` (`MINIMUM_FUEL_NO_EMERGENCY_DECLARATION`). Does **not** infer `MAYDAY` or `PAN_PAN` from `MINIMUM_FUEL`. |
| 5 | **Medical report awaiting confirmation** (`THY762`, `MEDICAL`, `declarationStatus=UNCONFIRMED`) | `test_5_medical_report_awaiting_confirmation_blocks_autonomous_resequence` | Returns `MANUAL_REVIEW_REQUIRED` (`MEDICAL_REPORT_AWAITING_DECLARATION_CONFIRMATION`) per GCAA eAIC 2020-06 until Pilot-in-Command declaration is confirmed. |
| 6 | **Two simultaneous emergencies** (`THY762` `MAYDAY` + `FDB512` `PAN_PAN`) | `test_6_two_simultaneous_emergencies_hierarchy_and_parallel_split` | Enforces `MAYDAY > PAN_PAN` hierarchy (`FDB512` never sequenced ahead of `THY762` on the same runway) and evaluates dual-emergency parallel split (`30L` / `30R`) and tandem options. |
| 7 | **Low visibility & SMR unserviceability** (`IGO1433` CAT I in RVR 400m; `FDB512` with SMR unserviceable at RVR 250m) | `test_7_low_visibility_approach_ineligibility_and_smr_check` | Returns `NO_FEASIBLE_PLAN` with `APPROACH_VISIBILITY_INELIGIBLE:IGO1433` and `SMR_UNSERVICEABLE_BELOW_300M_RVR` per GCAA OMDB AIP AD 2.22. |
| 8 | **Runway closure** (`RWY 30R` closed while `FDB512` declares `MAYDAY`) | `test_8_runway_closure_rejects_closed_runway_and_recommends_parallel_sidestep` | Rejects all `30R` candidates with `RUNWAY_CLOSED:30R(FDB512)` and recommends `CAND_ALT_RWY_30L_SLOT2` (parallel sidestep to open `RWY 30L`). |
| 9 | **Unknown wake group** (`wakeCategory="UNKNOWN_CAT"`) | `test_9_unknown_wake_category_requires_manual_review` | Returns `MANUAL_REVIEW_REQUIRED` (`UNKNOWN_WAKE_CATEGORY`) and withholds automated recommendations. |
| 10 | **Stale telemetry** (`observedAtUtc` age `95s > 30s` threshold) | `test_10_stale_telemetry_requires_manual_review` | Returns `MANUAL_REVIEW_REQUIRED` (`STALE_TELEMETRY`) and lists stale callsigns in `freshnessSummary`. |
| 11 | **Missing fuel data** (`totalKg=None`, `finalReserveKg=None`) | `test_11_missing_fuel_data_reports_unknown_and_requires_review` | Reports `fuelStatus="UNKNOWN"` (`estimatedLandingFuelKg=None`, `landingFuelMarginKg=None` — never invents fuel quantities) and returns `MANUAL_REVIEW_REQUIRED` (`MISSING_FUEL_OR_RESERVE_DATA`). |
| 12 | **Plan helping emergency aircraft but endangering a displaced aircraft** (`KAL51` `MAYDAY` when `UAE231` & `DLH788` are near final reserve) | `test_12_plan_helping_emergency_but_endangering_displaced_aircraft_is_rejected` | Rejects `30L` insertion/swap candidates that push `UAE231` or `DLH788` below the `200 kg` above-reserve safety buffer with `DISPLACED_AIRCRAFT_FUEL_RESERVE_BREACH`. |
| 13 | **Safety invariant: no infeasible recommendation displayed as safe** | `test_14_no_infeasible_recommendation_ever_displayed_as_safe` | Across full aerodrome closure and constraint breaches, `recommendedCandidates` is strictly empty (`[]`) and every rejected plan has `feasible=False` with explicit blocker codes. |
| 14 | **Determinism & Non-mutation** (Engine + HTTP API) | `test_13_determinism_and_non_mutation`, `test_16_api_evaluation_endpoint_determinism_and_no_commands_issued`, `test_risk_advisor_api_non_mutating_and_approval_separation` | Fixed snapshots produce identical JSON outputs; `POST /api/risk-advisor/evaluate` never mutates `state.aircraft`, `state.revision`, or `state.commands`; controller sequence approval is separate from issuing ATC commands; pilot-ground integration (`GET /api/dashboard/{id}`, `POST /api/pilot-response`) passes. |

---

## 2. Quantitative Comparison: Advisor vs. Current Order and FCFS Baselines

Snapshot time: `2026-10-28T03:00:00Z` (`OMDB-KC-2026.10-v1.0.0`):

### Case A — `BAW107` Confirmed `MAYDAY` on RWY 30L (Currently in Holding at 8.5 NM, Sequence #8 Globally / #5 on 30L)

| Strategy | `BAW107` Predicted Landing UTC | Emergency Time Gained vs. Current | `BAW107` Landing Fuel Margin Above Reserve | Frozen Final Slot (`SIA317`) Preserved? | Total Added Delay to Other Flights | Minimum Fuel Margin Among Displaced Flights |
|---|---|---|---|---|---|---|
| **Current Order Baseline** (`BASELINE_CURRENT_ORDER`) | `03:10:02Z` | `0.00 min` | `6,062.0 kg` | Yes (`Slot #1`) | `0.00 min` | `1,070.9 kg` (baseline stream) |
| **First-Come-First-Served** (`BASELINE_FCFS_ORDER`) | `03:05:09Z` | `+4.88 min` | `6,485.0 kg` | Yes (`Slot #1`) | `1.80 min` | `7,700.3 kg` |
| **Risk Advisor #1** (`CAND_EARLIEST_30L_SLOT2` — Earliest Feasible Insertion behind `SIA317`) | **`03:03:48Z`** | **`+6.23 min`** | **`6,596.5 kg`** | **Yes (`Slot #1`)** | **`1.15 min`** | **`5,764.5 kg`** (`UAE231`) |

### Case B — `FDB512` Confirmed `PAN_PAN` on RWY 30R (Inbound at 23.5 NM, Sequence #6 Globally / #4 on 30R)

| Strategy | `FDB512` Predicted Landing UTC | Emergency Time Gained vs. Current | `FDB512` Landing Fuel Margin Above Reserve | Total Added Delay to Other Flights | Displaced Flights | Minimum Fuel Margin Among Displaced Flights |
|---|---|---|---|---|---|---|
| **Current Order Baseline** (`BASELINE_CURRENT_ORDER`) | `03:09:05Z` | `0.00 min` | `1,070.9 kg` | `0.00 min` | `0` | `2,118.4 kg` (baseline stream) |
| **First-Come-First-Served** (`BASELINE_FCFS_ORDER`) | `03:09:05Z` | `0.00 min` | `1,070.9 kg` | `1.80 min` | `1` | `7,700.3 kg` |
| **Risk Advisor #1** (`CAND_SWAP_30R_UP2` — Constrained Position Shift +2 Slots on RWY 30R to Slot #2) | **`03:06:46Z`** | **`+2.31 min`** | **`1,160.3 kg`** | **`5.72 min`** | **`2` (`JAL36`, `IGO1433`)** | **`2,025.4 kg`** (`IGO1433`) |

Why `CAND_SWAP_30R_UP2` beats unconstrained Slot #1 insertion (`CAND_EARLIEST_30R_SLOT1`) under lexicographic ranking:
- Lead flight `THY762` (`11.5 NM` out on `30R`) lands and clears the wake separation window before `FDB512` (`23.5 NM` out) can physically reach the `30R` threshold even at expedited speed.
- Placing `FDB512` at Slot #2 behind `THY762` achieves the **exact same earliest physical landing time (`03:06:46Z`)** for `FDB512` as Slot #1, while sparing `THY762` from unnecessary holding delay (reducing displaced aircraft count from 3 to 2).

---

## 3. Simulation Limitations

1. **Simplified 2D Point-Mass Kinematics**:
   - Unconstrained ETA (`_compute_unconstrained_eta_sec`) uses a two-segment groundspeed model (outer approach segment + final 6 NM segment) with fixed time penalties for holding pattern exit (`45s` expedited / `90s` standard) and parallel runway sidestep (`45s` beyond `5.0 NM`). It does not model full 4D FMS trajectory intents, turn radius dynamics, altitude-dependent true airspeed (TAS) wind shear profiles, or STAR waypoint altitude/speed constraints.
2. **Dependent Parallel Runway Approximation**:
   - Candidate schedules treat `30L` and `30R` arrival streams as independent per-runway queues once sidestep distance (`>= 5.0 NM`) and runway mode (`ARRIVAL` / `MIXED`) checks pass. Because OMDB `30L`/`30R` centerlines are separated by `380 m` (`1,247 ft`), real-world operations require diagonal staggered radar separation (`1.5 NM` / `2.0 NM`) and wake interaction checks across parallel approaches (GCAA OMDB AIP AD 2.22).
3. **Phase-Specific Fuel Burn Approximation**:
   - Fuel burn is integrated from reported/simulated `holdingFuelFlowKgH`, `approachFuelFlowKgH`, and `descentFuelFlowKgH` without aircraft-mass updates, flap/gear drag schedules, or APU/anti-ice bleed penalties.
4. **Deterministic Stress Scenarios Are Not Calibrated Probabilities**:
   - The 4 stress scenarios (`SCEN_NOMINAL`, `SCEN_MODERATE_HEADWIND_ROT`, `SCEN_HIGH_BURN_LATE_ETA`, `SCEN_COMPOUND_LVO_STRESS`) test sensitivity to fixed perturbations (`+30s` to `+90s` ETA jitter, `1.10x` to `1.20x` fuel burn, `+10s` to `+20s` ROT). They do not represent empirical likelihoods or confidence intervals.

---

## 4. Data Required Before Any Probabilistic or Machine Learning (ML) Claim Can Be Made

Before any calibrated probability (e.g., "probability of reserve breach $< 10^{-3}$") or ML-based arrival time / risk prediction claim can be made, the following empirical datasets and validation pipelines are required:

1. **High-Resolution Surveillance & Surface Movement Tracks (A-SMGCS / ADS-B / Mode S EHS)**:
   - At least 12–24 months of historical OMDB terminal maneuvering area (TMA) radar/ADS-B tracks and A-SMGCS surface tracks across all seasonal weather regimes (including shamal winds and winter radiation fog LVP episodes) to fit empirical distributions of:
     - Final approach groundspeed compression by aircraft type and wake category,
     - Runway Occupancy Time (ROT) distributions by runway (`30L`, `30R`, `12L`, `12R`), rapid-exit taxiway used, and RVR band,
     - Trombone/holding exit delivery accuracy at the Final Approach Fix (FAF).
2. **Flight Data Monitoring (FDM) / ACARS Fuel & Mass Telemetry**:
   - Downlinked aircraft gross weight, actual fuel flow across descent/holding/approach configurations, and Flight Management System (FMS) winds aloft to calibrate fuel burn residual error distributions.
3. **Vertical Wind & RVR Nowcasting Archives**:
   - Lidar/radiometer boundary-layer wind profiles and multi-transmissometer RVR time-series at OMDB to calibrate joint ETA + RVR degradation transition probabilities during LVP onset/recovery.
4. **Controller Action Logs & Voice/CPDLC Transcripts**:
   - Historical AMAN advisories paired with actual ATC clearances, pilot `WILCO`/`UNABLE` responses, and controller overrides to evaluate out-of-distribution generalization, calibration curves (Brier score / reliability diagrams), and human-in-the-loop workload impact (per ICAO APAC ATMAS TF/6 and NASA NTRS 20120004194).
