"""Simulation Lab routes. Async handlers serialize mutations on the server loop."""

import os
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from .runtime import SimulationLab
from .interchange import airtrafficsim_zip, bluesky_scenario, BluebirdClient

router = APIRouter()
lab = SimulationLab()


class ResetRequest(BaseModel):
    seed: int = Field(default=42, ge=0, le=2147483647)
    scenario: Literal["normal", "fog", "rain", "gusts", "runway_closure"] = "normal"
    airport: Literal["OMDB", "OMAA", "OMSJ", "OMDW", "OMRK", "OMFJ", "OMAL"] = "OMDB"
    phase: Literal["before", "during", "after"] = "before"
    randomEvents: bool = False
    engine: Literal["builtin", "bluesky"] = "builtin"


class ControlRequest(BaseModel):
    paused: bool = True
    speed: Literal[1, 2, 4, 8] = 1


class StepRequest(BaseModel):
    seconds: int = Field(default=60, ge=1, le=3600, strict=True)


class DiversionRequest(BaseModel):
    flightId: str = Field(pattern=r"^[A-Z0-9]{1,12}$")
    alternate: Literal["OMDB", "OMAA", "OMSJ", "OMDW", "OMRK", "OMFJ", "OMAL"]


@router.get("/simulation-lab")
async def lab_page():
    return FileResponse(
        Path(__file__).resolve().parents[2] / "static" / "simulation-lab.html"
    )


@router.get("/api/simulation-lab")
async def snapshot():
    return lab.snapshot()


@router.post("/api/simulation-lab/reset")
async def reset(req: ResetRequest):
    try:
        return lab.reset(
            req.seed, req.scenario, req.airport, req.phase, req.randomEvents, req.engine
        )
    except (ImportError, RuntimeError) as exc:
        raise HTTPException(503, f"Movement engine unavailable: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/api/simulation-lab/control")
async def control(req: ControlRequest):
    lab.paused, lab.speed = req.paused, req.speed
    return lab.snapshot()


@router.post("/api/simulation-lab/step")
async def step(req: StepRequest):
    if not lab.paused:
        raise HTTPException(409, "Pause the lab before manually stepping")
    try:
        return lab.advance(req.seconds)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/api/simulation-lab/divert")
async def divert(req: DiversionRequest):
    try:
        return lab.divert(req.flightId, req.alternate)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/api/simulation-lab/export/airtrafficsim")
async def export_airtrafficsim():
    return Response(
        airtrafficsim_zip(
            lab.history,
            {
                "source": "Honey B SIMULATED ARRIVALS",
                "reference": lab.reference,
                "engine": lab.engine.name,
                "seed": lab.seed,
                "scenario": lab.scenario,
                "sampleIntervalSec": 10,
            },
        ),
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=honeyb_airtrafficsim_replay.zip"
        },
    )


@router.get("/api/simulation-lab/export/bluesky")
async def export_bluesky():
    return Response(
        bluesky_scenario([f for f in lab.flights.values() if f["phase"] != "AT_STAND"]),
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=honeyb_uae.scn"},
    )


@router.get("/api/simulation-lab/bluebird")
async def bluebird_probe():
    # Operator-configured target only; no arbitrary URL proxy from web requests.
    url = os.getenv("HONEYB_BLUEBIRD_URL")
    if not url:
        return {
            "status": "NOT_CONFIGURED",
            "purpose": "Separate en-route research sandbox; not the active UAE engine",
        }
    import asyncio

    def probe():
        client = BluebirdClient(url)
        try:
            return {
                "status": "CONNECTED",
                "categories": client.categories(),
                "purpose": "Separate en-route research sandbox",
            }
        finally:
            client.close()

    try:
        return await asyncio.to_thread(probe)
    except Exception:
        raise HTTPException(503, "Configured Bluebird service could not be reached")
