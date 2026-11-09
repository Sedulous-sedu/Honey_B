"""Exercise a separately running BluebirdATC service; does not change UAE Lab."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.simulation_lab.interchange import BluebirdClient

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8001")
    parser.add_argument("--category", default="Two Aircraft")
    parser.add_argument(
        "--scenario", help="Load this scenario in the external research service"
    )
    parser.add_argument("--step", type=int, default=6)
    args = parser.parse_args()
    client = BluebirdClient(args.url)
    try:
        if args.scenario:
            client.load(args.category, args.scenario)
            client.evolve(args.step)
            print(json.dumps(client.environment(), indent=2))
        else:
            print(
                json.dumps(
                    {
                        "categories": client.categories(),
                        "scenarios": client.scenarios(args.category),
                    },
                    indent=2,
                )
            )
    finally:
        client.close()
