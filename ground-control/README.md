# Airport Control Centre (Ground Control)

> **Team Workspace Placeholder** · UAE Hackathon 2026

This directory is reserved exclusively for the **Airport Control Centre** application developed by the ground-control partner.

---

## Purpose & Scope

The Ground Control Centre system is responsible for:
1. Monitoring arrival streams and managing the Arrival Management (AMAN) queue.
2. Calculating landing sequences, runway assignments, and target landing times (TLDT).
3. Issuing holding clearances, Expect Further Clearance (EFC) times, and decision-support delay predictions.
4. Formulating proposed tactical reroutes for spacing and sequencing.
5. Disseminating airport operational notices, runway condition changes, and ATIS/METAR updates.
6. Ingesting downlinked aircraft telemetry and pilot responses (`ACKNOWLEDGE`, `UNABLE`, `REQUEST_CLARIFICATION`, `FUEL_CONCERN`).

---

## Integration Contract

A versioned data contract governing all air-to-ground (A2G) and ground-to-air (G2A) message exchanges is defined at the root of this repository:
- **Specification Document:** [`../CONTRACT.md`](../CONTRACT.md)
- **TypeScript Schemas & Types:** [`../integration-contract.ts`](../integration-contract.ts)
- **JSON Schema:** [`../integration-contract.json`](../integration-contract.json)

Please ensure your application produces and consumes payloads matching this contract.

---

## Connecting to the Pilot In-Plane Application (`plane/`)

The pilot prototype inside `plane/` operates using a pluggable `DataLinkAdapter` interface (`plane/src/services/dataLinkAdapter.ts`).

When you are ready to connect:
1. Provide a WebSocket endpoint (e.g., `ws://localhost:8080/datalink/{flightId}`) or REST polling API (`GET /api/dashboard/{flightId}`).
2. Expose an endpoint to receive pilot responses: `POST /api/pilot-response`.
3. In `plane/src/services/dataLinkAdapter.ts`, switch the active adapter from `MockDataLinkAdapter` to `HttpDataLinkAdapter` or `WebSocketDataLinkAdapter`.

See the root [`../README.md`](../README.md) for full architecture and integration guidelines.
