"""OpenSky Network Aircraft Observation Provider.

Documentation: https://openskynetwork.github.io/opensky-api/rest.html
Terms of Use: https://opensky-network.org/about/terms-of-use (Nonprofit educational/research use)
Endpoint: https://opensky-network.org/api/states/all?lamin=23.6&lomin=53.5&lamax=26.9&lomax=57.2
"""
import datetime
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
from app.providers.adsb_lol import AdsbLolProvider, USER_AGENT
from app.providers.airline_directory import AirlineDirectory

OPENSKY_STATES_URL = "https://opensky-network.org/api/states/all?lamin=23.6&lomin=53.5&lamax=26.9&lomax=57.2"


class OpenSkyProvider(BaseProvider):
    def __init__(self):
        lat, lon = AdsbLolProvider._get_omdb_arp()
        self.arp_lat = lat
        self.arp_lon = lon
        super().__init__(name="OpenSky_Network", endpoint=OPENSKY_STATES_URL)
        self.username = os.environ.get("OPENSKY_USERNAME", "").strip()
        self.password = os.environ.get("OPENSKY_PASSWORD", "").strip()
        self.cached_tracks: Dict[str, AircraftStatePayload] = {}
        self.last_seen_monotonic: Dict[str, float] = {}
        self.last_obs_epoch: Dict[str, float] = {}
        self.remaining_credits: Optional[int] = None
        self.last_retry_after_sec: Optional[float] = None
        self.last_http_status: Optional[int] = None
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
            auth = (self.username, self.password) if (self.username and self.password) else None
            self._client = httpx.AsyncClient(headers=headers, auth=auth, timeout=12.0)
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def fetch_observations(self) -> Tuple[Dict[str, AircraftStatePayload], List[str]]:
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

            rem_hdr = resp.headers.get("X-Rate-Limit-Remaining")
            if rem_hdr and rem_hdr.lstrip("-").isdigit():
                self.remaining_credits = int(rem_hdr)

            if resp.status_code == 429:
                retry_hdr = (
                    resp.headers.get("X-Rate-Limit-Retry-After-Seconds")
                    or resp.headers.get("Retry-After")
                )
                self.last_retry_after_sec = float(retry_hdr) if (retry_hdr and retry_hdr.isdigit()) else 120.0
                self.record_failure(f"HTTP 429 Quota Exhausted (Retry-After {self.last_retry_after_sec}s)", now_iso)
                return self._advance_and_evict(now_mono)
            elif resp.status_code in (401, 403):
                self.record_failure(f"HTTP {resp.status_code} Authentication/Config Required", now_iso)
                return self._advance_and_evict(now_mono)
            elif resp.status_code != 200:
                self.record_failure(f"HTTP {resp.status_code}: {resp.text[:120]}", now_iso)
                return self._advance_and_evict(now_mono)

            data = resp.json()
            states = data.get("states") or []
            self.record_success(count=len(states), latency_ms=latency_ms, timestamp_iso=now_iso)

            for sv in states:
                if not isinstance(sv, list) or len(sv) < 15:
                    continue
                hex_id = str(sv[0] or "").strip().lower()
                if not hex_id:
                    continue

                existing = self.cached_tracks.get(hex_id)
                last_mono = self.last_seen_monotonic.get(hex_id)
                in_active_session = existing is not None and last_mono is not None and (now_mono - last_mono) <= 120.0

                track_obj, obs_epoch = self.normalize_opensky_state(
                    sv,
                    hex_id=hex_id,
                    received_iso=now_iso,
                    now_epoch=now_epoch,
                    arp_lat=self.arp_lat,
                    arp_lon=self.arp_lon,
                    previous_track=existing if in_active_session else None,
                )
                if track_obj:
                    prev_epoch = self.last_obs_epoch.get(hex_id, 0.0)
                    if obs_epoch + 0.5 < prev_epoch:
                        continue
                    self.cached_tracks[hex_id] = track_obj
                    self.last_seen_monotonic[hex_id] = now_mono
                    self.last_obs_epoch[hex_id] = obs_epoch

            return self._advance_and_evict(now_mono)

        except httpx.TimeoutException:
            self.last_http_status = 504
            self.record_failure(f"{self.name} request timed out (12s)", now_iso)
            return self._advance_and_evict(now_mono)
        except Exception as e:
            self.last_http_status = 500
            self.record_failure(f"{self.name} network error: {str(e)}", now_iso)
            return self._advance_and_evict(now_mono)

    @classmethod
    def normalize_opensky_state(
        cls,
        sv: List[Any],
        hex_id: str,
        received_iso: str,
        now_epoch: float,
        arp_lat: float = 25.24979,
        arp_lon: float = 55.370992,
        previous_track: Optional[AircraftStatePayload] = None,
    ) -> Tuple[Optional[AircraftStatePayload], float]:
        lon = sv[5]
        lat = sv[6]
        if lat is None or lon is None:
            return None, 0.0

        dist_nm = AdsbLolProvider._haversine_nm(float(lat), float(lon), arp_lat, arp_lon)
        if dist_nm > 110.0:
            return None, 0.0

        on_ground = bool(sv[8])
        baro_m = sv[7]
        geo_m = sv[13]
        alt_baro_ft = round(float(baro_m) * 3.28084, 0) if baro_m is not None else (62.0 if on_ground else None)
        alt_geom_ft = round(float(geo_m) * 3.28084, 0) if geo_m is not None else None
        effective_alt = alt_baro_ft if alt_baro_ft is not None else (alt_geom_ft or 0.0)

        vel_ms = sv[9]
        gs_kt = round(float(vel_ms) * 1.94384, 1) if vel_ms is not None else None
        track_deg = round(float(sv[10]), 1) if sv[10] is not None else None
        vr_ms = sv[11]
        vrate_fpm = round(float(vr_ms) * 196.85, 0) if vr_ms is not None else 0.0

        flight_raw = sv[1]
        if (not flight_raw or not str(flight_raw).strip()) and previous_track and previous_track.identity:
            flight_raw = previous_track.identity.callsignRaw or previous_track.identity.callsignObserved

        track_id = previous_track.trackId if (previous_track and previous_track.trackId) else f"TRK-{hex_id.upper()}"
        identity, display_callsign = AirlineDirectory.resolve_identity(
            icao24=hex_id,
            callsign_raw=flight_raw,
            fetched_at_utc=received_iso,
            track_id=track_id,
            registration=previous_track.registration if previous_track else None,
        )

        time_pos = sv[3] or sv[4] or now_epoch
        obs_epoch = float(time_pos)
        seen_sec = max(0.0, now_epoch - obs_epoch)
        obs_iso = datetime.datetime.fromtimestamp(obs_epoch, tz=datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        squawk_str = str(sv[14] or "").strip() or None
        is_squawk_7700 = squawk_str == "7700"

        if AirlineDirectory.is_surface_vehicle(identity.callsignObserved):
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

        ac_type = previous_track.aircraftType if (previous_track and previous_track.aircraftType != "UNKNOWN") else "UNKNOWN"
        wake = previous_track.wakeCategory if (previous_track and previous_track.wakeCategory != "UNKNOWN") else "UNKNOWN"

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
            altitudeFt=effective_alt,
            headingDeg=track_deg if track_deg is not None else 0.0,
            verticalRateFpm=vrate_fpm,
            speed=Speed(
                indicatedAirspeedKt=None,
                groundSpeedKt=gs_kt if gs_kt is not None else 0.0,
                trueAirspeedKt=None,
                mach=None,
                trackDeg=track_deg,
                airspeedType="GROUND_SPEED_OBSERVED",
                provenance=Provenance.OBSERVED,
            ),
            assignedRunway=None,
            approach=None,
            landingSequence=None,
            etaUtc=None,
            fuel=Fuel(
                totalKg=None,
                enduranceMin=None,
                finalReserveKg=None,
                missingDataReasons=["Fuel on board not broadcast over OpenSky ADS-B."],
                provenance=Provenance.UNKNOWN,
            ),
            capability=Capability(
                lvpApproach=LvpApproach.CAT_I,
                operatorLvoApproved=False,
                missingDataReasons=["Crew/airframe LVO category unverified in OpenSky ADS-B."],
            ),
            assignedControllerId=None,
            priority=Priority(
                level=PriorityLevel.EMERGENCY if is_squawk_7700 else PriorityLevel.NORMAL,
                reasonCodes=["OBSERVED_SQUAWK_7700"] if is_squawk_7700 else [],
                provenance=Provenance.OBSERVED if is_squawk_7700 else Provenance.UNKNOWN,
                declarationType=EmergencyDeclarationType.MAYDAY if is_squawk_7700 else EmergencyDeclarationType.NONE,
                declarationStatus=DeclarationStatus.UNCONFIRMED if is_squawk_7700 else DeclarationStatus.NONE,
            ),
            assignedStand=None,
            squawk=squawk_str,
            icao24=hex_id,
            registration=previous_track.registration if previous_track else None,
            identity=identity,
            observedAtUtc=obs_iso,
            receivedAtUtc=received_iso,
            dataFreshnessSec=round(seen_sec, 1),
            isStale=seen_sec > 45.0,
            trackDeg=track_deg,
            altBaroFt=alt_baro_ft,
            altGeomFt=alt_geom_ft,
            onGround=on_ground,
            sourceProvider="OpenSky_Network",
            sourceRecordId=hex_id,
            missingDataReasons=["Live OpenSky feed: aircraft type, fuel, stand, and ATC clearances are not available."],
            provenance=Provenance.OBSERVED,
        )
        return payload, obs_epoch

    def _advance_and_evict(self, now_mono: float) -> Tuple[Dict[str, AircraftStatePayload], List[str]]:
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

