"""OpenStreetMap (OSM) aeroway geometry loader for OMDB.

Loads cached runway, taxiway, apron, and parking positions extracted from OSM.
Maintains ODbL license metadata and explicitly marks live stand occupancy as UNKNOWN.
"""
import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("HoneyB.OsmGeometry")

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data"))
GEOMETRY_FILE = os.path.join(DATA_DIR, "osm_omdb_geometry.json")


class OsmGeometryProvider:
    _cached_data: Optional[Dict[str, Any]] = None

    @classmethod
    def load(cls) -> Dict[str, Any]:
        if cls._cached_data is None:
            if os.path.exists(GEOMETRY_FILE):
                with open(GEOMETRY_FILE, "r") as f:
                    cls._cached_data = json.load(f)
            else:
                cls._cached_data = {
                    "version": "1.0.0",
                    "license": "Open Data Commons ODbL 1.0",
                    "attribution": "© OpenStreetMap contributors",
                    "runways": [],
                    "taxiways": [],
                    "parkingPositions": []
                }
        return cls._cached_data

    @classmethod
    def get_stands_reference(cls) -> Dict[str, Dict[str, Any]]:
        """Returns reference parking positions with live status UNKNOWN."""
        geom = cls.load()
        stands = {}
        for p in geom.get("parkingPositions", []):
            ref = p.get("ref")
            stands[ref] = {
                "id": ref,
                "terminal": p.get("terminal"),
                "size": p.get("size", "WIDE"),
                "lat": p.get("lat"),
                "lon": p.get("lon"),
                "status": "UNKNOWN",  # Live occupancy cannot be inferred from static OSM
                "currentAircraft": None,
                "provenance": "REFERENCE_OSM"
            }
        return stands

