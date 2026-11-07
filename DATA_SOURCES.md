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

### 2. Automatic Multi-Provider ADS-B Pool (`adsb.lol`, `adsb.fi`, `OpenSky_Network`)
- **Router / Pool**: `AdsbProviderPool` (`server/app/providers/adsb_pool.py`)
- **Target Region**: OMDB (`25.2498°N`, `55.3710°E`), radius `100 NM` (and UAE bounding box `23.6–26.9°N`, `53.5–57.2°E`).
- **Configured Providers (in priority order)**:
  1. **`adsb.lol`** (Primary): `https://api.adsb.lol/v2/point/25.2498/55.3710/100` — ODbL 1.0 open community ADS-B/MLAT feed.
  2. **`adsb.fi`** (Secondary failover): `https://opendata.adsb.fi/api/v3/lat/25.2498/lon/55.3710/dist/100` — Open data API (1 req/s personal/educational).
  3. **`OpenSky_Network`** (Tertiary failover): `https://opensky-network.org/api/states/all?lamin=23.6&lomin=53.5&lamax=26.9&lomax=57.2` — Educational/research non-profit feed (supports optional OAuth2 client credentials via `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET`).
- **Automatic Rotation & Failover Rules**:
  - Tracks per-provider request budgets, `next_eligible_mono` cooldowns from `Retry-After` headers, consecutive error counts, regional coverage counts, and median observation age.
  - Automatically fails over to the next eligible provider on HTTP `429`, exhausted budget (`<= 1`), network timeout, `5xx` error, or `0` regional tracks.
  - Enforces timestamp monotonicity (`obs_epoch`) across provider switches so an older observation from a secondary provider never moves a track backwards in time.
  - Preserves stable `trackId` (`TRK-{ICAO24}`) and active 120s session callsign across provider switches so controller selection in `TrafficList`, `RadarScope`, and `FlightDetail` is never lost.
- **Ingestion & Normalization Rules**:
  - Transponder identity is keyed by `trackId` / `icao24` (`hex`), preventing duplicate callsigns on distinct transponders from overwriting each other.
  - **Flight Identity & Airline Directory (`AirlineDirectory`)**:
    - Matches strict 3-letter ICAO airline callsign prefixes against `server/data/airlines_directory.json` (OpenFlights ODbL + reviewed UAE/international overrides).
    - Never converts an ICAO callsign (`UAE231` or alphanumeric `UAE6RM`) into a guessed passenger IATA flight number (`flightNumberIata = null`, `flightNumberStatus = "UNAVAILABLE"` unless confirmed by a verified schedule source).
    - Non-airline civil registrations (`TCAKB`, `A6-...`) and surface vehicles (`MAINT`, `GO2`, `OP18`, category `C1–C3`) are never assigned a guessed airline.
    - Verified local SVG airline logos (`web/public/logos/`, `plane/public/logos/`) are documented with Wikimedia Commons source URLs, licenses, and SHA-256 checksums in `AIRLINE_LOGO_SOURCES.md` and `server/data/airline_logos_manifest.json`.
  - Distance is computed to OMDB ARP (`25.2498°N, 55.3710°E`) and explicitly labeled `distanceReference = "OMDB_ARP"` until a runway is assigned.
  - Telemetry not broadcast over public ADS-B (fuel quantity, stand assignment, crew LVO minima, operative ATC clearances) is represented honestly as `UNKNOWN`.

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

### 6. Bayanat.ae UAE Official Open Data (Airport Movements & Capacity)
- **Authority**: UAE Federal Competitiveness and Statistics Center / General Civil Aviation Authority (GCAA) / Statistics Centre − Abu Dhabi (SCAD).
- **Portal**: [Bayanat.ae](https://bayanat.ae/Datasets).
- **Compiled File**: `server/data/uae_airport_traffic_stats.json`
- **Endpoint**: `GET /api/reference/airport-stats`
- **License / Terms**: UAE Open Government Data License.
- **Contents**:
  - Yearly total aircraft movements (2008–2016) by airport: Dubai (`OMDB`: 420,870 movements), Abu Dhabi (`OMAA`: 168,535 movements), Sharjah (`OMSJ`: 75,967 movements), Ras Al Khaimah (`OMRK`: 14,242 movements), and Fujairah (`OMAL`: 9,692 movements).
  - Arrivals vs. departures breakdown by Emirate (2014–2018).
  - Monthly movement distributions for Abu Dhabi International and Al Ain International.
- **Operational Usage in Honey B**:
  - Calibrates baseline Runway Acceptance Rates (RAR) and airport saturation limits for arrival management (AMAN).
  - Supplies realistic diversion airport capacity thresholds (e.g. OMSJ acceptance slack vs. OMDB saturation) during low-visibility fog procedures or runway emergency closures.

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

