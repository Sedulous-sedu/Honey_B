import json
import os
import re
from typing import Dict, Any, Optional, Tuple
from app.models import FlightIdentity, OperatingAirline, MarketingAirline

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data"))
DIRECTORY_FILE = os.path.join(DATA_DIR, "airlines_directory.json")
LOGO_MANIFEST_FILE = os.path.join(DATA_DIR, "airline_logos_manifest.json")

# Operational airline callsign pattern: 3 letters followed by 1-4 digits and optional 0-2 trailing letters
# Examples: UAE158, UAE6U, UAE6RM, FDB1QV, ETD5XG, ADY442, BAW107
CALLSIGN_PREFIX_RE = re.compile(r"^([A-Z]{3})(\d{1,4}[A-Z]{0,2})$")

# Common civil registration patterns that must NEVER be mistaken for airline callsigns
REGISTRATION_RE = re.compile(
    r"^([A-Z]{1,2}-[A-Z0-9]{3,5}|N\d{1,5}[A-Z]{0,2}|TC[A-Z]{3}|VT[A-Z]{3}|A6[A-Z]{3}|HZ[A-Z0-9]{3,4}|AP[A-Z]{3}|EP[A-Z]{3})$"
)

# Ground / surface vehicle callsigns
SURFACE_VEHICLE_PREFIXES = ("MAINT", "MNSTR", "GO", "OP", "FOLLOW", "TUG", "FIRE", "OPS", "RAMP", "SAFE")


class AirlineDirectory:
    _airlines: Dict[str, Dict[str, Any]] = {}
    _logos: Dict[str, Dict[str, Any]] = {}
    _metadata: Dict[str, Any] = {}
    _negative_cache: set = set()
    _loaded: bool = False

    @classmethod
    def load(cls) -> None:
        if cls._loaded:
            return
        if os.path.exists(DIRECTORY_FILE):
            with open(DIRECTORY_FILE, "r") as f:
                raw = json.load(f)
                cls._airlines = raw.get("airlines", {})
                cls._metadata = {
                    "version": raw.get("version", "1.0.0"),
                    "source": raw.get("source", "OpenFlights ODbL + Reviewed UAE Overrides"),
                    "license": raw.get("license", "ODbL 1.0"),
                    "retrievedAtUtc": raw.get("retrievedAtUtc"),
                }
        if os.path.exists(LOGO_MANIFEST_FILE):
            with open(LOGO_MANIFEST_FILE, "r") as f:
                raw_logos = json.load(f)
                cls._logos = raw_logos.get("logos", {})
        cls._loaded = True

    @classmethod
    def get_directory_summary(cls) -> Dict[str, Any]:
        cls.load()
        return {
            **cls._metadata,
            "airlineCount": len(cls._airlines),
            "bundledLogoCount": len(cls._logos),
            "bundledLogoIcaos": sorted(list(cls._logos.keys())),
            "airlines": cls._airlines,
            "logos": cls._logos,
        }

    @classmethod
    def is_surface_vehicle(cls, callsign_obs: Optional[str], category: str = "") -> bool:
        if category in ("C1", "C2", "C3"):
            return True
        if not callsign_obs:
            return False
        for pfx in SURFACE_VEHICLE_PREFIXES:
            if callsign_obs == pfx or (callsign_obs.startswith(pfx) and callsign_obs[len(pfx):].isdigit()):
                return True
        return False

    @classmethod
    def resolve_identity(
        cls,
        icao24: str,
        callsign_raw: Optional[str],
        fetched_at_utc: str,
        track_id: Optional[str] = None,
        registration: Optional[str] = None,
        provider_operator: Optional[str] = None,
        confirmed_iata_flight: Optional[str] = None,
        reference_iata_flight: Optional[str] = None,
        marketing_airlines: Optional[list] = None,
    ) -> Tuple[FlightIdentity, str]:
        """
        Resolves FlightIdentity conservatively according to Honey B A0 rules.
        Never converts ICAO prefix + suffix into a guessed IATA passenger flight number.
        Returns (FlightIdentity, display_callsign).
        """
        cls.load()
        norm_hex = (icao24 or "unknown").strip().lower()
        stable_track_id = track_id or f"TRK-{norm_hex.upper()}"

        # Normalize raw callsign
        raw_str = callsign_raw if isinstance(callsign_raw, str) else None
        cleaned = raw_str.strip().upper() if raw_str else ""
        if not cleaned or cleaned.startswith("HEX-"):
            callsign_observed: Optional[str] = None
        else:
            callsign_observed = cleaned

        operating_airline: Optional[OperatingAirline] = None
        identity_source = "UNRESOLVED"

        if callsign_observed:
            # 1. Check if it is a known non-airline registration or surface vehicle
            if REGISTRATION_RE.match(callsign_observed) or (
                registration and callsign_observed == registration.replace("-", "").upper()
            ):
                operating_airline = None
                identity_source = "REGISTRATION_ONLY"
            elif cls.is_surface_vehicle(callsign_observed):
                operating_airline = None
                identity_source = "SURFACE_TRANSPONDER"
            else:
                # 2. Match strict 3-letter ICAO airline prefix + flight designator digits
                m = CALLSIGN_PREFIX_RE.match(callsign_observed)
                if m:
                    prefix = m.group(1)
                    if prefix in cls._airlines:
                        entry = cls._airlines[prefix]
                        logo_entry = cls._logos.get(prefix)
                        operating_airline = OperatingAirline(
                            icao=entry["icao"],
                            iata=entry.get("iata"),
                            name=entry["name"],
                            logoAssetPath=logo_entry.get("assetPath") if logo_entry else None,
                            matchMethod="CALLSIGN_DIRECTORY",
                            source=cls._metadata.get("source", "OpenFlights ODbL + Reviewed UAE Overrides"),
                            reviewedAtUtc=entry.get("reviewedAtUtc"),
                        )
                        identity_source = "CALLSIGN_DIRECTORY"
                    else:
                        cls._negative_cache.add(prefix)
                        identity_source = "UNMATCHED_CALLSIGN_PREFIX"
                else:
                    identity_source = "NON_STANDARD_CALLSIGN"

        # Note: Do NOT blindly use registered owner (`provider_operator`) when callsign is a non-airline
        # registration or when an operating airline is already determined from the active callsign,
        # preventing lessor/owner or codeshare mismatches from showing the wrong airline logo.

        # Flight number status rule: NEVER synthesize IATA flight numbers from ICAO callsigns
        if confirmed_iata_flight:
            fn_iata = confirmed_iata_flight
            fn_status = "CONFIRMED_MATCH"
        elif reference_iata_flight:
            fn_iata = None  # Do not display reference-only standing route numbers as confirmed live service
            fn_status = "REFERENCE_ONLY"
        else:
            fn_iata = None
            fn_status = "UNAVAILABLE"

        mkt_list = [
            MarketingAirline(**m_item) if isinstance(m_item, dict) else m_item
            for m_item in (marketing_airlines or [])
        ]

        identity = FlightIdentity(
            trackId=stable_track_id,
            icao24=norm_hex,
            callsignObserved=callsign_observed,
            callsignRaw=raw_str,
            flightNumberIata=fn_iata,
            flightNumberStatus=fn_status,
            operatingAirline=operating_airline,
            marketingAirlines=mkt_list,
            identitySource=identity_source,
            identityFetchedAtUtc=fetched_at_utc,
        )

        # Display fallback when no callsign was broadcast: registration or ICAO24
        display_callsign = (
            callsign_observed
            or (registration.strip().upper() if registration and registration.strip() else None)
            or f"ICAO-{norm_hex.upper()}"
        )

        return identity, display_callsign
