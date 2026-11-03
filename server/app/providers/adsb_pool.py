"""Automatic Multi-Provider ADS-B Pool & Router.

Manages independent free-tier aircraft observation providers:
1. adsb.lol (Primary ODbL feed)
2. adsb.fi (Secondary opendata feed, 1 req/s personal/educational)
3. OpenSky_Network (Tertiary educational/research feed)

Implements automatic failover on HTTP 429, exhausted credits, timeouts, or 0 regional coverage,
while preserving stable trackId/icao24 session identities across provider switches.
"""
import datetime
import time
from typing import Dict, List, Optional, Any, Tuple

from app.models import AircraftStatePayload, ProviderHealth, ProviderStatus
from app.providers.adsb_lol import AdsbLolProvider
from app.providers.adsb_fi import AdsbFiProvider
from app.providers.opensky import OpenSkyProvider


class ProviderSlot:
    def __init__(self, provider: Any, priority: int, default_budget: int = 120):
        self.provider = provider
        self.priority = priority
        self.default_budget = default_budget
        self.remaining_budget: int = default_budget
        self.next_eligible_mono: float = 0.0
        self.consecutive_errors: int = 0
        self.last_coverage_count: int = 0
        self.median_obs_age_sec: float = 0.0
        self.needs_auth_config: bool = False


