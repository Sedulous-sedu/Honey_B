# Honey B Data Sources & Attribution Reference

This document catalogs all external public data sources utilized by Honey B, their ingestion endpoints, update cadences, field-level provenance tags, licensing terms, and resilience mechanisms.

---

## Data Providers Inventory

### 1. NOAA Aviation Weather (AviationWeather.gov)
- **Authority**: U.S. National Oceanic and Atmospheric Administration (NOAA) / National Weather Service (NWS).
- **Service**: Public Aviation Weather REST API (METAR & TAF).
- **Primary Station**: `OMDB` (Dubai International Airport).
- **Regional / Alternate Stations**: `OMDW` (Al Maktoum / Dubai World Central), `OMSJ` (Sharjah), `OMAA` (Abu Dhabi), `OMRK` (Ras Al Khaimah).
- **Endpoints**:
  - METAR: `https://aviationweather.gov/api/data/metar?ids=OMDB,OMDW,OMSJ,OMAA,OMRK&format=json`
  - TAF: `https://aviationweather.gov/api/data/taf?ids=OMDB,OMDW,OMSJ,OMAA,OMRK&format=json`
- **Cadence**: METAR polled every 60 seconds; TAF polled every 600 seconds.
- **License / Cost**: U.S. Government Public Domain; zero cost; no API key required.
- **Ingestion & Normalization Rules**:
  - Raw METAR and TAF strings are strictly preserved in `rawMetar` and `rawTaf`.
  - Runway Visual Range (`rvr`) is parsed per runway (`R12L`, `R30R`, `R12R`, `R30L`) directly from the METAR RVR groups. If a runway has no reported RVR group, its RVR remains `None`; general visibility is **never** substituted into runway RVR.
  - Flight Category parsed into standard ICAO/FAA enums (`VFR`, `MVFR`, `IFR`, `LIFR`).
  - Provenance tagged as `OBSERVED`.

---

### 2. adsb.lol (Open Transponder Aggregation)
- **Authority**: adsb.lol community-run open ADS-B / MLAT network.
- **Service**: Point-based radius transponder API.
- **Target Coordinates**: OMDB (`25.2532°N`, `55.3657°E`), radius `100 NM`.
- **Endpoint**: `https://api.adsb.lol/v2/point/25.2532/55.3657/100`
- **Cadence**: Polled every 5 seconds.
- **License / Cost**: Open Community ADS-B; zero cost; no authentication required.
- **Ingestion & Normalization Rules**:
  - Transponder identity resolved via `hex` (ICAO 24-bit address) as the primary immutable key, with `flight` (squawked callsign) as operational callsign.
  - Ground tracks: When `alt_baro == "ground"`, aircraft is normalized with `onGround = True`, `altitudeFt = 62.0` (OMDB field elevation), and `flightPhase = "TAXI_IN"` or `"PARKED"`.
  - Ground Speed vs Airspeed: Transponders report ground speed in knots (`gs`). Indicated Airspeed is marked as derived from ground speed or reported as separate telemetry.
  - Telemetry not broadcast over public ADS-B (fuel quantity, gate/stand assignment, operative ATC clearance route) is marked as `UNKNOWN` with `provenance = UNKNOWN` or `missingDataReasons = ["Not available in public ADS-B transponder broadcast"]`.
  - Stale Track Watchdog: Any track with no fresh transponder packets for > 30 seconds is flagged with `isStale = True`. Any track unseen for > 120 seconds is evicted from active memory, and an eviction event is broadcast to controllers.

---

### 3. OurAirports Open Aeronautical Database
- **Authority**: OurAirports (global crowdsourced and authoritative civil aviation data).
- **Service**: Airport runway, elevation, and regional reference tables.
- **Scope**: United Arab Emirates civil and military airports (`OMDB`, `OMDW`, `OMSJ`, `OMAA`, `OMRK`, `OMAL`, `OMAD`).
- **Endpoint**: `https://raw.githubusercontent.com/davidmegginson/ourairports-data/refs/heads/main/airports.csv`
- **Cadence**: Cached locally in memory; re-synchronized on startup.
- **License / Cost**: Public Domain / Creative Commons CC0.
- **Attribution**: Includes airport name, ICAO code, geographic coordinates, field elevation, and runway geometry.

