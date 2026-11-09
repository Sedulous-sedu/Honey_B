"""Convert a regional lab snapshot to the existing OMDB pilot/controller contract."""

import copy
import json
import os
from fastapi import HTTPException
from app.models import AircraftStatePayload


def prepare_omdb_handoff(lab, data_dir):
    from app.simulation_lab.engines import distance_nm

    selected = [
        f
        for f in lab.flights.values()
        if f["destination"] == "OMDB" and f["phase"] != "AT_STAND"
    ]
    if not selected:
        raise HTTPException(
            409,
            "No active OMDB arrivals in this checkpoint; reset or choose an earlier checkpoint",
        )
    ap = lab.airports["OMDB"]
    with open(os.path.join(data_dir, "flights.json")) as handle:
        template = json.load(handle)[0]
    aircraft = {}
    for f in selected:
        data = copy.deepcopy(template)
        data.update(
            callsign=f["id"],
            trackId=f["id"],
            aircraftType=f["aircraftType"],
            origin="ZZZZ",
            destination="OMDB",
            flightPhase=f["phase"],
            status="HOLDING" if f["phase"] == "HOLDING" else "NORMAL",
            position={
                "lat": f["lat"],
                "lon": f["lon"],
                "distanceToThresholdNm": distance_nm(
                    f["lat"], f["lon"], ap["lat"], ap["lon"]
                ),
                "distanceReference": "OMDB_ARP",
            },
            altitudeFt=f["altitudeFt"],
            headingDeg=f["headingDeg"],
            targetHeadingDeg=None,
            targetAltitudeFt=None,
            targetSpeedKt=None,
            verticalRateFpm=0,
            speed={
                "indicatedAirspeedKt": f["speedKt"],
                "groundSpeedKt": f["speedKt"],
                "provenance": "SIMULATED",
            },
            fuel={
                "totalKg": f["fuelKg"],
                "enduranceMin": f["fuelKg"] / f["fuelFlowKgH"] * 60,
                "holdingFuelFlowKgH": f["fuelFlowKgH"],
                "finalReserveKg": f["reserveKg"],
                "provenance": "SIMULATED",
            },
            priority={"level": "NORMAL", "provenance": "DEMO_ASSUMPTION"},
            assignedStand=None,
            landingSequence=None,
            etaUtc=None,
            identity=None,
            icao24=None,
            registration=None,
            sourceProvider="Honey B Simulation Lab",
            sourceRecordId=f["id"],
            provenance="SIMULATED",
            predictedDelayMin=f["holdingSec"] / 60,
            currentClearedRoute=None,
        )
        aircraft[f["id"]] = AircraftStatePayload(**data)
    with open(os.path.join(data_dir, "weather_timeline.json")) as handle:
        wx = json.load(handle)[0]
    fog = ap["weather"] in ("FOG", "DENSE_FOG")
    wx.update(
        airport="OMDB",
        name=ap["weather"],
        visibilityM=ap["visibilityM"],
        rawMetar="SIMULATED WEATHER — NOT AN OBSERVATION",
        provenance="SIMULATED",
        alerts=["SIMULATION_LAB_ASSUMPTIONS"],
        rvr=[{"runway": r, "valueM": ap["visibilityM"]} for r in ("30L", "30R")],
        wind={"directionDeg": 300, "speedKt": ap["windKt"]},
        lvp={"active": fog, "phase": "LVP_ACTIVE" if fog else "NONE"},
    )
    return aircraft, wx
