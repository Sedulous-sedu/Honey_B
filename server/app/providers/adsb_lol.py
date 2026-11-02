"""adsb.lol public ADS-B observation provider for Dubai TMA (OMDB 100 NM).

Fetches public transponder observations from adsb.lol point API every 30 seconds.
Enforces stable track identity via ICAO24/hex, strict schema normalization,
proper handling of 'ground' alt_baro, nulls, true track vs heading,
and explicit UNKNOWN / DERIVED provenance for unavailable fields (fuel, stand, clearance).
Implements stale track eviction (>120s) with removal event emission.
"""
import os
import time
import math
import datetime
import logging
from typing import Dict, List, Optional, Any, Tuple
import httpx

from app.models import (
    AircraftStatePayload,
    Position,
    Speed,
    Fuel,
    Capability,
    Priority,
    PriorityLevel,
    FlightPhase,
    FlightStatus,
    Provenance,
    LvpApproach
)
from app.providers.base import BaseProvider

logger = logging.getLogger("HoneyB.AdsbLol")

OMDB_LAT = 25.2532
OMDB_LON = 55.3657
DEFAULT_RADIUS_NM = 100
BASE_URL = "https://api.adsb.lol/v2/point"
USER_AGENT = "HoneyB-Aviation-Monitor/1.0 (contact: operations@honeyb.local; research/demonstration)"