---

### 4. OpenStreetMap (OSM) Aeroway Geometry
- **Authority**: OpenStreetMap contributors.
- **Service**: Vector runway centerlines, taxiway linkages, apron areas, and gate/stand positions for OMDB.
- **Cache File**: `server/data/osm_omdb_geometry.json`
- **License & Attribution**:
  - **ODbL (Open Database License)**: Data is provided under the Open Database License, © OpenStreetMap contributors.
  - Geometry is statically pre-rendered and cached locally to prevent network timeouts during live air operations.
- **Content**:
  - Runways `12L/30R` and `12R/30L` threshold coordinates and headings.
  - Terminal 1 (Concourse D), Terminal 2 (Concourse F), Terminal 3 (Concourses A, B, C) parking stands.

---

### 5. Genuine Recorded Observation Dataset
- **File**: `server/data/recordings/omdb_live_recording_20261102.json`
- **Provenance**: Captured during live operations on November 2, 2026.
- **Contents**:
  - Manifest detailing capture UTC timestamp, geographical bounding box, and recording schema version.
  - 8 real transponder tracks captured around OMDB TMA (`UAE231`, `FDB512`, `SIA317`, `BAW107`, `THY762`, `IGO1433`, `QFA12`, `UAE004`).
  - Genuine NOAA METAR and TAF observations for OMDB and alternate airports.
- **Usage**: Serves as the authoritative source for `REPLAY` mode and base snapshots for `WHAT_IF` forking.

---

## Provenance Taxonomy

All telemetry and advisory objects carry explicit `provenance` attributes:

| Provenance Tag | Meaning | Example |
|---|---|---|
| `OBSERVED` | Real public sensor or meteorological observation | NOAA METAR, adsb.lol transponder position |
| `REFERENCE` | Authoritative aeronautical database reference | OurAirports runway length, OSM gate coordinates |
| `PILOT_REPORTED` | Downlinked or reported by the Pilot-in-Command | Fuel endurance report, declared PAN PAN / MAYDAY |
| `OPERATOR_REPORTED` | Entered by Ground / Tower / Approach controller | Runway closure, manual stand reassignment |
| `DERIVED` | Computationally derived from physics or state | Time-to-threshold based on ground speed |
| `RULE_BASED` | Generated by deterministic rule engine | Separation minimums, low visibility approach eligibility |
| `AI_DERIVED` | Generated by LLM natural language explanation | Voice advisory summary, risk narrative |
| `UNKNOWN` | Telemetry withheld or unavailable from source | Fuel on board from ADS-B feed |
| `SIMULATED` | Injected into a sandbox or benchmark scenario | What-if fog override, synthetic test traffic |

---

## Resilience & Watchdog Thresholds

```
                      Last Contact
                           │
       0s                  ▼ 30s                       120s
       ├───────────────────┼───────────────────────────┼────────────────► Time
       │      HEALTHY      │          DELAYED          │   DISCONNECTED / EVICTED
       │  - Full green     │  - Amber warning pill     │  - Red banner
       │  - Live data      │  - Watchdog alert         │  - Clearances disabled
       │                   │  - Buttons remain active  │  - Track removed from radar
```

- **Weather Provider Watchdog**:
  - Marked `ONLINE` if update received within 90 seconds.
  - Marked `DEGRADED` if last successful update > 90 seconds ago.
  - If network drops, automatically retains last known METAR/TAF with `dataFreshnessSec` incrementing monotonically.
- **ADS-B Provider Watchdog**:
  - Marked `ONLINE` if point query succeeds within 15 seconds.
  - Marked `DEGRADED` if query fails or latency exceeds 5000 ms.
  - Stale tracks marked `isStale = True` after 30s.
  - Stale tracks evicted after 120s.
- **Cockpit Pilot Datalink Watchdog**:
  - Marked `LIVE` while polling within normal interval.
  - Marked `DELAYED` if no update for > 30 seconds.
  - Marked `DISCONNECTED` if network error or no response for > 120 seconds.
  - All clearance acceptance buttons are immediately disabled when status is `DISCONNECTED`.

