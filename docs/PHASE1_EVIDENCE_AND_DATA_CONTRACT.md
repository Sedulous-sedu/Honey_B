# Phase 1 — Evidence, Repository Audit, and Data Contract Specification

> **Emergency Sequence Change Risk Advisor for Honey B**  
> **Scope**: Simulation decision-support module for Dubai International Airport (`OMDB`). Never issues an autonomous ATC clearance, never alters an operative cleared route, and never silently applies a landing sequence.

---

## 1. Repository & Branch Inspection Report

### 1.1 Inspected Branches
- `main` (`47e99ad`): Merged `pilot-system` (`b3c3f72`) and `4a1fc25` on top of the Ground Control Hub (`4d62b23`).
- `integration-fix` (`47e99ad`): Identical to `main`.
- `pilot-system` (`00ef852`): Pilot tablet application in `plane/`.
- `origin/Control-panel` (`4d62b23`): Ground Control Hub (`server/` + `web/`).
- **`codex/integration-repair`**: **Not present** locally or on `origin`.

### 1.2 Missing / Broken Integration Changes Identified and Repaired
Before adding the Emergency Sequence Change Risk Advisor, inspection of `47e99ad` revealed five integration defects between `plane/` (`HttpDataLinkAdapter`) and `server/app/main.py` that `codex/integration-repair` was meant to address:
1. **Broken `GET /api/dashboard/{aircraft_id}` attribute lookups**: Commit `4a1fc25` referenced non-existent flat attributes (`ac.fuelKg`, `ac.finalReserveKg`, `ac.fuelFlowKgH`, `ac.lat`, `ac.lon`, `ac.distanceToRunwayNm`, `ac.eta`, `wx.lvpPhase`, `wx.windDir`, `wx.windSpeedKt`, `wx.qnh`, `wx.metar`) instead of the nested Pydantic models in [`server/app/models.py`](../server/app/models.py) (`ac.fuel.totalKg`, `ac.fuel.finalReserveKg`, `ac.fuel.holdingFuelFlowKgH`, `ac.position.lat`, `ac.position.lon`, `ac.position.distanceToThresholdNm`, `ac.etaUtc`, `wx.lvp.phase`, `wx.wind.directionDeg`, `wx.wind.speedKt`, `wx.qnhHpa`, `wx.rawMetar`).
2. **Broken dictionary iteration on `state.suggestions` and `state.commands`**: Iterated over dictionary keys (`for sg in state.suggestions:` and `for cmd in reversed(state.commands):`) instead of `.values()`, and accessed non-existent `.instruction` / `.reason` attributes.
3. **Missing `ConsolidatedDashboardState` fields required by `plane/`**: Omitted `landingSequence.sequenceNumber`, `landingSequence.totalInSequence`, `aircraft.fmsEtaCalculatedAtUtc`, `conditions.cloudBase`, `conditions.notams`, and `conditions.observedAtUtc`.
4. **Missing `POST /api/pilot-response` endpoint**: Called by `HttpDataLinkAdapter.sendPilotResponse` in [`plane/src/services/dataLinkAdapter.ts`](../plane/src/services/dataLinkAdapter.ts) but absent from `server/app/main.py`.
5. **Stale flight-count assertion in `server/test_server.py`**: Commit `4d62b23` reduced `server/data/flights.json` from 28 to 15 tracks for radar decluttering while `test_health()` still asserted `aircraftCount >= 25`.

All five integration issues have been repaired while preserving both `plane/` and `ground-control/` (plus `server/` and `web/`).

---

## 2. Audit of Baseline Rule Engine, Simulator, Data Contracts, and Missing Inputs

