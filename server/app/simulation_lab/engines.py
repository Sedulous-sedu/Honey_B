"""Movement engines. BlueSky owns movement only when explicitly selected.

No upstream simulator source is vendored. Distances: NM, altitude: ft, speed: kt.
"""

import math
import tempfile
from importlib.metadata import version


def distance_nm(lat1, lon1, lat2, lon2):
    a, b = math.radians(lat1), math.radians(lat2)
    h = (
        math.sin((b - a) / 2) ** 2
        + math.cos(a) * math.cos(b) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 3440.065 * 2 * math.asin(min(1, math.sqrt(h)))


def bearing(lat1, lon1, lat2, lon2):
    a, b, d = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    return (
        math.degrees(
            math.atan2(
                math.sin(d) * math.cos(b),
                math.cos(a) * math.sin(b) - math.sin(a) * math.cos(b) * math.cos(d),
            )
        )
        % 360
    )


class BuiltinEngine:
    name = "builtin"
    version = "1"

    def reset(self, flights):
        pass

    def move(self, flight, dt, target):
        if flight["phase"] == "HOLDING":
            flight["headingDeg"] = (flight["headingDeg"] + dt * 2) % 360
            return
        distance = distance_nm(
            flight["lat"], flight["lon"], target["lat"], target["lon"]
        )
        fraction = min(1, flight["speedKt"] * dt / 3600 / max(distance, 0.001))
        flight["headingDeg"] = bearing(
            flight["lat"], flight["lon"], target["lat"], target["lon"]
        )
        flight["lat"] += (target["lat"] - flight["lat"]) * fraction
        flight["lon"] += (target["lon"] - flight["lon"]) * fraction

    def retire(self, flight):
        pass

    def advance(self, dt):
        pass

    def sync(self, flight):
        pass


class BlueSkyEngine:
    """One detached BlueSky singleton per process; API calls run on the main loop.

    Only airborne geometry is delegated. Airport capacity and fuel assumptions
    remain in Honey B. Never import this as a live surveillance provider.
    """

    name = "bluesky"

    def __init__(self):
        import bluesky as bs

        self.bs = bs
        self.version = version("bluesky-simulator")
        self.workdir = tempfile.TemporaryDirectory(prefix="honeyb-bluesky-")
        if bs.sim is None:
            bs.init(mode="sim", detached=True, workdir=self.workdir.name)

    def reset(self, flights):
        self.bs.sim.reset()
        for f in flights:
            # BlueSky's direct create interface uses SI altitude and CAS.
            result = self.bs.traf.cre(
                f["id"],
                f["aircraftType"],
                f["lat"],
                f["lon"],
                f["headingDeg"],
                f["altitudeFt"] * 0.3048,
                f["speedKt"] * 0.514444,
            )
            if isinstance(result, tuple) and result[0] is False:
                raise RuntimeError(str(result))
        from bluesky.core import simtime

        simtime.setdt(1.0)
        self.bs.sim.op()

    def move(self, flight, dt, target):
        idx = self.bs.traf.id2idx(flight["id"])
        if idx < 0:
            raise RuntimeError("BlueSky aircraft missing: " + flight["id"])
        heading = (
            (flight["headingDeg"] + 2 * dt) % 360
            if flight["phase"] == "HOLDING"
            else bearing(flight["lat"], flight["lon"], target["lat"], target["lon"])
        )
        self.bs.traf.ap.selhdgcmd(idx, heading)

    def retire(self, flight):
        idx = self.bs.traf.id2idx(flight["id"])
        if idx >= 0:
            self.bs.traf.delete(idx)

    def advance(self, dt):
        target = self.bs.sim.simt + dt
        while self.bs.sim.simt < target - 1e-6:
            self.bs.sim.step()

    def sync(self, flight):
        i = self.bs.traf.id2idx(flight["id"])
        flight.update(
            lat=float(self.bs.traf.lat[i]),
            lon=float(self.bs.traf.lon[i]),
            headingDeg=float(self.bs.traf.hdg[i]),
            altitudeFt=float(self.bs.traf.alt[i]) / 0.3048,
            speedKt=float(self.bs.traf.gs[i]) / 0.514444,
        )