class AdsbProviderPool:
    def __init__(self):
        self.lol = AdsbLolProvider()
        self.fi = AdsbFiProvider()
        self.opensky = OpenSkyProvider()

        self.slots: List[ProviderSlot] = [
            ProviderSlot(self.lol, priority=1, default_budget=120),
            ProviderSlot(self.fi, priority=2, default_budget=120),
            ProviderSlot(self.opensky, priority=3, default_budget=60),
        ]
        self.active_slot_idx: int = 0
        self.shared_tracks: Dict[str, AircraftStatePayload] = {}
        self.shared_last_seen_mono: Dict[str, float] = {}
        self.shared_last_obs_epoch: Dict[str, float] = {}
        self.switch_diagnostics: List[Dict[str, Any]] = []

    @property
    def active_provider_name(self) -> str:
        return self.slots[self.active_slot_idx].provider.name

    async def close(self):
        for s in self.slots:
            await s.provider.close()

    def get_health(self) -> ProviderHealth:
        """Returns aggregate health of the currently active ADS-B provider."""
        slot = self.slots[self.active_slot_idx]
        return slot.provider.get_health()

    def get_all_health(self) -> List[Dict[str, Any]]:
        out = []
        now_mono = time.monotonic()
        for idx, s in enumerate(self.slots):
            h = s.provider.get_health().model_dump()
            h["isActiveInPool"] = idx == self.active_slot_idx
            h["priority"] = s.priority
            h["remainingBudget"] = s.remaining_budget
            h["cooldownRemainingSec"] = max(0.0, round(s.next_eligible_mono - now_mono, 1))
            h["lastCoverageCount"] = s.last_coverage_count
            h["medianObservationAgeSec"] = round(s.median_obs_age_sec, 1)
            out.append(h)
        return out

    def _log_switch(self, from_prov: str, to_prov: str, reason: str):
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.switch_diagnostics.insert(0, {
            "timestampUtc": now_iso,
            "fromProvider": from_prov,
            "toProvider": to_prov,
            "reason": reason,
        })
        if len(self.switch_diagnostics) > 50:
            self.switch_diagnostics.pop()

    async def fetch_observations(self) -> Tuple[Dict[str, AircraftStatePayload], List[str]]:
        """
        Routes the observation request to the highest-priority eligible provider.
        Automatically fails over on 429, timeout, error, or 0 coverage.
        """
        now_mono = time.monotonic()
        now_epoch = time.time()

        # Order slots: prefer highest-priority eligible slot (recovery probe after cooldown),
        # or currently active slot if still eligible and highest priority.
        eligible_indices = [
            i for i, s in enumerate(self.slots)
            if now_mono >= s.next_eligible_mono and not s.needs_auth_config
        ]
        if not eligible_indices:
            # All providers are in cooldown; advance age of existing shared tracks without upstream call
            return self._advance_and_evict(now_mono)

        # Sort eligible indices by priority (1 first)
        eligible_indices.sort(key=lambda idx: self.slots[idx].priority)

        for candidate_idx in eligible_indices:
            slot = self.slots[candidate_idx]
            prev_active_name = self.slots[self.active_slot_idx].provider.name

            # Seed provider's cache with shared session tracks so session metadata (callsign, type, trackId) is preserved
            slot.provider.cached_tracks = dict(self.shared_tracks)
            slot.provider.last_seen_monotonic = dict(self.shared_last_seen_mono)
            slot.provider.last_obs_epoch = dict(self.shared_last_obs_epoch)

            tracks, _ = await slot.provider.fetch_observations()
            now_after = time.monotonic()
            http_status = getattr(slot.provider, "last_http_status", None)
            retry_after = getattr(slot.provider, "last_retry_after_sec", None)

            # Check for quota exhaustion / HTTP 429
            if http_status == 429 or (slot.remaining_budget is not None and slot.remaining_budget <= 1):
                cooldown = retry_after if retry_after is not None else 60.0
                slot.next_eligible_mono = now_after + cooldown
                slot.consecutive_errors += 1
                next_name = self._peek_next_eligible_name(candidate_idx, now_after)
                self._log_switch(slot.provider.name, next_name, f"HTTP 429 / Quota exhausted (cooldown {cooldown}s)")
                continue

            # Check for auth config failure (401/403)
            if http_status in (401, 403):
                slot.needs_auth_config = True
                slot.next_eligible_mono = now_after + 300.0
                next_name = self._peek_next_eligible_name(candidate_idx, now_after)
                self._log_switch(slot.provider.name, next_name, f"HTTP {http_status} authentication required")
                continue

            # Check for network/service error or zero freshly updated tracks
            fresh_tracks = [
                t for hex_id, t in tracks.items()
                if slot.provider.last_seen_monotonic.get(hex_id, 0.0) >= now_mono - 1.0
            ]
            if http_status != 200 or len(fresh_tracks) == 0:
                slot.consecutive_errors += 1
                backoff = min(120.0, 15.0 * (2 ** min(slot.consecutive_errors - 1, 3)))
                slot.next_eligible_mono = now_after + backoff
                next_name = self._peek_next_eligible_name(candidate_idx, now_after)
                self._log_switch(
                    slot.provider.name,
                    next_name,
                    f"HTTP {http_status} or 0 regional tracks (backoff {backoff}s)",
                )
                continue

            # Success!
            if candidate_idx != self.active_slot_idx:
                self._log_switch(prev_active_name, slot.provider.name, "Automatic failover / recovery")
            self.active_slot_idx = candidate_idx
            slot.consecutive_errors = 0
            slot.remaining_budget = max(0, slot.remaining_budget - 1)
            slot.last_coverage_count = len(fresh_tracks)
            ages = sorted([t.dataFreshnessSec or 0.0 for t in fresh_tracks])
            slot.median_obs_age_sec = ages[len(ages) // 2] if ages else 0.0

            # Merge into shared store while rejecting older timestamps
            for hex_id, trk in slot.provider.cached_tracks.items():
                obs_ep = slot.provider.last_obs_epoch.get(hex_id, now_epoch)
                prev_ep = self.shared_last_obs_epoch.get(hex_id, 0.0)
                if obs_ep + 0.5 >= prev_ep:
                    self.shared_tracks[hex_id] = trk
                    self.shared_last_seen_mono[hex_id] = slot.provider.last_seen_monotonic.get(hex_id, now_after)
                    self.shared_last_obs_epoch[hex_id] = obs_ep

            return self._advance_and_evict(now_after)

        # If all candidates failed in this cycle, retain aged observations with degraded status
        return self._advance_and_evict(time.monotonic())

    def _peek_next_eligible_name(self, failed_idx: int, now_mono: float) -> str:
        for i, s in enumerate(self.slots):
            if i != failed_idx and now_mono >= s.next_eligible_mono and not s.needs_auth_config:
                return s.provider.name
        return "RETAINED_CACHE"

    def _advance_and_evict(self, now_mono: float) -> Tuple[Dict[str, AircraftStatePayload], List[str]]:
        evicted: List[str] = []
        for hex_id, last_mono in list(self.shared_last_seen_mono.items()):
            age = now_mono - last_mono
            if age > 120.0:
                evicted.append(hex_id)
                self.shared_tracks.pop(hex_id, None)
                self.shared_last_seen_mono.pop(hex_id, None)
                self.shared_last_obs_epoch.pop(hex_id, None)
            elif hex_id in self.shared_tracks:
                self.shared_tracks[hex_id].dataFreshnessSec = round(age, 1)
                self.shared_tracks[hex_id].isStale = age > 45.0
        return self.shared_tracks, evicted

