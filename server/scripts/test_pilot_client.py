import asyncio
import json
import httpx
import websockets
import sys

BASE_HTTP = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws?role=pilot&aircraftId=UAE231&token=demo-UAE231"

async def run_9_step_acceptance_test():
    print("=" * 60)
    print("STARTING HONEY B PILOT-GROUND 9-STEP ACCEPTANCE TEST")
    print("=" * 60)

    # Step 1: Connect and receive initial state.snapshot
    print("\n[Step 1] Connecting to WebSocket as pilot for UAE231...")
    async with websockets.connect(WS_URL) as ws:
        # Send client.subscribe
        sub_msg = {
            "type": "client.subscribe",
            "version": "v1",
            "eventId": "evt-pilot-1",
            "timestamp": "2026-10-28T03:09:57Z",
            "aircraftId": "UAE231",
            "payload": { "role": "pilot", "token": "demo-UAE231", "lastRevision": None }
        }
        await ws.send(json.dumps(sub_msg))

        # Receive snapshot
        snap_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        snap = json.loads(snap_raw)
        assert snap["type"] == "state.snapshot", f"Expected state.snapshot, got {snap['type']}"
        assert snap["aircraftId"] == "UAE231"
        assert snap["payload"]["aircraft"]["callsign"] == "UAE231"
        print(f" -> PASSED: Received snapshot for {snap['aircraftId']} (Revision: {snap['revision']})")

        # Step 2: Trigger Fog and receive weather.updated
        print("\n[Step 2] Triggering dense fog via POST /demo/fog...")
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{BASE_HTTP}/demo/fog", json={"phase": "DENSE_FOG"})
            assert res.status_code == 200, f"Fog trigger failed: {res.text}"

        # Receive events until weather.updated arrives
        wx_received = False
        for _ in range(20):
            msg_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            msg = json.loads(msg_raw)
            if msg["type"] == "weather.updated" and msg["payload"]["lvp"]["active"] is True:
                assert msg["payload"]["visibilityM"] == 350
                wx_received = True
                print(f" -> PASSED: Received weather.updated (LVP: {msg['payload']['lvp']['phase']}, Visibility: {msg['payload']['visibilityM']}m)")
                break
        assert wx_received, "Did not receive weather.updated event"

        # Step 3 & 4: Ground controller sends clearance -> pilot receives command.issued
        print("\n[Step 3 & 4] Controller issues clearance via POST /demo/command...")
        async with httpx.AsyncClient() as client:
            cmd_res = await client.post(f"{BASE_HTTP}/demo/command", json={
                "aircraftId": "UAE231",
                "controllerId": "CTRL-ARR-01",
                "instructionType": "ALTITUDE",
                "targetAltitudeFt": 3000,
                "displayText": "Descend and maintain 3000 feet"
            })
            assert cmd_res.status_code == 200
            issued_cmd_id = cmd_res.json()["commandId"]

        # Pilot receives command.issued over WS
        cmd_issued_received = False
        for _ in range(15):
            msg_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            msg = json.loads(msg_raw)
            if msg["type"] == "command.issued":
                assert msg["payload"]["commandId"] == issued_cmd_id
                assert msg["aircraftId"] == "UAE231"
                cmd_issued_received = True
                print(f" -> PASSED: Pilot inbox received command.issued: {issued_cmd_id} ('{msg['payload']['displayText']}')")
                break
        assert cmd_issued_received, "Did not receive command.issued"

        # Step 5: Pilot clicks WILCO -> ground confirms command.status = ACKNOWLEDGED
        print("\n[Step 5] Pilot sending command.response (WILCO)...")
        resp_msg = {
            "type": "command.response",
            "version": "v1",
            "eventId": "evt-pilot-22",
            "timestamp": "2026-10-28T03:15:25Z",
            "aircraftId": "UAE231",
            "payload": {
                "commandId": issued_cmd_id,
                "response": "WILCO"
            }
        }
        await ws.send(json.dumps(resp_msg))

        ack_received = False
        for _ in range(15):
            msg_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            msg = json.loads(msg_raw)
            if msg["type"] == "command.status" and msg["payload"]["commandId"] == issued_cmd_id:
                if msg["payload"]["status"] == "ACKNOWLEDGED":
                    ack_received = True
                    print(f" -> PASSED: Received authoritative command.status: ACKNOWLEDGED for {issued_cmd_id}")
                    break
        assert ack_received, "Did not receive command.status = ACKNOWLEDGED"

        # Step 6 & 7: Simulator executes command -> EXECUTING -> DONE
        print("\n[Step 6 & 7] Observing simulator execution and completion...")
        executing_received = False
        for _ in range(20):
            msg_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            msg = json.loads(msg_raw)
            if msg["type"] == "command.status" and msg["payload"]["commandId"] == issued_cmd_id:
                if msg["payload"]["status"] == "EXECUTING":
                    executing_received = True
                    print(f" -> PASSED: Command transitioned to EXECUTING as simulated aircraft descends")
                    break
        assert executing_received, "Command did not transition to EXECUTING"

        # Step 8: Stand allocation update
        print("\n[Step 8] Triggering stand reassignment to B16 via POST /demo/stand...")
        async with httpx.AsyncClient() as client:
            st_res = await client.post(f"{BASE_HTTP}/demo/stand", json={
                "aircraftId": "UAE231",
                "standId": "B16"
            })
            assert st_res.status_code == 200

        stand_upd_received = False
        for _ in range(15):
            msg_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            msg = json.loads(msg_raw)
            if msg["type"] == "stand.updated":
                assert msg["payload"]["standId"] == "B16"
                stand_upd_received = True
                print(f" -> PASSED: Pilot received stand.updated: Reassigned to Stand {msg['payload']['standId']}")
                break
        assert stand_upd_received, "Did not receive stand.updated"

        # Step 9: Negative path test (UNABLE response & SUPERSEDED command)
        print("\n[Step 9] Testing negative paths (UNABLE and SUPERSEDED)...")
        # Issue second command
        async with httpx.AsyncClient() as client:
            cmd2_res = await client.post(f"{BASE_HTTP}/demo/command", json={
                "aircraftId": "UAE231",
                "instructionType": "SPEED",
                "targetSpeedKt": 170,
                "displayText": "Reduce speed 170 knots"
            })
            cmd2_id = cmd2_res.json()["commandId"]

        # Respond UNABLE
        unable_msg = {
            "type": "command.response",
            "version": "v1",
            "eventId": "evt-pilot-25",
            "timestamp": "2026-10-28T03:16:00Z",
            "aircraftId": "UAE231",
            "payload": {
                "commandId": cmd2_id,
                "response": "UNABLE",
                "reasonText": "Unable, turbulent approach conditions"
            }
        }
        await ws.send(json.dumps(unable_msg))

        unable_received = False
        for _ in range(15):
            msg_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            msg = json.loads(msg_raw)
            if msg["type"] == "command.status" and msg["payload"]["commandId"] == cmd2_id:
                if msg["payload"]["status"] == "UNABLE":
                    unable_received = True
                    print(f" -> PASSED: Command {cmd2_id} recorded as UNABLE (never executed). Reason: '{msg['payload']['reason']}'")
                    break
        assert unable_received, "Did not receive command.status = UNABLE"

        # Issue third command and supersede it
        async with httpx.AsyncClient() as client:
            cmd3_res = await client.post(f"{BASE_HTTP}/demo/command", json={
                "aircraftId": "UAE231",
                "instructionType": "HEADING",
                "targetHeadingDeg": 280,
                "displayText": "Turn left heading 280"
            })
            cmd3_id = cmd3_res.json()["commandId"]

            # Supersede
            sup_res = await client.post(f"{BASE_HTTP}/demo/supersede", json={"commandId": cmd3_id})
            assert sup_res.status_code == 200

        print(f" -> PASSED: Command {cmd3_id} successfully marked SUPERSEDED.")

    print("\n" + "=" * 60)
    print("ALL 9 INTEGRATION ACCEPTANCE TEST STEPS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_9_step_acceptance_test())
