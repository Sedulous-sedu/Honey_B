"""Synthetic Traffic Generator and Lifecycle Manager for Honey B simulation.

Maintains a continuous, realistic stream of synthetic air traffic for OMDB (Dubai International):
- Inbound arrivals on standard STAR corridors with realistic glidepath descent
- Gate allocation, taxi-in, turnaround dwell, and stand turnover
- Outbound departures with pushback, taxi-out, takeoff roll, and climb-out
- Dynamic spawn throttling adapting to weather (VMC vs Low Visibility Procedures)
- Strict preservation of persistent demonstration flights (UAE231, FDB512, THY762, BAW107, IGO1433, SIA317)
"""
import os
import json
import math
import random
from typing import Dict, Any, Optional, List

from app.state import state
from app.models import (
    AircraftStatePayload,
    FlightPhase,
    FlightStatus,
    Priority,
    PriorityLevel,
    Position,
    Speed,
    Fuel,
    Capability,
    LvpApproach,
    Provenance
)


class TrafficGenerator:
    _config: Optional[Dict[str, Any]] = None
    _timers: Dict[str, float] = {}       # aircraft_id -> phase timer in seconds
    _dwell_targets: Dict[str, float] = {} # aircraft_id -> target dwell duration
    _last_arrival_spawn_sim_sec: float = -999.0
    _last_dep_spawn_sim_sec: float = -999.0
    _serial: int = 400

    @classmethod
    def load_config(cls) -> Dict[str, Any]:
        if cls._config is None:
            config_path = os.path.join(state.data_dir, "synthetic_traffic.json")
            if os.path.exists(config_path):
                with open(config_path, "r") as f:
                    cls._config = json.load(f)
            else:
                cls._config = {}
        return cls._config

    @classmethod
    def reset(cls):
        """Reset generator state on scenario restart."""
        cls._timers.clear()
        cls._dwell_targets.clear()
        cls._last_arrival_spawn_sim_sec = state.sim_time_sec
        cls._last_dep_spawn_sim_sec = state.sim_time_sec
        cls._serial = 400

    @classmethod
    def tick(cls, dt: float):
        """Called every simulation tick to advance traffic lifecycle and maintain pipeline."""
        cfg = cls.load_config()
        if not cfg:
            return

        spawn_policy = cfg.get("spawnPolicy", {})
        is_lvp = state.weather.lvp.active if state.weather else False

        # 1. Update ground and lifecycle timers for existing aircraft
        cls._advance_ground_lifecycle(dt, spawn_policy)

        # 2. Maintain airborne arrivals pipeline
        target_arrivals = (
            spawn_policy.get("targetAirborneArrivalsLvp", 7)
            if is_lvp
            else spawn_policy.get("targetAirborneArrivalsNormal", 10)
        )
        cls._maintain_arrivals_pipeline(target_arrivals, is_lvp, spawn_policy)

        # 3. Maintain departure pipeline
        target_deps = spawn_policy.get("targetDeparturePipeline", 3)
        cls._maintain_departures_pipeline(target_deps, is_lvp, spawn_policy)

        # 4. Clean up despawned / completed aircraft
        cls._cleanup_distant_aircraft(spawn_policy)

    @classmethod
    def _advance_ground_lifecycle(cls, dt: float, policy: Dict[str, Any]):
        """Advances timers for taxiing, parked, and departing aircraft."""
        persistent_flights = set(policy.get("persistentDemoFlights", ["UAE231", "FDB512", "THY762", "BAW107", "IGO1433", "SIA317"]))

        for ac in list(state.aircraft.values()):
            callsign = ac.callsign
            cls._timers[callsign] = cls._timers.get(callsign, 0.0) + dt

            # TAXI_IN -> AT_STAND
            if ac.flightPhase == FlightPhase.TAXI_IN:
                taxi_in_target = policy.get("taxiInSec", 75)
                # Assign stand if none
                if not ac.assignedStand:
                    stand_id = cls._find_free_stand(ac.wakeCategory)
                    if stand_id:
                        ac.assignedStand = stand_id
                        state.stands[stand_id]["status"] = "OCCUPIED"
                        state.stands[stand_id]["currentAircraft"] = callsign
                        state.log_event("GROUND", f"{callsign} assigned to stand {stand_id}.")

                if cls._timers[callsign] >= taxi_in_target:
                    ac.flightPhase = FlightPhase.AT_STAND
                    ac.status = FlightStatus.NORMAL
                    ac.speed.groundSpeedKt = 0.0
                    ac.speed.indicatedAirspeedKt = 0.0
                    cls._timers[callsign] = 0.0
                    # Set dwell target
                    dwell_range = policy.get("standDwellArrivalSec", 120)
                    cls._dwell_targets[callsign] = float(dwell_range)
                    state.log_event("GROUND", f"{callsign} arrived at stand {ac.assignedStand or 'RAMP'}. Turnaround in progress.")

            # AT_STAND dwell turnover
            elif ac.flightPhase in [FlightPhase.AT_STAND, FlightPhase.PARKED]:
                dwell_target = cls._dwell_targets.get(callsign, 120.0)
                if cls._timers[callsign] >= dwell_target:
                    # Persistent demo flights stay parked; transient synthetic flights turn around to departure
                    if callsign in persistent_flights:
                        # Reset timer so we don't spam
                        cls._timers[callsign] = 0.0
                    else:
                        cls._turnaround_to_departure(ac, policy)

            # TAXI_OUT -> DEPARTURE
            elif ac.flightPhase == FlightPhase.TAXI_OUT:
                taxi_out_target = policy.get("taxiOutSec", 80)
                if cls._timers[callsign] >= taxi_out_target:
                    # Line up and take off
                    ac.flightPhase = FlightPhase.DEPARTURE
                    ac.status = FlightStatus.NORMAL
                    ac.assignedRunway = "30R"
                    ac.headingDeg = 300.0
                    ac.targetHeadingDeg = random.choice([285.0, 320.0, 355.0, 80.0])
                    ac.altitudeFt = 62.0
                    ac.targetAltitudeFt = 14000.0
                    ac.speed.groundSpeedKt = 160.0
                    ac.targetSpeedKt = 250.0
                    ac.position.distanceToThresholdNm = 0.5
                    cls._timers[callsign] = 0.0
                    state.log_event("TOWER", f"{callsign} cleared for takeoff RWY {ac.assignedRunway}. Airborne, contact Radar.")

    @classmethod
    def _turnaround_to_departure(cls, ac: AircraftStatePayload, policy: Dict[str, Any]):
        """Transitions a parked synthetic aircraft into an active outbound flight."""
        callsign = ac.callsign
        # Vacate stand
        if ac.assignedStand and ac.assignedStand in state.stands:
            stand = state.stands[ac.assignedStand]
            stand["status"] = "FREE"
            stand["currentAircraft"] = None
            state.log_event("GROUND", f"{callsign} pushed back; stand {ac.assignedStand} is now FREE.")
            ac.assignedStand = None

        ac.flightPhase = FlightPhase.TAXI_OUT
        ac.status = FlightStatus.NORMAL
        ac.speed.groundSpeedKt = 15.0
        ac.speed.indicatedAirspeedKt = 15.0
        cls._timers[callsign] = 0.0
        state.log_event("GROUND", f"{callsign} taxiing out to holding point RWY 30R.")

    @classmethod
    def _maintain_arrivals_pipeline(cls, target_count: int, is_lvp: bool, policy: Dict[str, Any]):
        """Spawns realistic synthetic arrivals to maintain constant smooth inbound traffic."""
        airborne_arrivals = [
            a for a in state.aircraft.values()
            if a.flightPhase in [FlightPhase.ARRIVAL, FlightPhase.APPROACH, FlightPhase.FINAL, FlightPhase.HOLDING]
        ]

        if len(airborne_arrivals) >= target_count:
            return

        interval_range = (
            policy.get("arrivalIntervalSecLvp", [130, 170])
            if is_lvp
            else policy.get("arrivalIntervalSecNormal", [70, 100])
        )
        min_interval = interval_range[0]
        if (state.sim_time_sec - cls._last_arrival_spawn_sim_sec) < min_interval:
            return

        # Check total aircraft limit
        max_total = policy.get("maxTotalAircraft", 28)
        if len(state.aircraft) >= max_total:
            return

        # Generate fresh synthetic arrival
        new_flight = cls._generate_arrival(is_lvp, policy)
        if new_flight:
            state.aircraft[new_flight.callsign] = new_flight
            cls._last_arrival_spawn_sim_sec = state.sim_time_sec
            state.log_event(
                "RADAR",
                f"Synthetic radar contact: {new_flight.callsign} ({new_flight.aircraftType}) "
                f"inbound from {new_flight.origin} at {new_flight.position.distanceToThresholdNm:.1f} NM, "
                f"FL{int(new_flight.altitudeFt // 100):03d}."
            )

    @classmethod
    def _maintain_departures_pipeline(cls, target_count: int, is_lvp: bool, policy: Dict[str, Any]):
        """Ensures there is always active ground and outbound traffic."""
        active_deps = [
            a for a in state.aircraft.values()
            if a.flightPhase in [FlightPhase.TAXI_OUT, FlightPhase.DEPARTURE]
        ]
        if len(active_deps) >= target_count:
            return

        dep_interval = 140.0 if is_lvp else 90.0
        if (state.sim_time_sec - cls._last_dep_spawn_sim_sec) < dep_interval:
            return

        # Look for a parked aircraft that can push back, or spawn a new departure at an occupied stand
        cls._spawn_departure(policy)

    @classmethod
    def _generate_arrival(cls, is_lvp: bool, policy: Dict[str, Any]) -> Optional[AircraftStatePayload]:
        """Creates a fully formed, realistic synthetic arrival inbound to OMDB."""
        cfg = cls.load_config()
        airlines = cfg.get("airlines", [])
        types_meta = cfg.get("aircraftTypes", {})
        gates = cfg.get("arrivalGates", [])

        if not airlines or not types_meta:
            return None

        # Weighted airline selection
        weights = [a.get("weight", 1) for a in airlines]
        airline = random.choices(airlines, weights=weights, k=1)[0]

        # Select type
        ac_type = random.choice(airline.get("types", ["B77W"]))
        meta = types_meta.get(ac_type, {
            "wake": "HEAVY", "standSize": "WIDE", "holdingFuelFlowKgH": 5500,
            "finalReserveKg": 2800, "alternateFuelKg": 4200, "approachSpeedKt": 145
        })

        # Generate unique callsign
        cls._serial += 1
        callsign = f"{airline['icao']}{cls._serial}"
        while callsign in state.aircraft:
            cls._serial += 1
            callsign = f"{airline['icao']}{cls._serial}"

        origin = random.choice(airline.get("stations", ["EGLL", "LFPG", "OTHH", "VABB", "WSSS"]))
        destination = "OMDB"

        # Determine distance behind previous aircraft on arrival track
        existing_distances = [
            a.position.distanceToThresholdNm
            for a in state.aircraft.values()
            if a.flightPhase in [FlightPhase.ARRIVAL, FlightPhase.APPROACH, FlightPhase.FINAL]
        ]
        min_spacing = policy.get("minSpawnSpacingNmLvp", 10.0) if is_lvp else policy.get("minSpawnSpacingNormal", 7.5)
        furthest = max(existing_distances) if existing_distances else 25.0
        spawn_dist = max(34.0, min(52.0, furthest + min_spacing + random.uniform(1.0, 3.5)))

        # Pick arrival gate / bearing into OMDB
        gate = random.choice(gates) if gates else {"bearingFromAirportDeg": 120}
        bearing = gate.get("bearingFromAirportDeg", 120)

        # Calculate Lat/Lon from OMDB threshold 30L/30R along approach corridor
        # Threshold OMDB approx 25.2443, 55.3852. Bearing 120 deg (southeast)
        rad = math.radians(bearing)
        lat = 25.2443 - (spawn_dist * math.cos(rad)) / 60.0
        lon = 55.3852 + (spawn_dist * math.sin(rad)) / (60.0 * math.cos(math.radians(25.2443)))

        # Altitude based on distance (FL90-FL120 at 35-45 NM)
        initial_alt = round(min(12000.0, max(7000.0, 3000.0 + spawn_dist * 200.0)), -2)

        # Assigned runway: 30L for Heavies/Supers, 30R for Mediums or split
        if meta["wake"] in ["SUPER", "HEAVY"]:
            assigned_rwy = "30L"
        else:
            assigned_rwy = random.choice(["30L", "30R"])

        # Fuel calculations
        holding_ff = meta.get("holdingFuelFlowKgH", 5500)
        final_res = meta.get("finalReserveKg", 2800)
        alt_fuel = meta.get("alternateFuelKg", 4200)
        # 35 to 70 minutes holding endurance remaining
        holding_mins = random.uniform(35.0, 75.0)
        total_fuel = round(final_res + alt_fuel + (holding_ff / 60.0) * holding_mins)
        endurance_min = round(total_fuel / (holding_ff / 60.0), 1)

        # Capability
        airline_cap = airline.get("lvpApproach", "CAT_IIIB")
        app_cap = LvpApproach(airline_cap) if airline_cap in LvpApproach.__members__.values() else LvpApproach.CAT_IIIB

        ac_payload = AircraftStatePayload(
            callsign=callsign,
            aircraftType=ac_type,
            wakeCategory=meta["wake"],
            origin=origin,
            destination=destination,
            flightPhase=FlightPhase.ARRIVAL,
            status=FlightStatus.NORMAL,
            position=Position(
                lat=round(lat, 5),
                lon=round(lon, 5),
                distanceToThresholdNm=round(spawn_dist, 2)
            ),
            altitudeFt=initial_alt,
            targetAltitudeFt=4000.0,
            headingDeg=300.0,
            targetHeadingDeg=300.0,
            verticalRateFpm=-800.0,
            speed=Speed(
                indicatedAirspeedKt=240.0,
                groundSpeedKt=245.0
            ),
            targetSpeedKt=210.0,
            assignedRunway=assigned_rwy,
            approach=f"ILS CAT IIIB {assigned_rwy}" if app_cap == LvpApproach.CAT_IIIB else f"ILS {assigned_rwy}",
            priority=Priority(level=PriorityLevel.NORMAL, reasonCodes=[]),
            capability=Capability(
                lvpApproach=app_cap,
                rvsm=True,
                autoland=app_cap in [LvpApproach.CAT_IIIA, LvpApproach.CAT_IIIB]
            ),
            fuel=Fuel(
                totalKg=total_fuel,
                finalReserveKg=final_res,
                alternateFuelKg=alt_fuel,
                holdingFuelFlowKgH=holding_ff,
                approachFuelFlowKgH=round(holding_ff * 0.9),
                enduranceMin=endurance_min
            ),
            assignedControllerId="CTRL-ARR-01" if assigned_rwy == "30L" else "CTRL-ARR-02",
            assignedStand=None,
            squawk=f"{random.randint(1000, 7700):04d}",
            icao24=f"89{random.randint(1000, 9999):04x}",
            observedAtUtc=state.get_sim_time_iso(),
            dataFreshnessSec=0.0,
            provenance=Provenance.SIMULATED
        )
        return ac_payload

    @classmethod
    def _spawn_departure(cls, policy: Dict[str, Any]):
        """Pushes back a parked aircraft or introduces an outbound departure."""
        cfg = cls.load_config()
        routes = cfg.get("departureRoutes", [
            {"id": "SID-W", "bearingDeg": 285, "cruiseAltitudeFt": 15000}
        ])
        route = random.choice(routes)

        # Look for existing occupied stand that is not reserved
        candidate_stand = None
        for sid, s in state.stands.items():
            if s.get("status") == "OCCUPIED" and sid not in ["B12", "B14"]:
                c_flight = s.get("currentAircraft")
                if c_flight and c_flight in state.aircraft:
                    ac = state.aircraft[c_flight]
                    if ac.flightPhase in [FlightPhase.AT_STAND, FlightPhase.PARKED]:
                        cls._turnaround_to_departure(ac, policy)
                        cls._last_dep_spawn_sim_sec = state.sim_time_sec
                        return

        # If no occupied stand ready, pick a free stand to launch a quick pushback
        stand_id = cls._find_free_stand("WIDE")
        if not stand_id:
            return

        cls._serial += 1
        airline_icao = random.choice(["UAE", "FDB", "QTR", "SVA", "BAW"])
        callsign = f"{airline_icao}{cls._serial}D"
        dest = random.choice(["EGLL", "LFPG", "OEJN", "VABB", "OTHH"])

        dep_ac = AircraftStatePayload(
            callsign=callsign,
            aircraftType="B77W" if airline_icao == "UAE" else "B738",
            wakeCategory="HEAVY" if airline_icao == "UAE" else "MEDIUM",
            origin="OMDB",
            destination=dest,
            flightPhase=FlightPhase.TAXI_OUT,
            status=FlightStatus.NORMAL,
            position=Position(
                lat=25.2532,
                lon=55.3657,
                distanceToThresholdNm=1.2
            ),
            altitudeFt=62.0,
            targetAltitudeFt=float(route.get("cruiseAltitudeFt", 14000)),
            headingDeg=float(route.get("bearingDeg", 300)),
            targetHeadingDeg=float(route.get("bearingDeg", 300)),
            verticalRateFpm=0.0,
            speed=Speed(indicatedAirspeedKt=15.0, groundSpeedKt=15.0),
            targetSpeedKt=15.0,
            assignedRunway="30R",
            priority=Priority(level=PriorityLevel.NORMAL, reasonCodes=[]),
            capability=Capability(lvpApproach=LvpApproach.CAT_IIIB, rvsm=True, autoland=True),
            fuel=Fuel(
                totalKg=45000,
                finalReserveKg=2800,
                alternateFuelKg=4200,
                holdingFuelFlowKgH=5500,
                enduranceMin=420.0
            ),
            assignedControllerId="CTRL-TWR-01",
            assignedStand=None,
            squawk=f"{random.randint(1000, 7700):04d}",
            icao24=f"89{random.randint(1000, 9999):04x}",
            observedAtUtc=state.get_sim_time_iso(),
            dataFreshnessSec=0.0,
            provenance=Provenance.SIMULATED
        )
        state.aircraft[callsign] = dep_ac
        cls._timers[callsign] = 0.0
        cls._last_dep_spawn_sim_sec = state.sim_time_sec
        state.log_event("GROUND", f"{callsign} (outbound to {dest}) pushed back, taxiing to RWY 30R.")

    @classmethod
    def _find_free_stand(cls, wake: str) -> Optional[str]:
        """Finds an appropriate FREE stand matching aircraft wake/size category."""
        target_size = "SUPER" if wake == "SUPER" else ("WIDE" if wake == "HEAVY" else "NARROW")
        # Direct match first
        for sid, s in state.stands.items():
            if s.get("status") == "FREE" and s.get("size") == target_size and sid not in ["B12", "B14"]:
                return sid
        # Wider fallback if narrow/medium
        if target_size == "NARROW":
            for sid, s in state.stands.items():
                if s.get("status") == "FREE" and sid not in ["B12", "B14"]:
                    return sid
        elif target_size == "WIDE":
            for sid, s in state.stands.items():
                if s.get("status") == "FREE" and s.get("size") == "SUPER" and sid not in ["B12", "B14"]:
                    return sid
        return None

    @classmethod
    def _cleanup_distant_aircraft(cls, policy: Dict[str, Any]):
        """Despawns departed or diverted aircraft that have cleared OMDB airspace (> 38 NM)."""
        persistent_flights = set(policy.get("persistentDemoFlights", ["UAE231", "FDB512", "THY762", "BAW107", "IGO1433", "SIA317"]))

        to_remove = []
        for callsign, ac in state.aircraft.items():
            if callsign in persistent_flights:
                continue

            if ac.flightPhase == FlightPhase.DEPARTURE and ac.position.distanceToThresholdNm >= policy.get("departureRemovalNm", 38.0):
                to_remove.append(callsign)
            elif ac.flightPhase == FlightPhase.DIVERTING and ac.position.distanceToThresholdNm >= policy.get("divertRemovalNm", 35.0):
                to_remove.append(callsign)

        for callsign in to_remove:
            if callsign in state.aircraft:
                del state.aircraft[callsign]
            cls._timers.pop(callsign, None)
            cls._dwell_targets.pop(callsign, None)
            state.log_event("RADAR", f"{callsign} handed off to Sector Control / Alternate; cleared from OMDB active traffic.")

