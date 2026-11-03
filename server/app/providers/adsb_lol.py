"""adsb.lol Real-Time Aircraft Observation Provider.

Ingests live ADS-B aircraft observations within 100 NM of OMDB:
- Endpoint: https://api.adsb.lol/v2/point/25.2532/55.3657/100
- License: Open Data Commons Open Database License (ODbL)
- Supports optional free API key via ADSB_LOL_API_KEY environment variable.
"""
import datetime
import math
import os
import time
from typing import Dict, List, Optional, Any, Tuple
import httpx

from app.models import (
    AircraftStatePayload,
    Position,
    Speed,
    Fuel,
    Capability,
    Priority,
    FlightPhase,
    FlightStatus,
    PriorityLevel,
    EmergencyDeclarationType,
    DeclarationStatus,
    LvpApproach,
    Provenance,
)
from app.providers.base import BaseProvider
from app.providers.airline_directory import AirlineDirectory
from app.providers.ourairports import OurAirportsProvider

ADSB_LOL_POINT_URL = "https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}"
DEFAULT_OMDB_LAT = 25.24979
DEFAULT_OMDB_LON = 55.370992
SEARCH_RADIUS_NM = 100
USER_AGENT = "HoneyB-ATC-DecisionSupport/1.0 (OMDB Live Observe; educational hackathon)"

HEAVY_TYPES = {"B77W", "B772", "B77L", "B773", "B788", "B789", "B78X", "A359", "A35K", "A332", "A333", "A339", "A343", "A346", "B744", "B748", "MD11", "B763"}
MEDIUM_TYPES = {"A320", "A321", "A319", "A20N", "A21N", "B738", "B737", "B739", "B38M", "B39M", "E190", "BCS3", "A220"}


def infer_wake_category(ac_type: str, ads_category: str) -> str:
    cat = (ads_category or "").strip().upper()
    t = (ac_type or "").strip().upper()
    if t == "A388" or cat == "A5":
        return "SUPER"
    if cat in ("A3", "A4") or t in HEAVY_TYPES:
        return "HEAVY"
    if cat == "A2" or t in MEDIUM_TYPES:
        return "MEDIUM"
    if cat == "A1":
        return "LIGHT"
    return "UNKNOWN"