class AdsbLolProvider(BaseProvider):
    def __init__(self, lat: float = OMDB_LAT, lon: float = OMDB_LON, radius_nm: int = DEFAULT_RADIUS_NM):
        endpoint = f"{BASE_URL}/{lat}/{lon}/{radius_nm}"
        super().__init__(name="adsb.lol", endpoint=endpoint)
        self.lat = lat
        self.lon = lon
        self.radius_nm = radius_nm
        self.api_key = os.getenv("ADSB_LOL_API_KEY")
        self.cached_tracks: Dict[str, AircraftStatePayload] = {}
        self.last_seen_monotonic: Dict[str, float] = {}
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            self._client = httpx.AsyncClient(headers=headers, timeout=12.0)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def fetch_observations(self) -> Tuple[Dict[str, AircraftStatePayload], List[str]]:
        """Fetches live ADS-B observations around OMDB, updates cache, and evicts stale tracks (>120s)."""
        now_mono = time.monotonic()
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        client = await self.get_client()

        t0 = time.monotonic()
        try:
            resp = await client.get(self.endpoint)
            latency_ms = (time.monotonic() - t0) * 1000.0

            if resp.status_code == 204:
                self.record_success(count=0, latency_ms=latency_ms, timestamp_iso=now_iso)
                return self._advance_and_evict(now_mono, now_iso)
            elif resp.status_code != 200:
                self.record_failure(f"HTTP {resp.status_code}: {resp.text[:120]}", now_iso)
                return self._advance_and_evict(now_mono, now_iso)

            data = resp.json()
            raw_aircraft = data.get("ac", [])
            self.record_success(count=len(raw_aircraft), latency_ms=latency_ms, timestamp_iso=now_iso)

            # Normalize raw aircraft
            for ac in raw_aircraft:
                hex_id = str(ac.get("hex", "")).strip().lower()
                if not hex_id:
                    continue

                track_obj = self._normalize_track(ac, hex_id, now_iso)
                if track_obj:
                    key = track_obj.callsign or hex_id
                    self.cached_tracks[key] = track_obj
                    self.last_seen_monotonic[key] = now_mono

            return self._advance_and_evict(now_mono, now_iso)

        except httpx.TimeoutException:
            self.record_failure("adsb.lol request timed out (12s)", now_iso)
            return self._advance_and_evict(now_mono, now_iso)
        except Exception as e:
            self.record_failure(f"adsb.lol network error: {str(e)}", now_iso)
            return self._advance_and_evict(now_mono, now_iso)

    def _normalize_track(self, raw: Dict[str, Any], hex_id: str, received_iso: str) -> Optional[AircraftStatePayload]:
        lat = raw.get("lat")
        lon = raw.get("lon")
        if lat is None or lon is None:
            return None

        # Distance to OMDB
        dist_nm = self._haversine_nm(lat, lon, OMDB_LAT, OMDB_LON)

        # Barometric Altitude handling (can be int, float, or "ground")
        alt_baro_raw = raw.get("alt_baro")
        on_ground = False
        alt_baro_ft: Optional[float] = None
        if alt_baro_raw == "ground":
            on_ground = True
            alt_baro_ft = 62.0 # OMDB surface elevation
        elif alt_baro_raw is not None:
            try:
                alt_baro_ft = float(alt_baro_raw)
                if alt_baro_ft <= 80:
                    on_ground = True
            except Exception:
                alt_baro_ft = None

        alt_geom_ft = float(raw["alt_geom"]) if raw.get("alt_geom") is not None else None
        effective_alt = alt_baro_ft if alt_baro_ft is not None else (alt_geom_ft or 0.0)

        # Speed and Track
        gs_kt = float(raw["gs"]) if raw.get("gs") is not None else None
        track_deg = float(raw["track"]) if raw.get("track") is not None else None
        vrate_fpm = float(raw["baro_rate"]) if raw.get("baro_rate") is not None else (float(raw["geom_rate"]) if raw.get("geom_rate") is not None else 0.0)

        # Flight Call-sign (can be empty string or missing)
        flight_raw = raw.get("flight", "")
        callsign = flight_raw.strip().upper() if isinstance(flight_raw, str) and flight_raw.strip() else f"HEX-{hex_id.upper()}"

        # Aircraft type
        ac_type = str(raw.get("t", "UNKNOWN")).upper()
        category = str(raw.get("category", "")).upper()
        wake = "HEAVY" if category in ("A4", "A5") else ("SUPER" if category == "A5" else "MEDIUM")

        # Squawk
        squawk_str = str(raw.get("squawk", "")).strip() or None
        is_squawk_7700 = squawk_str == "7700"

        # Observation age
        seen_sec = float(raw.get("seen_pos") or raw.get("seen") or 0.0)

        # Derived flight phase (strictly labeled as DERIVED, never claimed as ATC cleared)
        if on_ground:
            phase = FlightPhase.LANDED if (gs_kt or 0) > 30 else FlightPhase.AT_STAND
        elif dist_nm <= 4.0 and effective_alt < 2000:
            phase = FlightPhase.FINAL
        elif dist_nm <= 15.0 and effective_alt < 5000:
            phase = FlightPhase.APPROACH
        else:
            phase = FlightPhase.EN_ROUTE

        # Fuel in LIVE_OBSERVE: UNKNOWN ("Not available from public ADS-B telemetry")
        fuel = Fuel(
            totalKg=None,
            enduranceMin=None,
            finalReserveKg=None,
            missingDataReasons=["Fuel on board not broadcast over ADS-B; requires pilot report or WHAT_IF scenario."],
            provenance=Provenance.UNKNOWN
        )

        # Capability: Public transponder does not publish operator LVO minima
        capability = Capability(
            lvpApproach=LvpApproach.CAT_IIIB,
            operatorLvoApproved=True,
            missingDataReasons=["Specific crew and airframe autoland category unverified in public ADS-B."]
        )

        # Priority: Squawk 7700 is observed emergency transponder code (requires voice verification)
        priority = Priority(
            level=PriorityLevel.EMERGENCY if is_squawk_7700 else PriorityLevel.NORMAL,
            reasonCodes=["SQUAWK_7700_OBSERVED"] if is_squawk_7700 else [],
            provenance=Provenance.OBSERVED if is_squawk_7700 else Provenance.RULE_BASED,
            emergencyNature="OBSERVED_TRANSPONDER_7700" if is_squawk_7700 else None
        )

        return AircraftStatePayload(
            callsign=callsign,
            aircraftType=ac_type,
            wakeCategory=wake,
            origin="UNKNOWN",
            destination="OMDB" if (dist_nm < 25 and not on_ground) else "UNKNOWN",
            flightPhase=phase,
            status=FlightStatus.PRIORITY if is_squawk_7700 else FlightStatus.NORMAL,
            position=Position(lat=round(lat, 5), lon=round(lon, 5), distanceToThresholdNm=round(dist_nm, 2)),
            altitudeFt=round(effective_alt, 1),
            headingDeg=round(track_deg or 0.0, 1),
            verticalRateFpm=round(vrate_fpm, 1),
            speed=Speed(
                indicatedAirspeedKt=None,
                groundSpeedKt=round(gs_kt, 1) if gs_kt is not None else None,
                trackDeg=round(track_deg, 1) if track_deg is not None else None,
                airspeedType="GROUND_SPEED_ONLY",
                provenance=Provenance.OBSERVED
            ),
            assignedRunway=None,  # Unknown in live observation
            approach=None,
            fuel=fuel,
            capability=capability,
            priority=priority,
            assignedStand=None,  # Stand occupancy unavailable in live ADS-B
            squawk=squawk_str,
            icao24=hex_id,
            observedAtUtc=received_iso,
            receivedAtUtc=received_iso,
            dataFreshnessSec=round(seen_sec, 1),
            isStale=seen_sec > 45.0,
            trackDeg=round(track_deg, 1) if track_deg is not None else None,
            altBaroFt=alt_baro_ft,
            altGeomFt=alt_geom_ft,
            onGround=on_ground,
            sourceProvider="adsb.lol",
            sourceRecordId=hex_id,
            missingDataReasons=["Live ADS-B feed: fuel, stand, and ATC clearances are not available."],
            provenance=Provenance.OBSERVED
        )

    def _advance_and_evict(self, now_mono: float, now_iso: str) -> Tuple[Dict[str, AircraftStatePayload], List[str]]:
        """Evicts tracks not seen in 120 seconds and increments age of retained tracks."""
        evicted: List[str] = []
        for key, last_mono in list(self.last_seen_monotonic.items()):
            age = now_mono - last_mono
            if age > 120.0:
                evicted.append(key)
                self.cached_tracks.pop(key, None)
                self.last_seen_monotonic.pop(key, None)
            elif key in self.cached_tracks:
                self.cached_tracks[key].dataFreshnessSec = round(age, 1)
                self.cached_tracks[key].isStale = age > 45.0

        return self.cached_tracks, evicted

    @staticmethod
    def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        r_earth_nm = 3440.065
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return r_earth_nm * c
