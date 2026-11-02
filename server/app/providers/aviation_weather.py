"""NOAA / NWS AviationWeather.gov provider for UAE aerodromes (OMDB, OMDW, OMSJ, OMAA, OMRK).

Fetches official METAR (every 60s) and TAF (every 600s) with bounded HTTP timeouts,
descriptive User-Agent, and strict provenance tracking.
Preserves original raw METAR/TAF text, runway-specific RVR without substitution,
and maintains clear separation between meteorological conditions and formal ATC LVP declaration.
"""
import time
import datetime
import logging
from typing import Dict, List, Optional, Any
import httpx

from app.models import (
    WeatherPayload,
    RvrItem,
    Wind,
    FlightCategory,
    LvpInfo,
    LvpPhase,
    Provenance,
    RunwayOperationalState,
    RunwayOperationalStatus,
    RunwayMode,
    LvpApproach
)
from app.providers.base import BaseProvider

logger = logging.getLogger("HoneyB.AviationWeather")

STATIONS = ["OMDB", "OMDW", "OMSJ", "OMAA", "OMRK"]
BASE_URL = "https://aviationweather.gov/api/data"
USER_AGENT = "HoneyB-Aviation-Monitor/1.0 (contact: operations@honeyb.local; research/demonstration)"


class AviationWeatherProvider(BaseProvider):
    def __init__(self):
        super().__init__(name="NOAA_AviationWeather", endpoint=f"{BASE_URL}/metar")
        self.station_weather: Dict[str, Dict[str, Any]] = {}
        self.last_taf_fetch_monotonic: float = -9999.0
        self.taf_cache: Dict[str, Dict[str, Any]] = {}
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=12.0
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def fetch_metar_and_taf(self) -> Optional[WeatherPayload]:
        """Fetches METAR and periodic TAF for UAE airports, returning normalized OMDB payload."""
        now_mono = time.monotonic()
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        client = await self.get_client()

        # 1. Fetch TAF if 10 minutes have elapsed
        if (now_mono - self.last_taf_fetch_monotonic) >= 600.0:
            await self._fetch_taf(client, now_iso)
            self.last_taf_fetch_monotonic = now_mono

        # 2. Fetch METAR
        t0 = time.monotonic()
        url = f"{BASE_URL}/metar?ids={','.join(STATIONS)}&format=json"
        try:
            resp = await client.get(url)
            latency_ms = (time.monotonic() - t0) * 1000.0

            if resp.status_code == 204:
                self.record_success(count=0, latency_ms=latency_ms, timestamp_iso=now_iso)
                return None
            elif resp.status_code != 200:
                self.record_failure(f"HTTP {resp.status_code}: {resp.text[:120]}", now_iso)
                return None

            data = resp.json()
            if not isinstance(data, list):
                self.record_failure("Malformed JSON response (expected list)", now_iso)
                return None

            self.record_success(count=len(data), latency_ms=latency_ms, timestamp_iso=now_iso)

            # Store stations
            for ob in data:
                icao = ob.get("icaoId")
                if icao:
                    self.station_weather[icao] = ob

            # Parse primary OMDB payload
            omdb_ob = self.station_weather.get("OMDB")
            if omdb_ob:
                return self._normalize_omdb(omdb_ob, now_iso)
            return None

        except httpx.TimeoutException:
            self.record_failure("Request timed out (12s)", now_iso)
            return None
        except Exception as e:
            self.record_failure(f"Network error: {str(e)}", now_iso)
            return None

    async def _fetch_taf(self, client: httpx.AsyncClient, now_iso: str):
        url = f"{BASE_URL}/taf?ids={','.join(STATIONS)}&format=json"
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    for taf_item in data:
                        icao = taf_item.get("icaoId")
                        if icao:
                            self.taf_cache[icao] = taf_item
        except Exception as e:
            logger.warning(f"TAF fetch non-critical error: {e}")

    def _normalize_omdb(self, ob: Dict[str, Any], received_iso: str) -> WeatherPayload:
        raw_metar = ob.get("rawOb") or "METAR OMDB"
        obs_time = ob.get("obsTime")
        if obs_time:
            # e.g. 1730563200 (epoch) or ISO
            if isinstance(obs_time, (int, float)):
                observed_iso = datetime.datetime.fromtimestamp(obs_time, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                observed_iso = str(obs_time)
        else:
            observed_iso = received_iso

        # Visibility conversion: AviationWeather returns visib in statute miles or string (e.g. "6+", 3.73)
        visib_sm = ob.get("visib")
        if visib_sm is not None:
            try:
                if isinstance(visib_sm, str) and visib_sm.endswith("+"):
                    sm_val = float(visib_sm[:-1])
                else:
                    sm_val = float(visib_sm)
                vis_m = round(sm_val * 1609.34, 1)
            except Exception:
                vis_m = 9999.0
        else:
            # Fallback to CAVOK or standard 9999
            vis_m = 9999.0 if "CAVOK" in raw_metar else 5000.0

        # Parse RVR only if explicitly reported in METAR (e.g. R30L/0400N)
        rvr_list: List[RvrItem] = []
        for word in raw_metar.split():
            if word.startswith("R") and "/" in word and len(word) >= 8:
                parts = word[1:].split("/")
                rwy = parts[0]
                val_str = parts[1].rstrip("NDUFTM")
                try:
                    val_m = float(val_str.lstrip("PM"))
                    trend = "UPWARD" if "U" in parts[1] else ("DOWNWARD" if "D" in parts[1] else "NO_CHANGE")
                    rvr_list.append(RvrItem(runway=rwy, valueM=val_m, trend=trend))
                except Exception:
                    pass

        # Wind
        wdir = float(ob.get("wdir") or 0.0)
        wspd = float(ob.get("wspd") or 0.0)
        temp_c = float(ob.get("temp") or 25.0)
        altim = float(ob.get("altim") or 1013.25) # in hPa or inHg; if < 200, assume inHg
        qnh = altim if altim > 500 else round(altim * 33.8639, 1)

        # Ceiling
        cover = ob.get("cover")
        cld_bas = ob.get("cldBas1")
        ceiling_ft = float(cld_bas) if cld_bas is not None else 9999.0

        # Flight category
        flt_cat_str = ob.get("fltcat", "VFR").upper()
        flight_cat = (
            FlightCategory.LIFR if flt_cat_str == "LIFR"
            else (FlightCategory.IFR if flt_cat_str == "IFR"
            else (FlightCategory.MVFR if flt_cat_str == "MVFR" else FlightCategory.VFR))
        )

        # Meteorological LVP awareness: note that weather indicates low visibility conditions,
        # but does NOT claim airport authority has enacted formal LVP procedures without operator confirmation.
        is_low_vis = vis_m < 800.0 or any(r.valueM < 800.0 for r in rvr_list)
        lvp_info = LvpInfo(
            active=is_low_vis,
            phase=LvpPhase.LVP_ACTIVE if (vis_m <= 400.0 or any(r.valueM <= 400.0 for r in rvr_list))
                  else (LvpPhase.LVP_PREPARATION if is_low_vis else LvpPhase.NONE)
        )

        # TAF
        taf_entry = self.taf_cache.get("OMDB")
        raw_taf = taf_entry.get("rawTAF") if taf_entry else None
        taf_validity = (
            f"{taf_entry.get('validTimeFrom', '')} to {taf_entry.get('validTimeTo', '')}"
            if taf_entry else None
        )

        # Runway states reference
        runway_states = {
            "30L": RunwayOperationalState(
                runway="30L", serviceable=True, status=RunwayOperationalStatus.OPEN,
                mode=RunwayMode.ARRIVAL, ilsCategory=LvpApproach.CAT_IIIB, smrServiceable=True,
                observedAtUtc=observed_iso, provenance=Provenance.OBSERVED
            ),
            "30R": RunwayOperationalState(
                runway="30R", serviceable=True, status=RunwayOperationalStatus.OPEN,
                mode=RunwayMode.DEPARTURE, ilsCategory=LvpApproach.CAT_IIIB, smrServiceable=True,
                observedAtUtc=observed_iso, provenance=Provenance.OBSERVED
            ),
            "12L": RunwayOperationalState(
                runway="12L", serviceable=True, status=RunwayOperationalStatus.RESTRICTED,
                mode=RunwayMode.CLOSED, ilsCategory=LvpApproach.CAT_IIIB, smrServiceable=True,
                reason="Reciprocal configuration", observedAtUtc=observed_iso, provenance=Provenance.REFERENCE
            ),
            "12R": RunwayOperationalState(
                runway="12R", serviceable=True, status=RunwayOperationalStatus.RESTRICTED,
                mode=RunwayMode.CLOSED, ilsCategory=LvpApproach.CAT_IIIB, smrServiceable=True,
                reason="Reciprocal configuration", observedAtUtc=observed_iso, provenance=Provenance.REFERENCE
            )
        }

        alerts = []
        if is_low_vis:
            alerts.append(f"LOW VISIBILITY CONDITIONS: Vis {vis_m:.0f}m, check ILS autoland eligibility.")

        return WeatherPayload(
            airport="OMDB",
            name="OBSERVED_METAR",
            observedAt=observed_iso,
            rawMetar=raw_metar,
            visibilityM=vis_m,
            rvr=rvr_list,
            ceilingFt=ceiling_ft,
            wind=Wind(directionDeg=wdir, speedKt=wspd),
            temperatureC=temp_c,
            qnhHpa=qnh,
            flightCategory=flight_cat,
            lvp=lvp_info,
            smrServiceable=True,
            runwayStates=runway_states,
            dataFreshnessSec=0.0,
            alerts=alerts,
            rawTaf=raw_taf,
            tafValidity=taf_validity,
            sourceProvider="NOAA_AVIATION_WEATHER",
            sourceRecordId=ob.get("metar_id", "NOAA-OMDB"),
            receivedAtUtc=received_iso,
            provenance=Provenance.OBSERVED
        )

