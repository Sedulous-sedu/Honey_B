"""adsb.fi Open Data Aircraft Observation Provider.

Documentation: https://github.com/adsbfi/opendata
Endpoint: https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{dist}
Rate limit: 1 req/sec for personal/non-commercial/educational hackathon use.
"""
import datetime
import time
from typing import Dict, List, Optional, Tuple
import httpx

from app.models import AircraftStatePayload
from app.providers.base import BaseProvider
from app.providers.adsb_lol import AdsbLolProvider, SEARCH_RADIUS_NM, USER_AGENT

ADSB_FI_URL = "https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{dist}"


class AdsbFiProvider(BaseProvider):
    def __init__(self):
        lat, lon = AdsbLolProvider._get_omdb_arp()
        self.arp_lat = lat
        self.arp_lon = lon
        endpoint = ADSB_FI_URL.format(lat=round(lat, 4), lon=round(lon, 4), dist=SEARCH_RADIUS_NM)
        super().__init__(name="adsb.fi", endpoint=endpoint)
        self.cached_tracks: Dict[str, AircraftStatePayload] = {}
        self.last_seen_monotonic: Dict[str, float] = {}
        self.last_obs_epoch: Dict[str, float] = {}
        self.last_retry_after_sec: Optional[float] = None
        self.last_http_status: Optional[int] = None
        self._client: Optional[httpx.AsyncClient] = None

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
            self._client = httpx.AsyncClient(headers=headers, timeout=12.0)
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

            if resp.status_code == 204:
                self.record_success(count=0, latency_ms=latency_ms, timestamp_iso=now_iso)
                return self._advance_and_evict(now_mono)
            elif resp.status_code == 429:
                retry_hdr = resp.headers.get("Retry-After")
                self.last_retry_after_sec = float(retry_hdr) if (retry_hdr and retry_hdr.isdigit()) else 60.0
                self.record_failure(f"HTTP 429 Rate Limited (Retry-After {self.last_retry_after_sec}s)", now_iso)
                return self._advance_and_evict(now_mono)
            elif resp.status_code != 200:
                self.record_failure(f"HTTP {resp.status_code}: {resp.text[:120]}", now_iso)
                return self._advance_and_evict(now_mono)

            data = resp.json()
            raw_aircraft = data.get("aircraft") if isinstance(data.get("aircraft"), list) else data.get("ac", [])
            self.record_success(count=len(raw_aircraft), latency_ms=latency_ms, timestamp_iso=now_iso)

            for ac in raw_aircraft:
                hex_id = str(ac.get("hex", "")).strip().lower()
                if not hex_id:
                    continue

                existing = self.cached_tracks.get(hex_id)
                last_mono = self.last_seen_monotonic.get(hex_id)
                in_active_session = existing is not None and last_mono is not None and (now_mono - last_mono) <= 120.0

                track_obj, obs_epoch = AdsbLolProvider.normalize_readsb_track(
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

