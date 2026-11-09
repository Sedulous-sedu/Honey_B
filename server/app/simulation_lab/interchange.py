"""Original interoperability code based on upstream public formats.

AirTrafficSim historic replay expects one FR24-shaped CSV per flight. These
exports are explicitly SIMULATED, never historical observations.
"""

import csv
import io
import json
import zipfile
from urllib.parse import urlparse, quote
import httpx


def airtrafficsim_zip(history, metadata):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "README.txt",
            "SIMULATED Honey B traffic, not real observations.\nCopy honeyb_simulated/ into AirTrafficSim airtrafficsim/data/flight_data/, then select historic replay.\nCSV altitude is feet, gspeed knots, timestamp Unix UTC seconds.\n",
        )
        archive.writestr("manifest.json", json.dumps(metadata, indent=2))
        for callsign in sorted({row["id"] for row in history}):
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["timestamp", "long", "lat", "alt", "gspeed"])
            for row in history:
                if row["id"] == callsign:
                    writer.writerow(
                        [
                            row["timestamp"],
                            row["lon"],
                            row["lat"],
                            row["altitudeFt"],
                            row["speedKt"],
                        ]
                    )
            archive.writestr("honeyb_simulated/" + callsign + ".csv", output.getvalue())
    return stream.getvalue()


def bluesky_scenario(flights):
    lines = [
        "# Honey B SIMULATED traffic; identities are demo references, not verified schedules."
    ]
    for f in flights:
        lines.append(
            f"00:00:00.00>CRE {f['id']},{f['aircraftType']},{f['lat']:.6f},{f['lon']:.6f},{f['headingDeg']:.2f},{f['altitudeFt']:.0f},{f['speedKt']:.1f}"
        )
    lines.append("00:00:00.00>OP")
    return "\n".join(lines) + "\n"


class BluebirdClient:
    """Explicit local research client; never advances alongside the UAE clock.

    Endpoint paths and action shape verified against BluebirdATC core.py.
    The target must be configured by the operator, never by an HTTP request.
    """

    def __init__(self, base_url, transport=None):
        parsed = urlparse(base_url)
        if (
            parsed.scheme not in ("http", "https")
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "Use an HTTP(S) Bluebird base URL without credentials/query/fragment"
            )
        self.client = httpx.Client(
            base_url=base_url.rstrip("/"), transport=transport, timeout=10
        )

    def _request(self, method, path, **kwargs):
        response = self.client.request(method, path, **kwargs)
        response.raise_for_status()
        return response.json()

    def categories(self):
        return self._request("GET", "/list_scenario_categories")

    def scenarios(self, category):
        return self._request("GET", "/list_scenarios/" + quote(category, safe=""))

    def load(self, category, scenario):
        result = self._request(
            "POST", "/load/" + quote(category, safe="") + "/" + quote(scenario, safe="")
        )
        self._request("POST", "/pause")
        return result

    def environment(self):
        return self._request("GET", "/environment")

    def evolve(self, seconds):
        if seconds <= 0 or seconds > 3600:
            raise ValueError("Step must be within (0, 3600] seconds")
        return self._request("POST", f"/evolve/{seconds}")

    def action(self, callsign, kind, value, sector):
        if kind not in (
            "change_heading_to",
            "change_flight_level_to",
            "route_direct_to",
        ):
            raise ValueError("Unsupported Honey B research action")
        return self._request(
            "POST",
            "/actions",
            json=[
                {
                    "agent": "honeyb-research",
                    "callsign": callsign,
                    "kind": kind,
                    "value": value,
                    "sector": sector,
                }
            ],
        )

    def close(self):
        self.client.close()
