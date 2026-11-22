"""Repeatable, simplified multi-airport arrival simulation, isolated from live data.

Airport throughput, parking and fuel numbers are DEMO ASSUMPTIONS. This is not
an aerodrome/approach procedure or a certified flight dynamics model.
"""

import copy
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from .engines import BuiltinEngine, BlueSkyEngine, distance_nm, bearing

DATA = Path(__file__).resolve().parents[2] / "data"
# Arrival-only demonstration capacity; NOT published airport operating limits.
ASSUMPTIONS = {
    "OMDB": (42, 12),
    "OMAA": (32, 10),
    "OMSJ": (22, 8),
    "OMDW": (20, 8),
    "OMRK": (12, 6),
    "OMFJ": (10, 6),
    "OMAL": (10, 6),
}
SCENARIOS = ("normal", "fog", "rain", "gusts", "runway_closure")
PHASES = {"before": 0, "during": 600, "after": 1800}
EPOCH = datetime(2026, 11, 9, 0, 0, tzinfo=timezone.utc).timestamp()


class SimulationLab:
    def __init__(self):
        self.engine = BuiltinEngine()
        self.reset()

    def reset(
        self,
        seed=42,
        scenario="normal",
        airport="OMDB",
        phase="before",
        random_events=False,
        engine="builtin",
    ):
        if (
            scenario not in SCENARIOS
            or airport not in ASSUMPTIONS
            or phase not in PHASES
        ):
            raise ValueError("Unknown scenario, airport or phase")
        if engine not in ("builtin", "bluesky"):
            raise ValueError("Unknown movement engine")
        # Initialize dependency before changing existing simulation state.
        selected_engine = (
            self.engine
            if self.engine.name == engine
            else (BlueSkyEngine() if engine == "bluesky" else BuiltinEngine())
        )
        reference = json.loads((DATA / "ourairports_uae.json").read_text())
        if not set(ASSUMPTIONS).issubset(reference["airports"]):
            raise ValueError(
                "Seven-airport reference data is required; refresh OurAirports cache"
            )
        self.engine = selected_engine
        self.seed, self.scenario, self.focus = seed, scenario, airport
        self.random_events = random_events
        self.rng = random.Random(seed)
        self.time = 0
        self.paused = True
        self.speed = 1
        self.events, self.history = [], []
        self.airports = {}
        self.reference = {
            k: reference.get(k)
            for k in ("source", "retrievedAtUtc", "airportsSha256", "runwaysSha256")
        }
        for icao, (rate, stands) in ASSUMPTIONS.items():
            self.airports[icao] = {
                **copy.deepcopy(reference["airports"][icao]),
                "arrivalRatePerHour": rate,
                "standCapacity": stands,
                "occupied": 0,
                "lastArrivalSec": -10000,
                "blockedUntil": 0,
                "releases": [],
                "weather": "CLEAR",
                "visibilityM": 10000,
                "windKt": 5,
                "gustKt": 5,
                "capacityFactor": 1.0,
            }
        self.flights = {}
        # Use reference airline callsign prefixes; flight numbers are generated
        # demo identifiers, NOT claims of an actual scheduled flight.
        prefixes = ("UAE", "ETD", "ABY", "FDB", "QTR", "IGO", "THY")
        for airport_index, (icao, ap) in enumerate(self.airports.items()):
            for j in range(6):
                ident = f"{prefixes[airport_index]}{100+airport_index*10+j}"
                angle = self.rng.uniform(0, math.tau)
                dist = 12 + j * 7 + self.rng.uniform(0, 4)
                lat = ap["lat"] + dist * math.cos(angle) / 60
                lon = ap["lon"] + dist * math.sin(angle) / (
                    60 * math.cos(math.radians(ap["lat"]))
                )
                self.flights[ident] = {
                    "id": ident,
                    "aircraftType": "A320",
                    "destination": icao,
                    "originalDestination": icao,
                    "lat": lat,
                    "lon": lon,
                    "altitudeFt": 8000.0,
                    "speedKt": 210.0,
                    "headingDeg": bearing(lat, lon, ap["lat"], ap["lon"]),
                    "phase": "ARRIVAL",
                    "fuelKg": self.rng.uniform(5000, 7000),
                    "fuelFlowKgH": 2400.0,
                    "reserveKg": 1600.0,
                    "holdingSec": 0,
                    "diverted": False,
                    "identityStatus": "GENERATED_DEMO_IDENTIFIER",
                    "provenance": "SIMULATED",
                }
        self.engine.reset(list(self.flights.values()))
        self._log(
            "RESET",
            "Loaded seeded UAE arrival simulation; all operational values are demo assumptions",
        )
        self._record()
        # Replay the entire state, not just the weather, to a phase checkpoint.
        self.advance(PHASES[phase])
        return self.snapshot()

    def _log(self, kind, message):
        self.events.append({"timeSec": self.time, "type": kind, "message": message})
        self.events = self.events[-500:]

    def _weather(self):
        for icao, ap in self.airports.items():
            previous = ap["weather"]
            level = (
                0
                if self.time < 300 or self.time >= 1800
                else (1 if self.time < 600 or self.time >= 1200 else 2)
            )
            if icao != self.focus or self.scenario == "normal":
                level = 0
            ap.update(
                weather="CLEAR",
                visibilityM=10000,
                windKt=5,
                gustKt=5,
                capacityFactor=1.0,
            )
            if level:
                if self.scenario == "fog":
                    ap.update(
                        weather="FOG" if level == 1 else "DENSE_FOG",
                        visibilityM=1200 if level == 1 else 350,
                        capacityFactor=0.65 if level == 1 else 0.25,
                    )
                elif self.scenario == "rain":
                    ap.update(
                        weather="RAIN" if level == 1 else "HEAVY_RAIN",
                        visibilityM=5000 if level == 1 else 2000,
                        capacityFactor=0.8 if level == 1 else 0.4,
                    )
                elif self.scenario == "gusts":
                    ap.update(
                        weather="GUSTS",
                        windKt=18 if level == 1 else 28,
                        gustKt=26 if level == 1 else 42,
                        capacityFactor=0.75 if level == 1 else 0.35,
                    )
                elif self.scenario == "runway_closure":
                    ap.update(
                        weather="RUNWAY_RESTRICTED",
                        capacityFactor=0.5 if level == 1 else 0,
                    )
            if previous != ap["weather"]:
                self._log("WEATHER", f"{icao}: {previous} → {ap['weather']}")

    def advance(self, seconds):
        if not isinstance(seconds, int) or not 0 <= seconds <= 3600:
            raise ValueError("Advance must be an integer between 0 and 3600 seconds")
        if self.time + seconds > 14400:
            raise ValueError(
                "Demo run limit is four simulated hours; reset to continue"
            )
        for _ in range(seconds):
            self.time += 1
            self._weather()
            if self.random_events and self.time % 120 == 0 and self.rng.random() < 0.45:
                icao = self.rng.choice(sorted(self.airports))
                self.airports[icao]["blockedUntil"] = self.time + 180
                self._log(
                    "RANDOM_EVENT",
                    f"{icao}: one demo parking stand unavailable for 180 seconds",
                )
            for ap in self.airports.values():
                ap["releases"] = [t for t in ap["releases"] if t > self.time]
                ap["occupied"] = len(ap["releases"])
            active = [f for f in self.flights.values() if f["phase"] != "AT_STAND"]
            for f in active:
                f["fuelKg"] = max(0, f["fuelKg"] - f["fuelFlowKgH"] / 3600)
                ap = self.airports[f["destination"]]
                dist = distance_nm(f["lat"], f["lon"], ap["lat"], ap["lon"])
                if f["phase"] == "HOLDING":
                    f["holdingSec"] += 1
                if dist < 3 or f["phase"] == "HOLDING":
                    capacity = ap["arrivalRatePerHour"] * ap["capacityFactor"]
                    stand_limit = ap["standCapacity"] - (
                        1 if ap["blockedUntil"] > self.time else 0
                    )
                    if (
                        capacity > 0
                        and self.time - ap["lastArrivalSec"] >= 3600 / capacity
                        and ap["occupied"] < stand_limit
                    ):
                        f.update(
                            phase="AT_STAND",
                            lat=ap["lat"],
                            lon=ap["lon"],
                            altitudeFt=ap["elevationFt"],
                            speedKt=0,
                        )
                        ap["lastArrivalSec"] = self.time
                        ap["releases"].append(self.time + 1800)
                        ap["occupied"] += 1
                        self.engine.retire(f)
                        self._log(
                            "ARRIVAL",
                            f"{f['id']} parked at {ap['icao']} (abstract arrival service)",
                        )
                        continue
                    f["phase"] = "HOLDING"
                self.engine.move(f, 1, ap)
            self.engine.advance(1)
            for f in active:
                if f["phase"] != "AT_STAND":
                    self.engine.sync(f)
            if self.time % 10 == 0:
                self._record()
        return self.snapshot()

    def _record(self):
        for f in self.flights.values():
            self.history.append(
                {**copy.deepcopy(f), "timestamp": int(EPOCH + self.time)}
            )
        self.history = self.history[-70000:]

    def recommendations(self):
        result = []
        for f in self.flights.values():
            if f["phase"] != "HOLDING" or f["holdingSec"] < 60:
                continue
            alternatives = []
            for icao, ap in self.airports.items():
                if icao == f["destination"] or ap["capacityFactor"] < 0.6:
                    continue
                inbound = sum(
                    a["destination"] == icao and a["phase"] != "AT_STAND"
                    for a in self.flights.values()
                )
                available = (
                    ap["standCapacity"]
                    - ap["occupied"]
                    - inbound
                    - (1 if ap["blockedUntil"] > self.time else 0)
                )
                dist = distance_nm(f["lat"], f["lon"], ap["lat"], ap["lon"])
                minutes = dist / max(f["speedKt"], 1) * 60 + 10
                required = minutes / 60 * f["fuelFlowKgH"] + f["reserveKg"]
                if available > 0 and f["fuelKg"] > required:
                    alternatives.append((minutes, icao, available))
            if alternatives:
                minutes, icao, available = min(alternatives)
                result.append(
                    {
                        "flightId": f["id"],
                        "alternate": icao,
                        "travelAndBufferMin": round(minutes, 1),
                        "uncommittedStands": available,
                        "reason": f"Holding {f['holdingSec']} s; alternate has modeled weather, parking and fuel margin",
                        "isClearance": False,
                        "limitations": "Demo screening only; aircraft eligibility, airspace and operator approval are not modeled",
                    }
                )
        return result

    def divert(self, flight_id, alternate):
        # Revalidate at approval; earlier proposals can become stale.
        if not any(
            r["flightId"] == flight_id and r["alternate"] == alternate
            for r in self.recommendations()
        ):
            raise ValueError(
                "Diversion proposal is stale or infeasible in the current demo state"
            )
        f = self.flights[flight_id]
        f.update(destination=alternate, phase="DIVERTING", diverted=True)
        self._log(
            "CONTROLLER_APPROVAL",
            f"{flight_id}: simulated diversion approved to {alternate}",
        )
        return self.snapshot()

    def snapshot(self):
        return {
            "schemaVersion": "1.0",
            "mode": "SIMULATION_LAB",
            "timeSec": self.time,
            "seed": self.seed,
            "scenario": self.scenario,
            "focusAirport": self.focus,
            "paused": self.paused,
            "speed": self.speed,
            "randomEvents": self.random_events,
            "engine": {"name": self.engine.name, "version": self.engine.version},
            "reference": self.reference,
            "airports": copy.deepcopy(list(self.airports.values())),
            "flights": copy.deepcopy(list(self.flights.values())),
            "recommendations": self.recommendations(),
            "events": copy.deepcopy(self.events[-30:]),
            "metrics": {
                "arrived": sum(f["phase"] == "AT_STAND" for f in self.flights.values()),
                "holdingMinutes": round(
                    sum(f["holdingSec"] for f in self.flights.values()) / 60, 2
                ),
                "diverted": sum(f["diverted"] for f in self.flights.values()),
            },
            "disclaimer": "SIMULATED ARRIVALS · generated flight identifiers · capacities/fuel are demo assumptions · not operational guidance",
        }
