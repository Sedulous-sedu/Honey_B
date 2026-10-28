/**
 * ==============================================================================
 * MOCK API — LEGACY COMPATIBILITY LAYER
 * ==============================================================================
 * For new components, use `plane/src/services/dataLinkAdapter.ts`.
 * This file delegates to `activeDataLinkAdapter` for seamless backwards compatibility.
 * ==============================================================================
 */

import type { ConsolidatedDashboardState, ScenarioName, PilotResponsePayload } from '../types';
import { activeDataLinkAdapter } from '../services/dataLinkAdapter';

export async function getDashboardState(scenarioName: ScenarioName): Promise<ConsolidatedDashboardState> {
  await activeDataLinkAdapter.setScenario(scenarioName);
  return new Promise((resolve) => {
    const unsub = activeDataLinkAdapter.subscribe((state) => {
      resolve(state);
      unsub();
    });
  });
}

export async function sendPilotResponse(payload: {
  messageId: string;
  flightId: string;
  responseType: any;
  note?: string;
  timestampUtc: string;
}): Promise<{ success: boolean; transmissionId: string }> {
  const p: PilotResponsePayload = {
    referencedMessageId: payload.messageId,
    flightId: payload.flightId,
    responseType: payload.responseType,
    pilotNotes: payload.note,
    timestampUtc: payload.timestampUtc,
  };
  return activeDataLinkAdapter.sendPilotResponse(p);
}