### 2.1 Current Simulator (`server/app/simulator.py`)
- **Kinematics**: 1 Hz tick advancing aircraft position along current heading toward OMDB threshold (`distanceToThresholdNm`), transitioning altitude at ~1,500 fpm, IAS at 2 kt/s, and heading at 3 deg/s.
- **Fuel Burn**: Simplified burn rate using `holdingFuelFlowKgH / 3600` in `HOLDING` and `0.9 * holdingFuelFlowKgH / 3600` in other flight phases. Automatically sets `PriorityLevel.MINIMUM_FUEL` when `totalKg - finalReserveKg < 400 kg` or `enduranceMin < 40 min`.
- **Command State Machine**: Transitions `ACKNOWLEDGED` (`WILCO`) commands to `EXECUTING` and `DONE`, while `UNABLE` and `SUPERSEDED` commands are logged and never executed.

### 2.2 Current Rule Engine (`server/app/suggestion.py`)
- **Spacing Rule**: Uses a fixed demo heuristic of `3.0 NM` (normal) and `6.0 NM` (LVP), plus `+2.0 NM` behind `SUPER` and `+1.5 NM` for `MEDIUM` behind `HEAVY`.
- **Low Visibility Check**: Uses a generic `550 m` CAT I RVR threshold to suggest diversions.
- **Priority Handling**: Generates isolated single-aircraft suggestions (`SUG-FUEL-*`, `SUG-MED-*`) without evaluating multi-aircraft sequence displacement, runway occupancy time, frozen slots, or whether expediting one flight pushes a displaced flight below its final fuel reserve.

### 2.3 Missing Inputs Identified in the Baseline Contract
| Missing Input Category | Baseline Gap | Phase 1 Resolution |
|---|---|---|
| **Confirmed Emergency Declaration** | Conflated `MINIMUM_FUEL` and `MEDICAL` flags with declared emergencies. | Added `declarationType` (`NONE`, `MAYDAY`, `PAN_PAN`), `declarationStatus` (`NONE`, `UNCONFIRMED`, `CONFIRMED`), `declaredAtUtc`, `confirmedByControllerId`, and `emergencyNature`. Never infers `MAYDAY`/`PAN_PAN` from `MINIMUM_FUEL` or an unconfirmed medical report. |
| **Observation Time & Freshness** | No per-aircraft observation timestamp or telemetry age check in ground sequencing. | Added `observedAtUtc`, `dataFreshnessSec`, and `isStale` on `AircraftStatePayload` and `WeatherPayload`. |
| **Runway Serviceability & LVO Mode** | Assumed both `30L` and `30R` are always open and interchangeable. | Added `runwayStates` (`serviceable`, `status`, `mode`, `ilsCategory`, `smrServiceable`, `reason`) reflecting GCAA OMDB AIP AD 2.22 Dependent Dual LVO Configurations. |
| **Approach & Operator Eligibility** | Only stored `lvpApproach` enum without operator approval, minimum RVR, or runway eligibility. | Added `minApprovedRvrM`, `operatorLvoApproved`, `eligibleRunways`, and `maxCrosswindKt` on `Capability`. |
| **Phase-Specific Fuel & Missing-Data Reasons** | Required numeric fuel fields; no representation of missing fuel/reserve or phase burn rates. | Made fuel metrics nullable (`Optional[float]`), added `approachFuelFlowKgH`, `descentFuelFlowKgH`, and `missingDataReasons` on `Fuel`, `Capability`, `AircraftStatePayload`, and `WeatherPayload`. |
| **Frozen Horizon & Sequence Advisory Provenance** | No distinction between committed final-approach slots and resequenceable slots, or between AMAN baseline and controller-approved estimated sequences. | Added `slotFrozen` on `AircraftStatePayload` and `advisorySource`, `approvedByControllerId`, `approvedAtUtc`, `isClearance`, and `disclaimerText` on `GroundLandingSequence`. |

---

## 3. Primary Research Consulted & Cited in the Knowledge Core

