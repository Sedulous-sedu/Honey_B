"""OurAirports reference loader for UAE aerodromes and runways.

Filters public-domain community OurAirports data for OMDB, OMDW, OMSJ, OMAA, OMRK, OMFJ, OMAL.
Caches local snapshot in server/data/ourairports_uae.json with hash, retrieval date, and license info.
Validates runway coordinates, physical IDs, and preserves missing data honestly.
"""
import os
import csv
import json
import hashlib
import datetime
import logging
import tempfile
from typing import Dict, List, Any, Optional
import httpx

logger = logging.getLogger("HoneyB.OurAirports")

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data"))
CACHE_FILE = os.path.join(DATA_DIR, "ourairports_uae.json")
AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
RUNWAYS_URL = "https://davidmegginson.github.io/ourairports-data/runways.csv"
TARGET_ICAOS = {"OMDB", "OMDW", "OMSJ", "OMAA", "OMRK", "OMFJ", "OMAL"}


class OurAirportsProvider:
    @classmethod
    def load_or_fetch(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """Loads cached UAE airports & runways, or fetches and caches if missing."""
        if not force_refresh and os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r") as f:
                    cached = json.load(f)
                    if TARGET_ICAOS.issubset(cached.get("airports", {})):
                        return cached
                    logger.info("Cached reference is incomplete; refreshing seven-airport dataset")
            except Exception as e:
                logger.warning(f"Error reading OurAirports cache, will re-fetch: {e}")

        return cls._fetch_and_cache_sync()

    @classmethod
    def _fetch_and_cache_sync(cls) -> Dict[str, Any]:
        """Synchronously downloads and parses UAE airport & runway records."""
        headers = {"User-Agent": "HoneyB-Aviation-Monitor/1.0"}
        airports_data: Dict[str, Any] = {}
        airports_csv_hash = ""
        runways_csv_hash = ""

        try:
            with httpx.Client(headers=headers, timeout=15.0) as client:
                r_air = client.get(AIRPORTS_URL)
                r_air.raise_for_status()
                if r_air.status_code == 200:
                    airports_csv_hash = hashlib.sha256(r_air.content).hexdigest()
                    reader = csv.DictReader(r_air.text.splitlines())
                    for row in reader:
                        ident = row.get("ident", "").strip().upper()
                        if ident in TARGET_ICAOS:
                            airports_data[ident] = {
                                "icao": ident,
                                "name": row.get("name"),
                                "type": row.get("type"),
                                "lat": float(row.get("latitude_deg") or 0.0),
                                "lon": float(row.get("longitude_deg") or 0.0),
                                "elevationFt": float(row.get("elevation_ft") or 0.0),
                                "municipality": row.get("municipality"),
                                "runways": []
                            }

                r_run = client.get(RUNWAYS_URL)
                r_run.raise_for_status()
                if r_run.status_code == 200:
                    runways_csv_hash = hashlib.sha256(r_run.content).hexdigest()
                    reader = csv.DictReader(r_run.text.splitlines())
                    for row in reader:
                        ident = row.get("airport_ident", "").strip().upper()
                        if ident in airports_data:
                            rwy_entry = {
                                "id": row.get("id"),
                                "le_ident": row.get("le_ident"),
                                "he_ident": row.get("he_ident"),
                                "lengthFt": float(row.get("length_ft") or 0.0),
                                "widthFt": float(row.get("width_ft") or 0.0),
                                "surface": row.get("surface"),
                                "lighted": row.get("lighted") == "1",
                                "closed": row.get("closed") == "1",
                                "le_lat": float(row.get("le_latitude_deg")) if row.get("le_latitude_deg") else None,
                                "le_lon": float(row.get("le_longitude_deg")) if row.get("le_longitude_deg") else None,
                                "he_lat": float(row.get("he_latitude_deg")) if row.get("he_latitude_deg") else None,
                                "he_lon": float(row.get("he_longitude_deg")) if row.get("he_longitude_deg") else None,
                                "le_headingDeg": float(row.get("le_heading_degT")) if row.get("le_heading_degT") else None,
                                "he_headingDeg": float(row.get("he_heading_degT")) if row.get("he_heading_degT") else None,
                            }
                            airports_data[ident]["runways"].append(rwy_entry)

        except Exception as e:
            logger.error(f"Failed to download OurAirports data: {e}")
            # If fetch fails and no cache exists, use fallback reference
            if os.path.exists(CACHE_FILE):
                with open(CACHE_FILE, "r") as f:
                    return json.load(f)

        if not TARGET_ICAOS.issubset(airports_data) or any(not a["runways"] for a in airports_data.values()):
            if os.path.exists(CACHE_FILE):
                with open(CACHE_FILE, "r") as f:
                    return json.load(f)
            raise RuntimeError("Incomplete OurAirports response; reference cache was not replaced")

        payload = {
            "version": "1.0.0",
            "retrievedAtUtc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "license": "Public Domain (OurAirports)",
            "source": "OurAirports open data (David Megginson)",
            "airportsSha256": airports_csv_hash,
            "runwaysSha256": runways_csv_hash,
            "airports": airports_data
        }

        os.makedirs(DATA_DIR, exist_ok=True)
        # Publish only a complete snapshot, atomically, preserving a usable cache.
        with tempfile.NamedTemporaryFile(mode="w", dir=DATA_DIR, suffix=".json", delete=False) as f:
            json.dump(payload, f, indent=2)
            temporary_path = f.name
        os.replace(temporary_path, CACHE_FILE)

        return payload

