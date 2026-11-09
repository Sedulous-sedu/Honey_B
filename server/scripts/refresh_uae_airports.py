"""Explicit maintenance command; normal simulation runs use the bundled cache."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.providers.ourairports import OurAirportsProvider, TARGET_ICAOS

if __name__ == "__main__":
    result = OurAirportsProvider.load_or_fetch(force_refresh=True)
    if not TARGET_ICAOS.issubset(result.get("airports", {})):
        raise SystemExit(
            "Refresh incomplete; retained cached data. Check network connectivity."
        )
    print(
        "Reference contains",
        len(result["airports"]),
        "airports; retrieved",
        result["retrievedAtUtc"],
    )