1. **UAE GCAA OMDB AIP (`AD 2.OMDB`, AIRAC 2026-P10)**  
   https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIRACs/2026-P10/html/eAIP/AD-2.OMDB-en-GB.html  
   - **Runways**: `12L/30R` (`4000 m × 60 m`) and `12R/30L` (`4450 m × 60 m`), closely spaced parallel runways (`385 m` centerline separation; dependent operations).
   - **LVP Initiation (AD 2.22)**: Initiated when Touchdown IRVR $\le 600\text{ m}$, meteorological visibility $\le 600\text{ m}$ (if IRVR unavailable), or cloud ceiling $< 300\text{ ft}$. Serviceable Surface Movement Radar (SMR/ASMGCS) is mandatory when visibility or RVR $\le 300\text{ m}$.
   - **CAT IIIB Minima**: Runways `12L/30R` and `12R/30L` are approved for CAT IIIB down to $50\text{ m}$ RVR (subject to facility serviceability and GCAA operator approval).
   - **Dependent Dual LVO Runway Configurations (AD 2.22)**:
     - *Configuration A*: Landings on `RWY 30L`, Take-offs on `RWY 30R` (with `30R` ILS off unless explicitly reconfigured).
     - *Configuration B*: Landings on `RWY 12L`, Take-offs on `RWY 12R`.
   - **LVO Longitudinal Spacing**: Expanded longitudinal spacing ($7.0\text{ NM}$ in `LVP_ACTIVE`) to protect ILS localizer/glidepath sensitive areas.

2. **UAE GCAA Medical-Emergency Circular (`eAIC 2020-06`) & UAE Rules of the Air**  
   https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIRACs/2024-P07/html/eAIC/eAIC-2020-06-A-en-GB.html  
   - Distinguishes **Distress (`MAYDAY`)** (imminent grave danger requiring immediate assistance) from **Urgency (`PAN PAN`)** (urgent situation concerning safety of aircraft or person on board, including confirmed passenger/crew medical emergencies).
   - A cabin/pilot medical report without an explicit `PAN PAN` or `MAYDAY` declaration from the Pilot-in-Command must be confirmed by ATC (`MANUAL_REVIEW_REQUIRED` / `MEDICAL_REPORT_AWAITING_DECLARATION_CONFIRMATION`).
   - Similarly, under ICAO Doc 4444 PANS-ATM 15.1.3 / UAE Rules of the Air, `MINIMUM FUEL` is an advisory state and **not** an emergency declaration (`MAYDAY FUEL`).

3. **ICAO AMAN Guidance (`APAC ATMAS TF/6 Report`, 2025)**  
   https://www.icao.int/sites/default/files/APAC/Meetings/2025/2025%20ATMAS%20TF6/1-Report/Report-of-ATMAS-TF6.pdf  
   - Defines Arrival Manager (**AMAN**) sequence stability principles and the **Freeze Horizon**: aircraft that have crossed into final approach / inside the freeze horizon have committed slots (`slotFrozen = true`) so automated resequencing does not destabilize short-final traffic.
   - Separates AMAN advisory sequence estimates from operative ATC clearances.

4. **NASA Landing Sequencing (`NTRS 20060053296` — Balakrishnan & Chandran, 2006)**  
   *Scheduling Aircraft Landings under Constrained Position Shifting*  
   https://ntrs.nasa.gov/search.jsp?R=20060053296  
   - Formulates runway arrival scheduling with earliest arrival times, pairwise wake-turbulence separation matrices, precedence constraints, and **Constrained Position Shifting (CPS)** (bounding position shifts for nearby swap candidates while evaluating earliest feasible emergency insertion).

5. **NASA Scheduling under Uncertainty (`NTRS 20120004194` — Gupta, Malik, & Jung, 2012)**  
   *Effect of Uncertainty on Deterministic Runway Scheduling*  
   https://ntrs.nasa.gov/citations/20120004194  
   - Demonstrates how arrival-time (ETA) uncertainty, runway occupancy time (ROT) variability, and fuel burn variations impact deterministic runway schedules.
   - Motivates our four configurable, deterministic stress scenarios (`NOMINAL`, `LATE_ETA_HIGH_BURN`, `EXTENDED_ROT_LVP`, `COMBINED_ADVERSE`), explicitly labeled as scenario evaluations rather than calibrated probabilities.
