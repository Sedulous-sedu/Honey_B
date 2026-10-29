import json
import os
from typing import Dict, Any, List, Optional, Tuple
from pydantic import BaseModel, Field

KNOWN_WAKE_CATEGORIES = {"SUPER", "HEAVY", "MEDIUM", "LIGHT"}


class KnowledgeParameter(BaseModel):
    value: Any
    units: str
    source: str
    revisionDate: str
    epistemicStatus: str  # AUTHORITATIVE, PILOT_REPORTED, SIMULATED, DEMO_ASSUMPTION
    notes: Optional[str] = None


class StressScenarioSpec(BaseModel):
    scenarioId: str
    label: str
    etaDeltaSec: float
    fuelBurnMultiplier: float
    rotDeltaSec: float
    epistemicStatus: str = "DEMO_ASSUMPTION"


class KnowledgeCore:
    """
    Versioned, evidence-driven Knowledge Core for OMDB runway configuration,
    wake turbulence separation, low-visibility procedures (LVP), approach eligibility,
    emergency declaration hierarchy, and deterministic uncertainty stress scenarios.
    """

    def __init__(self, raw_data: Optional[Dict[str, Any]] = None):
        if raw_data is None:
            data_path = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "../data/omdb_knowledge_core.json")
            )
            with open(data_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
        self.raw: Dict[str, Any] = raw_data
        self.policy_version: str = raw_data["policyVersion"]
        self.aerodrome_icao: str = raw_data.get("aerodromeIcao", "OMDB")
        self.effective_date: str = raw_data.get("effectiveDate", "2026-10-28")
        self.disclaimer: str = raw_data.get("disclaimer", "")

    def get_metadata_summary(self) -> Dict[str, Any]:
        return {
            "policyVersion": self.policy_version,
            "aerodromeIcao": self.aerodrome_icao,
            "effectiveDate": self.effective_date,
            "disclaimer": self.disclaimer,
            "epistemicLegend": self.raw.get("epistemicLegend", {}),
            "references": self.raw.get("references", []),
        }

    def is_known_wake_category(self, wake: Optional[str]) -> bool:
        if not wake:
            return False
        return wake.upper().strip() in KNOWN_WAKE_CATEGORIES

    def get_wake_separation(
        self, leader_wake: str, follower_wake: str
    ) -> Tuple[float, float]:
        """
        Returns (wake_distance_nm, wake_time_sec) for leader -> follower.
        Assumes both wake categories have been validated by is_known_wake_category.
        """
        lw = leader_wake.upper().strip()
        fw = follower_wake.upper().strip()
        dist_matrix = self.raw["wakeSeparationPolicy"]["distanceMatrixNm"]
        time_matrix = self.raw["wakeSeparationPolicy"]["timeMatrixSec"]
        dist_nm = float(dist_matrix.get(lw, {}).get(fw, 3.0))
        time_sec = float(time_matrix.get(lw, {}).get(fw, 72.0))
        return dist_nm, time_sec

    def get_min_radar_separation_nm(self, lvp_active: bool, lvp_phase: str) -> float:
        radar_cfg = self.raw["wakeSeparationPolicy"]["minimumRadarSeparationNm"]
        phase = (lvp_phase or "NONE").upper()
        if lvp_active and phase == "LVP_ACTIVE":
            return float(radar_cfg["lvpActive"]["value"])
        if lvp_active or phase == "LVP_PREPARATION":
            return float(radar_cfg["lvpPreparation"]["value"])
        return float(radar_cfg["normal"]["value"])

    def get_final_approach_speed_kt(self, wake_category: str) -> float:
        speeds = self.raw["wakeSeparationPolicy"]["nominalFinalApproachGroundSpeedKt"]
        return float(speeds.get(wake_category.upper().strip(), 140.0))

    def get_runway_occupancy_time_sec(
        self, wake_category: str, lvp_active: bool, extra_rot_sec: float = 0.0
    ) -> float:
        rot_cfg = self.raw["runwayConfiguration"]["runwayOccupancyTimeSec"]
        base_rot = float(
            rot_cfg["byWakeCategory"].get(wake_category.upper().strip(), 50.0)
        )
        lvp_pen = float(rot_cfg.get("lvpPenaltySec", 14.0)) if lvp_active else 0.0
        return base_rot + lvp_pen + extra_rot_sec

    def get_inter_arrival_separation_sec(
        self,
        leader_wake: str,
        follower_wake: str,
        lvp_active: bool,
        lvp_phase: str,
        follower_final_gs_kt: Optional[float] = None,
        extra_rot_sec: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Computes required inter-arrival spacing in seconds and NM between leader and follower
        on the same runway, combining wake distance, LVO radar spacing, wake time, and ROT.
        """
        wake_nm, wake_time_sec = self.get_wake_separation(leader_wake, follower_wake)
        radar_min_nm = self.get_min_radar_separation_nm(lvp_active, lvp_phase)
        required_nm = max(wake_nm, radar_min_nm)

        app_gs_kt = follower_final_gs_kt or self.get_final_approach_speed_kt(follower_wake)
        app_gs_kt = max(110.0, min(180.0, app_gs_kt))
        distance_time_sec = (required_nm / app_gs_kt) * 3600.0

        rot_sec = self.get_runway_occupancy_time_sec(
            leader_wake, lvp_active=lvp_active, extra_rot_sec=extra_rot_sec
        )
        required_time_sec = max(distance_time_sec, wake_time_sec, rot_sec)

        governing = "RADAR_LVO_SPACING" if radar_min_nm > wake_nm else "WAKE_SEPARATION"
        if rot_sec >= distance_time_sec and rot_sec >= wake_time_sec:
            governing = "RUNWAY_OCCUPANCY_TIME"

        return {
            "requiredDistanceNm": round(required_nm, 2),
            "wakeDistanceNm": round(wake_nm, 2),
            "radarMinDistanceNm": round(radar_min_nm, 2),
            "wakeTimeSec": round(wake_time_sec, 1),
            "distanceBasedTimeSec": round(distance_time_sec, 1),
            "runwayOccupancyTimeSec": round(rot_sec, 1),
            "requiredSeparationSec": round(required_time_sec, 1),
            "governingConstraint": governing,
        }

    def get_approach_minima(self, approach_category: str) -> Dict[str, float]:
        minima_map = self.raw["lowVisibilityPolicy"]["approachCategoryMinima"]
        cat = (approach_category or "CAT_I").upper().strip()
        entry = minima_map.get(cat, minima_map["CAT_I"])
        return {
            "minRvrM": float(entry["minRvrM"]),
            "minVisibilityM": float(entry["minVisibilityM"]),
            "minCeilingFt": float(entry["minCeilingFt"]),
        }

    def get_smr_required_threshold_m(self) -> float:
        return float(self.raw["lowVisibilityPolicy"]["smrRequiredThresholdM"]["value"])

    def get_freeze_horizon_nm(self) -> float:
        return float(
            self.raw["sequencingAndFuelPolicy"]["freezeHorizonDistanceNm"]["value"]
        )

    def get_max_cps_shift(self) -> int:
        return int(
            self.raw["sequencingAndFuelPolicy"]["maxConstrainedPositionShift"]["value"]
        )

    def get_displaced_min_fuel_margin_kg(self) -> float:
        return float(
            self.raw["sequencingAndFuelPolicy"][
                "displacedAircraftMinFuelMarginAboveReserveKg"
            ]["value"]
        )

    def get_caution_fuel_margin_kg(self) -> float:
        return float(
            self.raw["sequencingAndFuelPolicy"]["cautionFuelMarginKg"]["value"]
        )

    def get_stale_telemetry_threshold_sec(self) -> float:
        return float(
            self.raw["sequencingAndFuelPolicy"]["telemetryFreshnessThresholdsSec"][
                "unusableForAutomatedSequencingSec"
            ]["value"]
        )

    def get_sidestep_policy(self) -> Tuple[float, float]:
        cfg = self.raw["runwayConfiguration"]["runwaySidestepPolicy"]
        return (
            float(cfg["minDistanceNmForRunwayChange"]["value"]),
            float(cfg["reestablishmentTimePenaltySec"]["value"]),
        )

    def get_stress_scenarios(self) -> List[StressScenarioSpec]:
        items = self.raw.get("uncertaintyScenarios", {}).get("scenarios", [])
        return [StressScenarioSpec(**s) for s in items]

    def get_uncertainty_disclaimer(self) -> str:
        return self.raw.get("uncertaintyScenarios", {}).get(
            "disclaimer",
            "DETERMINISTIC STRESS SCENARIOS ONLY — NOT CALIBRATED PROBABILITIES.",
        )


default_knowledge_core = KnowledgeCore()
