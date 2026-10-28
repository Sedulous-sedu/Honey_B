import json
import os
import sys

def generate():
    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../shared/fixtures"))
    os.makedirs(fixtures_dir, exist_ok=True)

    # 1. state.snapshot.UAE231.json
    snapshot = {
        "type": "state.snapshot",
        "version": "v1",
        "eventId": "evt-148",
        "revision": 148,
        "timestamp": "2026-10-28T03:09:58Z",
        "aircraftId": "UAE231",
        "payload": {
            "serverTime": "2026-10-28T03:09:58Z",
            "simSpeed": 1.0,
            "aircraft": {
                "callsign": "UAE231",
                "aircraftType": "B77W",
                "wakeCategory": "HEAVY",
                "origin": "EGLL",
                "destination": "OMDB",
                "flightPhase": "ARRIVAL",
                "status": "NORMAL",
                "position": { "lat": 25.1502, "lon": 55.5011, "distanceToThresholdNm": 14.2 },
                "altitudeFt": 4000,
                "headingDeg": 300,
                "verticalRateFpm": -700,
                "speed": { "indicatedAirspeedKt": 235, "groundSpeedKt": 242, "airspeedType": "IAS_APPROX" },
                "assignedRunway": "30L",
                "approach": "ILS 30L",
                "landingSequence": 3,
                "etaUtc": "2026-10-28T03:18:00Z",
                "fuel": {
                    "totalKg": 11200,
                    "enduranceMin": 116,
                    "holdingFuelFlowKgH": 5800,
                    "finalReserveKg": 2900,
                    "provenance": "SIMULATED"
                },
                "capability": { "lvpApproach": "CAT_IIIB" },
                "assignedControllerId": "CTRL-ARR-01",
                "priority": { "level": "NORMAL", "reasonCodes": [], "provenance": "RULE_BASED" },
                "provenance": "SIMULATED"
            },
            "weather": {
                "airport": "OMDB",
                "observedAt": "2026-10-28T03:09:58Z",
                "rawMetar": "OMDB 280300Z 32005KT 6000 NSC 23/21 Q1013 NOSIG",
                "visibilityM": 6000,
                "rvr": [
                    { "runway": "30L", "valueM": 2000, "trend": "NO_CHANGE" },
                    { "runway": "30R", "valueM": 2000, "trend": "NO_CHANGE" }
                ],
                "ceilingFt": 25000,
                "wind": { "directionDeg": 320, "speedKt": 5 },
                "temperatureC": 23,
                "qnhHpa": 1013,
                "flightCategory": "VFR",
                "lvp": { "active": False, "phase": "NONE" },
                "alerts": [],
                "provenance": "SIMULATED"
            },
            "commands": [],
            "stand": {
                "standId": "B14",
                "terminal": "Terminal 3, Concourse B",
                "provenance": "SIMULATED"
            },
            "advisories": []
        }
    }
    with open(os.path.join(fixtures_dir, "state.snapshot.UAE231.json"), "w") as f:
        json.dump(snapshot, f, indent=2)

    # 2. aircraft.state.sequence.UAE231.json (~30 ticks)
    seq = []
    base_dist = 14.2
    base_alt = 4000.0
    for tick in range(30):
        dist = max(0.5, base_dist - tick * 0.065)
        alt = max(1500.0, base_alt - tick * 11.6)
        seq.append({
            "type": "aircraft.state",
            "version": "v1",
            "eventId": f"evt-uae231-{tick+1}",
            "revision": 150 + tick,
            "timestamp": f"2026-10-28T03:10:{tick:02d}Z",
            "aircraftId": "UAE231",
            "payload": {
                "callsign": "UAE231",
                "aircraftType": "B77W",
                "wakeCategory": "HEAVY",
                "origin": "EGLL",
                "destination": "OMDB",
                "flightPhase": "APPROACH" if dist < 10 else "ARRIVAL",
                "status": "NORMAL",
                "position": { "lat": round(25.1502 + tick*0.002, 4), "lon": round(55.5011 - tick*0.003, 4), "distanceToThresholdNm": round(dist, 1) },
                "altitudeFt": round(alt),
                "headingDeg": 300,
                "verticalRateFpm": -700,
                "speed": { "indicatedAirspeedKt": 235 - (tick//3)*5, "groundSpeedKt": 242 - (tick//3)*5, "airspeedType": "IAS_APPROX" },
                "assignedRunway": "30L",
                "approach": "ILS 30L",
                "landingSequence": 3,
                "etaUtc": "2026-10-28T03:18:00Z",
                "fuel": {
                    "totalKg": 11200 - tick * 2,
                    "enduranceMin": 116,
                    "holdingFuelFlowKgH": 5800,
                    "finalReserveKg": 2900,
                    "provenance": "SIMULATED"
                },
                "capability": { "lvpApproach": "CAT_IIIB" },
                "assignedControllerId": "CTRL-ARR-01",
                "priority": { "level": "NORMAL", "reasonCodes": [], "provenance": "RULE_BASED" },
                "provenance": "SIMULATED"
            }
        })
    with open(os.path.join(fixtures_dir, "aircraft.state.sequence.UAE231.json"), "w") as f:
        json.dump(seq, f, indent=2)

    # 3. weather.updated.sequence.json
    with open(os.path.join(os.path.dirname(__file__), "../data/weather_timeline.json")) as wf:
        wt_raw = json.load(wf)
    weather_seq = [
        {
            "type": "weather.updated",
            "version": "v1",
            "eventId": f"evt-wx-{i+1}",
            "revision": 170 + i,
            "timestamp": item["observedAt"],
            "aircraftId": None,
            "payload": item
        }
        for i, item in enumerate(wt_raw)
    ]
    with open(os.path.join(fixtures_dir, "weather.updated.sequence.json"), "w") as f:
        json.dump(weather_seq, f, indent=2)

    # 4. command.issued.altitude.json
    cmd_alt = {
        "type": "command.issued",
        "version": "v1",
        "eventId": "evt-201",
        "revision": 201,
        "timestamp": "2026-10-28T03:15:20Z",
        "aircraftId": "UAE231",
        "payload": {
            "commandId": "CMD-001",
            "source": "ATC",
            "controllerId": "CTRL-ARR-01",
            "controllerName": "Ahmed",
            "instructionType": "ALTITUDE",
            "targetAltitudeFt": 3000,
            "displayText": "Descend and maintain 3000 feet",
            "allowedResponses": ["WILCO", "UNABLE", "STANDBY"],
            "status": "SENT",
            "issuedAt": "2026-10-28T03:15:20Z",
            "expiresAt": "2026-10-28T03:16:50Z",
            "supersedes": None,
            "relatedSuggestionId": "SUG-014"
        }
    }
    with open(os.path.join(fixtures_dir, "command.issued.altitude.json"), "w") as f:
        json.dump(cmd_alt, f, indent=2)

    # 5. command.issued.hold.json
    cmd_hold = {
        "type": "command.issued",
        "version": "v1",
        "eventId": "evt-205",
        "revision": 205,
        "timestamp": "2026-10-28T03:16:00Z",
        "aircraftId": "UAE231",
        "payload": {
            "commandId": "CMD-002",
            "source": "ATC",
            "controllerId": "CTRL-ARR-01",
            "controllerName": "Ahmed",
            "instructionType": "HOLD",
            "fix": "DXB VOR",
            "holdAltitudeFt": 4000,
            "expectFurtherClearanceUtc": "2026-10-28T03:30:00Z",
            "legTimeMin": 1.0,
            "displayText": "Hold at DXB VOR, maintain 4000, expect further clearance 03:30",
            "allowedResponses": ["WILCO", "UNABLE", "STANDBY"],
            "status": "SENT",
            "issuedAt": "2026-10-28T03:16:00Z",
            "expiresAt": "2026-10-28T03:17:30Z",
            "supersedes": None,
            "relatedSuggestionId": "SUG-019"
        }
    }
    with open(os.path.join(fixtures_dir, "command.issued.hold.json"), "w") as f:
        json.dump(cmd_hold, f, indent=2)

    # 6. command.status.lifecycle.json
    lifecycle = [
        {
            "type": "command.status",
            "version": "v1",
            "eventId": "evt-202",
            "revision": 202,
            "timestamp": "2026-10-28T03:15:26Z",
            "aircraftId": "UAE231",
            "payload": {
                "commandId": "CMD-001",
                "status": "ACKNOWLEDGED",
                "previousStatus": "SENT",
                "response": "WILCO",
                "reason": None,
                "supersededBy": None,
                "changedAt": "2026-10-28T03:15:26Z"
            }
        },
        {
            "type": "command.status",
            "version": "v1",
            "eventId": "evt-203",
            "revision": 203,
            "timestamp": "2026-10-28T03:15:28Z",
            "aircraftId": "UAE231",
            "payload": {
                "commandId": "CMD-001",
                "status": "EXECUTING",
                "previousStatus": "ACKNOWLEDGED",
                "response": "WILCO",
                "reason": None,
                "supersededBy": None,
                "changedAt": "2026-10-28T03:15:28Z"
            }
        },
        {
            "type": "command.status",
            "version": "v1",
            "eventId": "evt-204",
            "revision": 204,
            "timestamp": "2026-10-28T03:16:45Z",
            "aircraftId": "UAE231",
            "payload": {
                "commandId": "CMD-001",
                "status": "DONE",
                "previousStatus": "EXECUTING",
                "response": "WILCO",
                "reason": None,
                "supersededBy": None,
                "changedAt": "2026-10-28T03:16:45Z"
            }
        }
    ]
    with open(os.path.join(fixtures_dir, "command.status.lifecycle.json"), "w") as f:
        json.dump(lifecycle, f, indent=2)

    # 7. command.status.unable.json
    unable = {
        "type": "command.status",
        "version": "v1",
        "eventId": "evt-210",
        "revision": 210,
        "timestamp": "2026-10-28T03:15:30Z",
        "aircraftId": "UAE231",
        "payload": {
            "commandId": "CMD-001",
            "status": "UNABLE",
            "previousStatus": "SENT",
            "response": "UNABLE",
            "reason": "Unable, fuel state",
            "supersededBy": None,
            "changedAt": "2026-10-28T03:15:30Z"
        }
    }
    with open(os.path.join(fixtures_dir, "command.status.unable.json"), "w") as f:
        json.dump(unable, f, indent=2)

    # 8. command.status.superseded.json
    superseded = {
        "type": "command.status",
        "version": "v1",
        "eventId": "evt-211",
        "revision": 211,
        "timestamp": "2026-10-28T03:16:10Z",
        "aircraftId": "UAE231",
        "payload": {
            "commandId": "CMD-001",
            "status": "SUPERSEDED",
            "previousStatus": "SENT",
            "response": None,
            "reason": "Replaced by CMD-002 (Hold DXB VOR)",
            "supersededBy": "CMD-002",
            "changedAt": "2026-10-28T03:16:10Z"
        }
    }
    with open(os.path.join(fixtures_dir, "command.status.superseded.json"), "w") as f:
        json.dump(superseded, f, indent=2)

    # 9. stand.updated.json
    stand_upd = {
        "type": "stand.updated",
        "version": "v1",
        "eventId": "evt-320",
        "revision": 320,
        "timestamp": "2026-10-28T03:22:00Z",
        "aircraftId": "UAE231",
        "payload": {
            "standId": "B14",
            "terminal": "Terminal 3, Concourse B",
            "previousStandId": "B12",
            "reason": "STAND_OCCUPIED_BY_DELAYED_DEPARTURE",
            "effectiveFrom": "2026-10-28T03:22:00Z",
            "isClearance": False,
            "provenance": "SIMULATED"
        }
    }
    with open(os.path.join(fixtures_dir, "stand.updated.json"), "w") as f:
        json.dump(stand_upd, f, indent=2)

    # 10. advisory.updated.json
    advisory_upd = {
        "type": "advisory.updated",
        "version": "v1",
        "eventId": "evt-215",
        "revision": 215,
        "timestamp": "2026-10-28T03:16:00Z",
        "aircraftId": "UAE231",
        "payload": {
            "advisoryId": "ADV-007",
            "source": "HONEY_B_ADVISORY",
            "isInstruction": False,
            "severity": "CAUTION",
            "category": "WEATHER",
            "title": "RVR below your usual limit",
            "summary": "RVR 400 m on 30L. Your approach capability (CAT IIIB) allows landing, expect reduced arrival rate.",
            "reasoning": [
                "RVR 400 m reported on runway 30L",
                "Aircraft capability: CAT IIIB",
                "LVP active, arrival spacing increased"
            ],
            "expiresAt": "2026-10-28T03:31:00Z",
            "provenance": "AI_DERIVED"
        }
    }
    with open(os.path.join(fixtures_dir, "advisory.updated.json"), "w") as f:
        json.dump(advisory_upd, f, indent=2)

    # 11. error.samples.json
    errors = [
        {
            "type": "error",
            "version": "v1",
            "eventId": "evt-err-01",
            "revision": 261,
            "timestamp": "2026-10-28T03:18:06Z",
            "aircraftId": "UAE231",
            "payload": {
                "code": "COMMAND_SUPERSEDED",
                "message": "CMD-001 was replaced by CMD-004 before your response arrived.",
                "relatedEventId": "evt-pilot-22",
                "commandId": "CMD-001"
            }
        },
        {
            "type": "error",
            "version": "v1",
            "eventId": "evt-err-02",
            "revision": 262,
            "timestamp": "2026-10-28T03:18:10Z",
            "aircraftId": "UAE231",
            "payload": {
                "code": "UNAUTHORIZED_AIRCRAFT",
                "message": "Token demo-UAE231 cannot access FDB512.",
                "relatedEventId": "evt-pilot-23",
                "commandId": None
            }
        }
    ]
    with open(os.path.join(fixtures_dir, "error.samples.json"), "w") as f:
        json.dump(errors, f, indent=2)

    print("Generated all fixtures successfully!")

if __name__ == "__main__":
    generate()