class AdsbLolProvider(BaseProvider):
    def __init__(self):
        lat, lon = self._get_omdb_arp()
        self.arp_lat = lat
        self.arp_lon = lon
        endpoint = ADSB_LOL_POINT_URL.format(lat=round(lat, 4), lon=round(lon, 4), radius=SEARCH_RADIUS_NM)
        super().__init__(name="adsb.lol", endpoint=endpoint)
        self.api_key = os.environ.get("ADSB_LOL_API_KEY", "").strip()
        self.cached_tracks: Dict[str, AircraftStatePayload] = {}
        self.last_seen_monotonic: Dict[str, float] = {}
        self.last_obs_epoch: Dict[str, float] = {}
        self.last_retry_after_sec: Optional[float] = None
        self.last_http_status: Optional[int] = None
        self._client: Optional[httpx.AsyncClient] = None

    @staticmethod
    def _get_omdb_arp() -> Tuple[float, float]:
        try:
            uae = OurAirportsProvider.load_or_fetch()
            omdb = uae.get("airports", {}).get("OMDB")
            if omdb and omdb.get("lat") and omdb.get("lon"):
                return float(omdb["lat"]), float(omdb["lon"])
        except Exception:
            pass
        return DEFAULT_OMDB_LAT, DEFAULT_OMDB_LON

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
        now_epoch = time.time()
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        client = await self.get_client()
        self.last_retry_after_sec = None

        t0 = time.monotonic()
        try:
            resp = await client.get(self.endpoint)
            latency_ms = (time.monotonic() - t0) * 1000.0
            self.last_http_status = resp.status_code

            if resp.status_code == 204:
                self.record_success(count=0, latency_ms=latency_ms, timestamp_iso=now_iso)
                return self._advance_and_evict(now_mono, now_iso)
            elif resp.status_code == 429:
                retry_hdr = resp.headers.get("Retry-After")
                self.last_retry_after_sec = float(retry_hdr) if (retry_hdr and retry_hdr.isdigit()) else 60.0
                self.record_failure(f"HTTP 429 Rate Limited (Retry-After {self.last_retry_after_sec}s)", now_iso)
                return self._advance_and_evict(now_mono, now_iso)
            elif resp.status_code != 200:
                self.record_failure(f"HTTP {resp.status_code}: {resp.text[:120]}", now_iso)
                return self._advance_and_evict(now_mono, now_iso)

            data = resp.json()
            raw_aircraft = data.get("ac") if isinstance(data.get("ac"), list) else data.get("aircraft", [])
            self.record_success(count=len(raw_aircraft), latency_ms=latency_ms, timestamp_iso=now_iso)

            for ac in raw_aircraft:
                hex_id = str(ac.get("hex", "")).strip().lower()
                if not hex_id:
                    continue

                existing = self.cached_tracks.get(hex_id)
                last_mono = self.last_seen_monotonic.get(hex_id)
                # Preserve session callsign if within 120s session and current frame dropped callsign
                in_active_session = existing is not None and last_mono is not None and (now_mono - last_mono) <= 120.0

                track_obj, obs_epoch = self.normalize_readsb_track(
                    ac,
                    hex_id=hex_id,
                    received_iso=now_iso,
                    now_epoch=now_epoch,
                    arp_lat=self.arp_lat,
                    arp_lon=self.arp_lon,
                    provider_name=self.name,
                    previous_track=existing if in_active_session else None,
                )
                if track_obj:
                    prev_epoch = self.last_obs_epoch.get(hex_id, 0.0)
                    if obs_epoch + 0.5 < prev_epoch:
                        # Reject older observation that would move track backwards in time
                        continue
                    self.cached_tracks[hex_id] = track_obj
                    self.last_seen_monotonic[hex_id] = now_mono
                    self.last_obs_epoch[hex_id] = obs_epoch

            return self._advance_and_evict(now_mono, now_iso)

        except httpx.TimeoutException:
            self.last_http_status = 504
            self.record_failure(f"{self.name} request timed out (12s)", now_iso)
            return self._advance_and_evict(now_mono, now_iso)
        except Exception as e:
            self.last_http_status = 500
            self.record_failure(f"{self.name} network error: {str(e)}", now_iso)
            return self._advance_and_evict(now_mono, now_iso)

    @classmethod
    def normalize_readsb_track(
        cls,
        raw: Dict[str, Any],
        hex_id: str,
        received_iso: str,
        now_epoch: float,
        arp_lat: float = DEFAULT_OMDB_LAT,
        arp_lon: float = DEFAULT_OMDB_LON,
        provider_name: str = "adsb.lol",
        previous_track: Optional[AircraftStatePayload] = None,
    ) -> Tuple[Optional[AircraftStatePayload], float]:
        lat = raw.get("lat")
        lon = raw.get("lon")
        if lat is None or lon is None:
            return None, 0.0

        dist_nm = cls._haversine_nm(float(lat), float(lon), arp_lat, arp_lon)

        # Barometric Altitude handling (can be int, float, or "ground")
        alt_baro_raw = raw.get("alt_baro")
        on_ground = False
        alt_baro_ft: Optional[float] = None
        if isinstance(alt_baro_raw, str) and alt_baro_raw.strip().lower() == "ground":
            on_ground = True
            alt_baro_ft = 62.0  # OMDB surface elevation
        elif alt_baro_raw is not None:
            try:
                alt_baro_ft = float(alt_baro_raw)
                if alt_baro_ft <= 80:
                    on_ground = True
            except Exception:
                alt_baro_ft = None

        alt_geom_ft: Optional[float] = None
        if raw.get("alt_geom") is not None:
            try:
                alt_geom_ft = float(raw["alt_geom"])
            except Exception:
                alt_geom_ft = None

        effective_alt = alt_baro_ft if alt_baro_ft is not None else (alt_geom_ft if alt_geom_ft is not None else 0.0)

        gs_kt = float(raw["gs"]) if raw.get("gs") is not None else None
        track_deg = float(raw["track"]) if raw.get("track") is not None else None
        vrate_fpm = (
            float(raw["baro_rate"])
            if raw.get("baro_rate") is not None
            else (float(raw["geom_rate"]) if raw.get("geom_rate") is not None else 0.0)
        )

        # Flight Callsign & Session preservation
        flight_raw = raw.get("flight")
        if (not flight_raw or not str(flight_raw).strip()) and previous_track and previous_track.identity:
            # Retain observed callsign from active session if single frame omitted callsign
            flight_raw = previous_track.identity.callsignRaw or previous_track.identity.callsignObserved

        registration = str(raw.get("r", "")).strip() or (previous_track.registration if previous_track else None)
        own_op = str(raw.get("ownOp", "")).strip() or None

        track_id = previous_track.trackId if (previous_track and previous_track.trackId) else f"TRK-{hex_id.upper()}"
        identity, display_callsign = AirlineDirectory.resolve_identity(
            icao24=hex_id,
            callsign_raw=flight_raw,
            fetched_at_utc=received_iso,
            track_id=track_id,
            registration=registration,
            provider_operator=own_op,
        )

        # Aircraft type & wake (honest UNKNOWN when absent)
        raw_t = raw.get("t")
        ac_type = str(raw_t).strip().upper() if (raw_t and str(raw_t).strip()) else (
            previous_track.aircraftType if previous_track and previous_track.aircraftType != "UNKNOWN" else "UNKNOWN"
        )
        category = str(raw.get("category", "")).strip().upper()
        wake = infer_wake_category(ac_type, category)

        squawk_str = str(raw.get("squawk", "")).strip() or None
        is_squawk_7700 = squawk_str == "7700"

        seen_sec = float(raw.get("seen_pos") or raw.get("seen") or 0.0)
        obs_epoch = max(0.0, now_epoch - seen_sec)
        obs_dt = datetime.datetime.fromtimestamp(obs_epoch, tz=datetime.timezone.utc)
        obs_iso = obs_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Conservative inferred flight classification (explicitly labeled DERIVED, never claimed as ATC clearance)
        if AirlineDirectory.is_surface_vehicle(identity.callsignObserved, category):
            phase = FlightPhase.AT_STAND
            inferred_class = "SURFACE_VEHICLE"
        elif on_ground:
            phase = FlightPhase.LANDED if (gs_kt or 0) > 30 else FlightPhase.AT_STAND
            inferred_class = "SURFACE_OBSERVED"
        elif dist_nm <= 4.5 and effective_alt < 2000 and vrate_fpm < -150:
            phase = FlightPhase.FINAL
            inferred_class = "INFERRED_APPROACH"
        elif dist_nm <= 16.0 and effective_alt < 5500 and vrate_fpm < -150:
            phase = FlightPhase.APPROACH
            inferred_class = "INFERRED_APPROACH"
        else:
            phase = FlightPhase.EN_ROUTE
            inferred_class = "OBSERVED_TRACK"

        fuel = Fuel(
            totalKg=None,
            enduranceMin=None,
            finalReserveKg=None,
            missingDataReasons=["Fuel on board not broadcast over ADS-B; requires pilot report or WHAT_IF scenario."],
            provenance=Provenance.UNKNOWN,
        )

        capability = Capability(
            lvpApproach=LvpApproach.CAT_I,
            operatorLvoApproved=False,
            missingDataReasons=["Specific crew and airframe autoland category unverified in public ADS-B."],
        )

        priority = Priority(
            level=PriorityLevel.EMERGENCY if is_squawk_7700 else PriorityLevel.NORMAL,
            reasonCodes=["OBSERVED_SQUAWK_7700"] if is_squawk_7700 else [],
            provenance=Provenance.OBSERVED if is_squawk_7700 else Provenance.UNKNOWN,
            declarationType=EmergencyDeclarationType.MAYDAY if is_squawk_7700 else EmergencyDeclarationType.NONE,
            declarationStatus=DeclarationStatus.UNCONFIRMED if is_squawk_7700 else DeclarationStatus.NONE,
            emergencyNature="Transponder Squawk 7700 observed (nature unconfirmed)" if is_squawk_7700 else None,
        )

        payload = AircraftStatePayload(
            callsign=display_callsign,
            trackId=track_id,
            aircraftType=ac_type,
            wakeCategory=wake,
            origin="UNKNOWN",
            destination="UNKNOWN",
            flightPhase=phase,
            inferredFlightClass=inferred_class,
            status=FlightStatus.PRIORITY if is_squawk_7700 else FlightStatus.NORMAL,
            position=Position(
                lat=round(float(lat), 5),
                lon=round(float(lon), 5),
                distanceToThresholdNm=round(dist_nm, 1),
                distanceReference="OMDB_ARP",
            ),
            altitudeFt=round(effective_alt, 0),
            headingDeg=round(track_deg if track_deg is not None else 0.0, 1),
            verticalRateFpm=round(vrate_fpm, 0),
            speed=Speed(
                indicatedAirspeedKt=None,
                groundSpeedKt=round(gs_kt, 1) if gs_kt is not None else 0.0,
                trueAirspeedKt=float(raw["tas"]) if raw.get("tas") is not None else None,
                mach=float(raw["mach"]) if raw.get("mach") is not None else None,
                trackDeg=round(track_deg, 1) if track_deg is not None else None,
                airspeedType="GROUND_SPEED_OBSERVED",
                provenance=Provenance.OBSERVED,
            ),
            assignedRunway=None,
            approach=None,
            landingSequence=None,
            etaUtc=None,
            fuel=fuel,
            capability=capability,
            assignedControllerId=None,
            priority=priority,
            assignedStand=None,
            squawk=squawk_str,
            icao24=hex_id,
            registration=registration,
            identity=identity,
            observedAtUtc=obs_iso,
            receivedAtUtc=received_iso,
            dataFreshnessSec=round(seen_sec, 1),
            isStale=seen_sec > 45.0,
            trackDeg=round(track_deg, 1) if track_deg is not None else None,
            altBaroFt=alt_baro_ft,
            altGeomFt=alt_geom_ft,
            onGround=on_ground,
            sourceProvider=provider_name,
            sourceRecordId=hex_id,
            missingDataReasons=["Live ADS-B feed: fuel, stand, destination, and ATC clearances are not available."],
            provenance=Provenance.OBSERVED,
        )
        return payload, obs_epoch

    def _advance_and_evict(self, now_mono: float, now_iso: str) -> Tuple[Dict[str, AircraftStatePayload], List[str]]:
        """Evicts tracks not seen in 120 seconds and increments age of retained tracks."""
        evicted: List[str] = []
        for hex_id, last_mono in list(self.last_seen_monotonic.items()):
            age = now_mono - last_mono
            if age > 120.0:
                evicted.append(hex_id)
                self.cached_tracks.pop(hex_id, None)
                self.last_seen_monotonic.pop(hex_id, None)
                self.last_obs_epoch.pop(hex_id, None)
            elif hex_id in self.cached_tracks:
                self.cached_tracks[hex_id].dataFreshnessSec = round(age, 1)
                self.cached_tracks[hex_id].isStale = age > 45.0

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
