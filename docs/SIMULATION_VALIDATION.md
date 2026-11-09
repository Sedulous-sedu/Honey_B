# Executed validation — 2026-11-09

## Automated application checks

- Existing backend suites: 36 tests passed (`test_server.py`, `test_real_data.py`,
  `test_risk_advisor.py`).
- New Simulation Lab suite: 15 tests passed, including real optional BlueSky
  motion/reset, clock progression after traffic empties, deterministic replay,
  isolated weather, diversion revalidation, reference-cache failure preservation,
  replay format/units, HTTP validation and OMDB pilot-contract handoff.
- Ground Control production build: `npm ci && npm run build` passed.
- JavaScript DOM integration against a running Honey B server passed: initial
  snapshot, seven airport rows, loading the disruption checkpoint, advancing,
  approval of a diversion, generated SVG map and Bluebird status message.

## Upstream interoperability executed locally

- **BlueSky 1.1.1:** installed and used as the actual engine, with 42 aircraft;
  advanced to a fog checkpoint at 600 simulated seconds. BlueSky clock and
  lab clock both read 600. Aircraft moved, parked and entered holding queues.
  This check took about 7 seconds on the verification host, not a performance SLA.
  The engine reported no BADA data; none was supplied or needed for the check.
- **AirTrafficSim:** loaded upstream `airtrafficsim/server/replay.py` from commit
  `d8a41e76ba9d7753da8e567cf532fa2bf9479dc0` and passed exported trajectories
  through `Replay.get_replay_czml('historic', 'honeyb_simulated')`.
  It produced a CZML document plus 42 aircraft entries (43 entries total).
- **BluebirdATC 0.4.0:** installed in a separate environment. Ran Honey B's client
  against the actual Bluebird FastAPI application through an in-process transport.
  Listed six categories, listed six `Two Aircraft` scenarios, loaded and paused
  `I-Sector`, advanced six seconds, read an environment containing two aircraft,
  and submitted an accepted heading-change action for `AIR0` in `sector_i`.
  This validates the client/API boundary, not UAE scenario conversion.
- **OurAirports:** downloaded airports/runways CSVs and bundled seven airport
  records plus ten runway reference records. Whole-source SHA-256 hashes and
  retrieval timestamp are retained in `server/data/ourairports_uae.json`.

## Verification limits

Full Chromium visual inspection could not run because browser downloads returned
invalid/truncated archives. The interactive page was instead exercised through
JavaScript DOM integration and real HTTP requests; layout has not had rendered
browser visual QA. The AirTrafficSim browser viewer itself was not launched.
No real airport operational data calibration, safety certification, field trials,
real flight timetable verification or measured baseline benefit is claimed.
