import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.state import state
from app.models import (
    EventEnvelope,
    AircraftStatePayload,
    WeatherPayload,
    CommandIssuedPayload,
    CommandStatusPayload,
    StandUpdatedPayload,
    AdvisoryPayload,
    SuggestionItem,
    PilotResponse,
    InstructionType,
    ErrorPayload,
    ReportAckPayload
)
from app.simulator import Simulator
from app.weather import WeatherManager
from app.command_manager import CommandManager
from app.suggestion import SuggestionEngine
from app.ai import ask_ai

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("HoneyB_GroundHub")

# Client connection tracker
class ConnectionManager:
    def __init__(self):
        # ws -> dict(role=..., aircraftId=..., token=...)
        self.active_connections: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, role: str, aircraft_id: Optional[str] = None, token: Optional[str] = None):
        await websocket.accept()
        self.active_connections[websocket] = {
            "role": role.lower(),
            "aircraftId": aircraft_id,
            "token": token
        }
        logger.info(f"Connected: role={role}, aircraftId={aircraft_id}, active={len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            info = self.active_connections.pop(websocket)
            logger.info(f"Disconnected: {info.get('role')} / {info.get('aircraftId')}")

    async def broadcast_event(self, envelope: EventEnvelope):
        dead_sockets = []
        msg_json = envelope.model_dump_json()

        for ws, info in self.active_connections.items():
            role = info["role"]
            client_ac = info.get("aircraftId")

            # Route based on role
            if role == "pilot":
                # Pilot only gets events for their aircraft OR airport-wide (aircraftId is None)
                if envelope.aircraftId is not None and envelope.aircraftId != client_ac:
                    continue

            try:
                await ws.send_text(msg_json)
            except Exception:
                dead_sockets.append(ws)

        for ws in dead_sockets:
            self.disconnect(ws)

    async def send_to_socket(self, ws: WebSocket, envelope: EventEnvelope):
        try:
            await ws.send_text(envelope.model_dump_json())
        except Exception:
            self.disconnect(ws)

manager = ConnectionManager()

# Background simulation runner
async def simulation_loop():
    while True:
        try:
            Simulator.tick()

            # Broadcast any command status changes from simulator (EXECUTING, DONE)
            while state.pending_status_events:
                st_ev = state.pending_status_events.pop(0)
                st_env = state.create_envelope("command.status", st_ev["payload"], aircraft_id=st_ev["aircraftId"])
                await manager.broadcast_event(st_env)

            # Broadcast weather if active
            if state.weather:
                wx_env = state.create_envelope("weather.updated", state.weather, aircraft_id=None)
                await manager.broadcast_event(wx_env)

            # Broadcast aircraft states
            for ac_id, ac in state.aircraft.items():
                ac_env = state.create_envelope("aircraft.state", ac, aircraft_id=ac_id)
                await manager.broadcast_event(ac_env)

            # Broadcast active suggestions and claims to controllers/wall
            controller_update = {
                "suggestions": [s.model_dump() for s in state.suggestions.values()],
                "claims": state.claims,
                "eventLog": state.event_log[:20],
                "commands": [c.model_dump() for c in list(state.commands.values())[-15:]],
                "stands": list(state.stands.values()),
                "metrics": {
                    "totalFlights": len(state.aircraft),
                    "atRiskCount": sum(1 for a in state.aircraft.values() if a.priority.level in ["MINIMUM_FUEL", "EMERGENCY", "MEDICAL"]),
                    "delayedMinutes": round(max(0, (state.sim_time_sec / 60.0) * 1.5), 1),
                    "fcfsBaselineDelayMin": round(max(0, (state.sim_time_sec / 60.0) * 2.8), 1),
                    "conflictsAvoided": 4 if state.weather and state.weather.lvp.active else 1
                }
            }
            ctrl_env = state.create_envelope("ground.metrics", controller_update, aircraft_id=None)
            await manager.broadcast_event(ctrl_env)

        except Exception as e:
            logger.error(f"Error in simulation loop: {e}", exc_info=True)

        await asyncio.sleep(1.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: start background simulator task
    sim_task = asyncio.create_task(simulation_loop())
    logger.info("Honey B Ground Control Hub started on 0.0.0.0:8000")
    yield
    # Shutdown
    sim_task.cancel()

app = FastAPI(title="Honey B Ground Control Hub", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper to build state.snapshot
def build_snapshot(role: str, aircraft_id: Optional[str] = None) -> Dict[str, Any]:
    role = role.lower()
    if role == "pilot" and aircraft_id:
        ac = state.aircraft.get(aircraft_id)
        ac_data = ac.model_dump() if ac else None
        stand_data = state.stands.get(ac.assignedStand) if ac and ac.assignedStand else None
        cmds = [c.model_dump() for c in state.commands.values() if c.aircraftId == aircraft_id][-10:]
        advisories = [a.model_dump() for a in state.advisories.get(aircraft_id, [])]
        return {
            "serverTime": state.get_sim_time_iso(),
            "simSpeed": state.sim_speed,
            "aircraft": ac_data,
            "weather": state.weather.model_dump() if state.weather else None,
            "commands": cmds,
            "stand": {
                "standId": stand_data["id"] if stand_data else "B14",
                "terminal": stand_data["terminal"] if stand_data else "Terminal 3",
                "provenance": "SIMULATED"
            },
            "advisories": advisories
        }
    else:
        # Controller / Wall receives complete operations snapshot
        return {
            "serverTime": state.get_sim_time_iso(),
            "simSpeed": state.sim_speed,
            "aircraft": [a.model_dump() for a in state.aircraft.values()],
            "weather": state.weather.model_dump() if state.weather else None,
            "commands": [c.model_dump() for c in state.commands.values()][-25:],
            "stands": list(state.stands.values()),
            "controllers": list(state.controllers.values()),
            "claims": state.claims,
            "suggestions": [s.model_dump() for s in state.suggestions.values()],
            "advisories": [a.model_dump() for alist in state.advisories.values() for a in alist],
            "eventLog": state.event_log[:50]
        }

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    role: str = Query("controller"),
    aircraftId: Optional[str] = Query(None),
    token: Optional[str] = Query(None)
):
    # Token check for pilot role
    if role.lower() == "pilot":
        if not aircraftId:
            await websocket.close(code=4001, reason="aircraftId required for pilot role")
            return
        expected_token = f"demo-{aircraftId}"
        if token != expected_token:
            # We can accept socket briefly to return error event per spec
            await websocket.accept()
            err_env = state.create_envelope("error", ErrorPayload(
                code="UNAUTHORIZED_AIRCRAFT",
                message=f"Invalid token '{token}'. Expected '{expected_token}' for {aircraftId}."
            ), aircraft_id=aircraftId)
            await websocket.send_text(err_env.model_dump_json())
            await websocket.close(code=4003, reason="UNAUTHORIZED_AIRCRAFT")
            return

    await manager.connect(websocket, role, aircraftId, token)

    # Immediately deliver state.snapshot upon connect/reconnect per spec
    snapshot_payload = build_snapshot(role, aircraftId)
    snap_env = state.create_envelope("state.snapshot", snapshot_payload, aircraft_id=aircraftId)
    await manager.send_to_socket(websocket, snap_env)

    try:
        while True:
            text = await websocket.receive_text()
            data = json.loads(text)
            msg_type = data.get("type")
            msg_payload = data.get("payload", {})
            msg_aid = data.get("aircraftId") or aircraftId

            if msg_type == "client.subscribe":
                # Fresh snapshot on subscribe
                sub_role = msg_payload.get("role", role)
                snap = build_snapshot(sub_role, msg_aid)
                snap_env = state.create_envelope("state.snapshot", snap, aircraft_id=msg_aid)
                await manager.send_to_socket(websocket, snap_env)

            elif msg_type == "command.response":
                cid = msg_payload.get("commandId")
                resp_str = msg_payload.get("response")
                reason_txt = msg_payload.get("reasonText")
                try:
                    resp_enum = PilotResponse(resp_str)
                    status_payload, err = CommandManager.handle_pilot_response(cid, msg_aid, resp_enum, reason_txt)
                    if err:
                        err_env = state.create_envelope("error", err, aircraft_id=msg_aid)
                        await manager.send_to_socket(websocket, err_env)
                    elif status_payload:
                        st_env = state.create_envelope("command.status", status_payload, aircraft_id=msg_aid)
                        await manager.broadcast_event(st_env)
                except ValueError:
                    err_env = state.create_envelope("error", ErrorPayload(code="INVALID_RESPONSE", message=f"Invalid response {resp_str}"), aircraft_id=msg_aid)
                    await manager.send_to_socket(websocket, err_env)

            elif msg_type == "aircraft.report":
                rpt_id = msg_payload.get("reportId", "RPT-001")
                rpt_type = msg_payload.get("reportType")
                state.log_event("PILOT_REPORT", f"Report {rpt_type} from {msg_aid}: {msg_payload.get('text', '')}")

                # Update fuel if reported
                ac = state.aircraft.get(msg_aid)
                if ac and msg_payload.get("fuelRemainingKg"):
                    ac.fuel.totalKg = float(msg_payload["fuelRemainingKg"])
                    ac.fuel.provenance = "PILOT_REPORTED"
                if ac and msg_payload.get("fuelEnduranceMin"):
                    ac.fuel.enduranceMin = float(msg_payload["fuelEnduranceMin"])

                # Send report.ack
                ack_env = state.create_envelope("report.ack", ReportAckPayload(reportId=rpt_id, accepted=True, note="Report integrated into state"), aircraft_id=msg_aid)
                await manager.send_to_socket(websocket, ack_env)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client error: {e}")
        manager.disconnect(websocket)

# ----------------- Demo HTTP Endpoints -----------------

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "simTime": state.get_sim_time_iso(),
        "revision": state.revision,
        "aircraftCount": len(state.aircraft),
        "activeConnections": len(manager.active_connections)
    }

@app.post("/demo/reset")
async def demo_reset():
    state.load_initial_data()
    # Broadcast reset snapshot to all
    for ws, info in manager.active_connections.items():
        snap = build_snapshot(info["role"], info.get("aircraftId"))
        snap_env = state.create_envelope("state.snapshot", snap, aircraft_id=info.get("aircraftId"))
        await manager.send_to_socket(ws, snap_env)
    return {"status": "reset_complete", "simTime": state.get_sim_time_iso()}

class FogRequest(BaseModel):
    phase: str

@app.post("/demo/fog")
async def demo_fog(req: FogRequest):
    wx = WeatherManager.set_phase(req.phase)
    if not wx:
        raise HTTPException(status_code=400, detail=f"Unknown weather phase: {req.phase}")
    wx_env = state.create_envelope("weather.updated", wx, aircraft_id=None)
    await manager.broadcast_event(wx_env)
    return {"status": "ok", "phase": req.phase, "visibilityM": wx.visibilityM, "lvp": wx.lvp.model_dump()}

class CommandRequest(BaseModel):
    aircraftId: str
    instructionType: InstructionType
    controllerId: Optional[str] = "CTRL-ARR-01"
    targetAltitudeFt: Optional[float] = None
    targetHeadingDeg: Optional[float] = None
    targetSpeedKt: Optional[float] = None
    fix: Optional[str] = None
    holdAltitudeFt: Optional[float] = None
    newRunway: Optional[str] = None
    newApproach: Optional[str] = None
    approach: Optional[str] = None
    alternateIcao: Optional[str] = None
    displayText: Optional[str] = None
    relatedSuggestionId: Optional[str] = None

@app.post("/demo/command")
async def demo_command(req: CommandRequest):
    text = req.displayText
    if not text:
        if req.instructionType == InstructionType.ALTITUDE:
            text = f"Descend and maintain {int(req.targetAltitudeFt or 3000)} feet"
        elif req.instructionType == InstructionType.SPEED:
            text = f"Reduce speed to {int(req.targetSpeedKt or 180)} knots"
        elif req.instructionType == InstructionType.HEADING:
            text = f"Turn heading {int(req.targetHeadingDeg or 300)}"
        elif req.instructionType == InstructionType.HOLD:
            text = f"Hold at {req.fix or 'DXB VOR'}, maintain {int(req.holdAltitudeFt or 4000)} ft"
        elif req.instructionType == InstructionType.DIVERT:
            text = f"Divert to {req.alternateIcao or 'OMSJ'}"
        else:
            text = f"Execute {req.instructionType}"

    cmd, err = CommandManager.issue_command(
        aircraft_id=req.aircraftId,
        controller_id=req.controllerId or "CTRL-ARR-01",
        instruction_type=req.instructionType,
        displayText=text,
        params=req.model_dump(exclude_unset=True),
        related_suggestion_id=req.relatedSuggestionId,
        bypass_controller_check=True
    )
    if err:
        raise HTTPException(status_code=400, detail=err.message)

    # Broadcast command.issued
    cmd_env = state.create_envelope("command.issued", cmd, aircraft_id=req.aircraftId)
    await manager.broadcast_event(cmd_env)
    return cmd.model_dump()

class SupersedeRequest(BaseModel):
    commandId: str
    newCommandId: Optional[str] = None

@app.post("/demo/supersede")
async def demo_supersede(req: SupersedeRequest):
    st = CommandManager.supersede_command(req.commandId, req.newCommandId)
    if not st:
        raise HTTPException(status_code=404, detail="Command not found")
    st_env = state.create_envelope("command.status", st, aircraft_id=None)
    await manager.broadcast_event(st_env)
    return st.model_dump()

class StandRequest(BaseModel):
    aircraftId: str
    standId: str

@app.post("/demo/stand")
async def demo_stand(req: StandRequest):
    ac = state.aircraft.get(req.aircraftId)
    if not ac:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    prev_stand = ac.assignedStand
    ac.assignedStand = req.standId

    stand_info = state.stands.get(req.standId, {"terminal": "Terminal 3, Concourse B"})
    payload = StandUpdatedPayload(
        standId=req.standId,
        terminal=stand_info.get("terminal", "Terminal 3"),
        previousStandId=prev_stand,
        reason="OPERATIONAL_REASSIGNMENT",
        effectiveFrom=state.get_sim_time_iso(),
        isClearance=False,
        provenance="SIMULATED"
    )
    st_env = state.create_envelope("stand.updated", payload, aircraft_id=req.aircraftId)
    await manager.broadcast_event(st_env)
    return payload.model_dump()

@app.get("/demo/aircraft")
def demo_aircraft():
    return [
        {
            "aircraftId": a.callsign,
            "flightPhase": a.flightPhase,
            "status": a.status,
            "assignedRunway": a.assignedRunway,
            "altitudeFt": a.altitudeFt,
            "fuelKg": a.fuel.totalKg,
            "enduranceMin": round(a.fuel.enduranceMin),
            "priority": a.priority.level,
            "controller": a.assignedControllerId
        }
        for a in state.aircraft.values()
    ]

class SpeedRequest(BaseModel):
    speed: float

@app.post("/demo/speed")
def demo_speed(req: SpeedRequest):
    state.sim_speed = max(0.25, min(10.0, req.speed))
    return {"status": "ok", "simSpeed": state.sim_speed}

class ControllerReassignRequest(BaseModel):
    aircraftId: str
    controllerId: str

@app.post("/demo/reassign-controller")
def demo_reassign_controller(req: ControllerReassignRequest):
    ac = state.aircraft.get(req.aircraftId)
    if not ac:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    ac.assignedControllerId = req.controllerId
    state.log_event("ROSTER", f"Reassigned {req.aircraftId} control to {req.controllerId}.")
    return {"status": "ok", "aircraftId": req.aircraftId, "controllerId": req.controllerId}

class ChatRequest(BaseModel):
    prompt: str

@app.post("/api/chat")
def api_chat(req: ChatRequest):
    reply = ask_ai(req.prompt)
    return {"reply": reply}
