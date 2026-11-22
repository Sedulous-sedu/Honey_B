# Simulation sources and attribution

No third-party simulator source was vendored. Honey B's adapters are original
interoperability code. Retain upstream notices when separately redistributing
third-party software; optional data/model packages have their own licences.

| Source | Licence declared by upstream | Role |
| --- | --- | --- |
| https://github.com/davidmegginson/ourairports-data | Public domain / Unlicense | Airport and runway reference data; hashes retained in bundled JSON |
| https://github.com/TUDelft-CNS-ATM/bluesky | MIT | Optional `bluesky-simulator==1.1.1` engine |
| https://github.com/project-bluebird/BluebirdATC | AGPL-3.0-or-later | Separately installed optional `bluebird-api==0.4.0` research service |
| https://github.com/HKUST-OCTAD-LAB/AirTrafficSim | GPL-3.0 | Separate replay viewer; format-compatible simulated CSV export |

Upstream source revisions inspected on 2026-11-09:

- BlueSky: `46a2a8a5fa4e0bdd6f6991fefc70dc3512f8fc53`.
- BluebirdATC: `30f82f70d91acd18c5f60cc7dc38206f52cc60fa`.
- AirTrafficSim: `d8a41e76ba9d7753da8e567cf532fa2bf9479dc0`.

Implementation follows BlueSky's detached `init`, direct `traf.cre` (SI units),
heading selection and `sim.step` interface; Bluebird's documented routes and action
schema; AirTrafficSim's FR24-shaped historic replay CSV reader. These projects
are not represented as endorsing Honey B. No BADA data is bundled or required.
