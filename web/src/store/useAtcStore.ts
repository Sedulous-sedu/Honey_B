import { create } from 'zustand';
import {
  Aircraft,
  Weather,
  Suggestion,
  Command,
  Stand,
  Controller,
  EventLogEntry,
  Metrics,
  DataMode,
  ProviderHealth,
} from '../types';

export interface CustomCommandDraft {
  aircraftId: string;
  instructionType: string;
  displayText: string;
  optionA?: string;
  optionB?: string;
  mode?: 'COMMAND' | 'OPTIONS';
  targetAltitudeFt?: number;
  targetSpeedKt?: number;
  targetHeadingDeg?: number;
  fix?: string;
  holdAltitudeFt?: number;
  newRunway?: string;
  alternateIcao?: string;
  relatedSuggestionId?: string;
  optionGroupId?: string;
  optionLabel?: string;
}

interface AtcState {
  connected: boolean;
  activePage: 'wall' | 'operations';
  activeControllerId: string; // 'ALL' or specific ID like 'CTRL-ARR-01'
  selectedAircraftId: string | null;
  serverTime: string;
  simSpeed: number;
  revision: number;
  dataMode: DataMode;
  providerHealth: ProviderHealth[];

  aircraft: Record<string, Aircraft>;
  weather: Weather | null;
  suggestions: Suggestion[];
  commands: Command[];
  stands: Stand[];
  controllers: Controller[];
  claims: Record<string, any>;
  eventLog: EventLogEntry[];
  metrics: Metrics;
  runwayStates: Record<string, any>;
  approvedSequenceAdvisory: any | null;

  trafficFilter: 'ALL' | 'ARR' | 'DEP' | 'OTHER';
  searchTerm: string;
  composerDraft: CustomCommandDraft | null;

  // Actions
  setConnected: (c: boolean) => void;
  setActivePage: (p: 'wall' | 'operations') => void;
  setActiveControllerId: (id: string) => void;
  setSelectedAircraftId: (id: string | null) => void;
  setTrafficFilter: (f: 'ALL' | 'ARR' | 'DEP' | 'OTHER') => void;
  setSearchTerm: (s: string) => void;
  setComposerDraft: (draft: CustomCommandDraft | null) => void;

  applySnapshot: (snapshot: any) => void;
  updateAircraft: (ac: Aircraft) => void;
  removeAircraft: (payload: { removedTrackIds?: string[]; removedIcao24s?: string[]; removedCallsigns?: string[] }) => void;
  updateWeather: (w: Weather) => void;
  addOrUpdateCommand: (cmd: Command) => void;
  updateCommandStatus: (statusPayload: any) => void;
  updateStand: (standPayload: any) => void;
  updateMetricsAndLogs: (data: any) => void;

  // Server HTTP Actions
  sendCommand: (aircraftId: string, suggestion: Suggestion) => Promise<boolean>;
  sendCustomCommand: (payload: CustomCommandDraft) => Promise<boolean>;
  triggerFog: (phase: string) => Promise<boolean>;
  resetSim: () => Promise<boolean>;
  setSpeed: (speed: number) => Promise<boolean>;
  setMode: (mode: DataMode, scenarioId?: string, recordingFile?: string) => Promise<boolean>;
  forkScenario: (name: string, description?: string) => Promise<string | null>;
  reassignStand: (aircraftId: string, standId: string) => Promise<boolean>;
  reassignController: (aircraftId: string, controllerId: string) => Promise<boolean>;
}

const API_BASE = `http://${window.location.hostname || 'localhost'}:8000`;

export function getTrackKey(ac: Aircraft): string {
  return ac.trackId || ac.icao24 || ac.callsign;
}

export function resolveSelectedAircraft(
  aircraftMap: Record<string, Aircraft>,
  selectedId: string | null
): Aircraft | null {
  if (!selectedId) return null;
  if (aircraftMap[selectedId]) return aircraftMap[selectedId];
  const selUpper = selectedId.toUpperCase();
  const selLower = selectedId.toLowerCase();
  for (const ac of Object.values(aircraftMap)) {
    if (
      ac.trackId === selectedId ||
      ac.trackId === selUpper ||
      ac.icao24 === selLower ||
      ac.callsign === selUpper
    ) {
      return ac;
    }
  }
  return null;
}

export const useAtcStore = create<AtcState>((set, get) => ({
  connected: false,
  activePage: 'wall',
  activeControllerId: 'ALL',
  selectedAircraftId: null,
  serverTime: '2026-11-02T20:00:00Z',
  simSpeed: 1.0,
  revision: 100,
  dataMode: 'LIVE_OBSERVE',
  providerHealth: [],

  aircraft: {},
  weather: null,
  suggestions: [],
  commands: [],
  stands: [],
  controllers: [],
  claims: {},
  eventLog: [],
  metrics: {
    totalFlights: 0,
    atRiskCount: 0,
    delayedMinutes: 0,
    fcfsBaselineDelayMin: 0,
    conflictsAvoided: 0
  },
  runwayStates: {},
  approvedSequenceAdvisory: null,

  trafficFilter: 'ALL',
  searchTerm: '',
  composerDraft: null,

  setConnected: (connected) => set({ connected }),
  setActivePage: (activePage) => set({ activePage }),
  setActiveControllerId: (activeControllerId) => set({ activeControllerId }),
  setSelectedAircraftId: (selectedAircraftId) => set({ selectedAircraftId }),
  setTrafficFilter: (trafficFilter) => set({ trafficFilter }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setComposerDraft: (composerDraft) => set({ composerDraft }),

  applySnapshot: (snap) => {
    const acMap: Record<string, Aircraft> = {};
    const hasAircraftField = snap && snap.aircraft !== undefined;
    if (Array.isArray(snap.aircraft)) {
      snap.aircraft.forEach((a: Aircraft) => {
        acMap[getTrackKey(a)] = a;
      });
    } else if (snap.aircraft) {
      acMap[getTrackKey(snap.aircraft)] = snap.aircraft;
    }

    const nextAircraft = hasAircraftField ? acMap : get().aircraft;
    const currentSel = get().selectedAircraftId;
    const resolvedSel = resolveSelectedAircraft(nextAircraft, currentSel);
    const firstKey = Object.keys(nextAircraft)[0] || null;

    set({
      serverTime: snap.serverTime || get().serverTime,
      simSpeed: snap.simSpeed || 1.0,
      dataMode: snap.dataMode || get().dataMode,
      providerHealth: snap.providerHealth || get().providerHealth,
      aircraft: nextAircraft,
      selectedAircraftId: resolvedSel ? getTrackKey(resolvedSel) : firstKey,
      weather: snap.weather !== undefined ? snap.weather : get().weather,
      commands: snap.commands || get().commands,
      stands: snap.stands || get().stands,
      controllers: snap.controllers || get().controllers,
      claims: snap.claims || get().claims,
      suggestions: snap.suggestions || get().suggestions,
      eventLog: snap.eventLog || get().eventLog,
      runwayStates: snap.runwayStates || get().runwayStates,
      approvedSequenceAdvisory: snap.approvedSequenceAdvisory !== undefined ? snap.approvedSequenceAdvisory : get().approvedSequenceAdvisory,
    });
  },

  updateAircraft: (ac) => {
    set((state) => {
      const key = getTrackKey(ac);
      const next = { ...state.aircraft, [key]: ac };
      return {
        aircraft: next,
        selectedAircraftId: state.selectedAircraftId || key,
      };
    });
  },

  removeAircraft: (payload) => {
    set((state) => {
      const rmIds = new Set([
        ...(payload.removedTrackIds || []),
        ...(payload.removedIcao24s || []).map((h) => h.toLowerCase()),
        ...(payload.removedCallsigns || []).map((c) => c.toUpperCase()),
      ]);
      const next: Record<string, Aircraft> = {};
      for (const [k, ac] of Object.entries(state.aircraft)) {
        const match =
          rmIds.has(k) ||
          (ac.trackId && rmIds.has(ac.trackId)) ||
          (ac.icao24 && rmIds.has(ac.icao24.toLowerCase())) ||
          rmIds.has(ac.callsign.toUpperCase());
        if (!match) {
          next[k] = ac;
        }
      }
      const resolvedSel = resolveSelectedAircraft(next, state.selectedAircraftId);
      return {
        aircraft: next,
        selectedAircraftId: resolvedSel ? getTrackKey(resolvedSel) : (Object.keys(next)[0] || null),
      };
    });
  },

  updateWeather: (weather) => set({ weather }),

  addOrUpdateCommand: (cmd) => {
    set((state) => {
      const idx = state.commands.findIndex((c) => c.commandId === cmd.commandId);
      if (idx >= 0) {
        const next = [...state.commands];
        next[idx] = { ...next[idx], ...cmd };
        return { commands: next };
      }
      return { commands: [cmd, ...state.commands] };
    });
  },

  updateCommandStatus: (statusPayload) => {
    set((state) => {
      const idx = state.commands.findIndex((c) => c.commandId === statusPayload.commandId);
      if (idx >= 0) {
        const next = [...state.commands];
        next[idx] = {
          ...next[idx],
          status: statusPayload.status,
          response: statusPayload.response || next[idx].response
        };
        return { commands: next };
      }
      return state;
    });
  },

  updateStand: (standPayload) => {
    set((state) => {
      const stands = state.stands.map((s) => {
        if (s.id === standPayload.standId) {
          return { ...s, currentAircraft: standPayload.aircraftId || s.currentAircraft };
        }
        if (s.id === standPayload.previousStandId && s.currentAircraft === standPayload.aircraftId) {
          return { ...s, currentAircraft: null, status: 'FREE' as const };
        }
        return s;
      });
      return { stands };
    });
  },

  updateMetricsAndLogs: (data) => {
    set((state) => ({
      suggestions: data.suggestions || state.suggestions,
      claims: data.claims || state.claims,
      eventLog: data.eventLog || state.eventLog,
      metrics: data.metrics || state.metrics,
      commands: data.commands || state.commands,
      stands: data.stands || state.stands,
      runwayStates: data.runwayStates || state.runwayStates,
      approvedSequenceAdvisory: data.approvedSequenceAdvisory !== undefined ? data.approvedSequenceAdvisory : state.approvedSequenceAdvisory,
    }));
  },

  sendCommand: async (aircraftId, suggestion) => {
    try {
      const controllerId = get().activeControllerId === 'ALL' ? 'CTRL-ARR-01' : get().activeControllerId;
      const res = await fetch(`${API_BASE}/demo/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId,
          controllerId,
          instructionType: suggestion.instructionType,
          displayText: suggestion.displayText,
          targetAltitudeFt: suggestion.params.targetAltitudeFt,
          targetSpeedKt: suggestion.params.targetSpeedKt,
          targetHeadingDeg: suggestion.params.targetHeadingDeg,
          fix: suggestion.params.fix,
          holdAltitudeFt: suggestion.params.holdAltitudeFt,
          newRunway: suggestion.params.newRunway,
          alternateIcao: suggestion.params.alternateIcao,
          relatedSuggestionId: suggestion.suggestionId
        })
      });
      if (res.ok) {
        // Mark suggestion locally as executed
        set((state) => ({
          suggestions: state.suggestions.map((s) =>
            s.suggestionId === suggestion.suggestionId ? { ...s, status: 'EXECUTED' } : s
          )
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  sendCustomCommand: async (payload) => {
    try {
      const controllerId = get().activeControllerId === 'ALL' ? 'CTRL-ARR-01' : get().activeControllerId;
      const res = await fetch(`${API_BASE}/demo/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId: payload.aircraftId,
          controllerId,
          instructionType: payload.instructionType || 'INFORMATION',
          displayText: payload.displayText,
          targetAltitudeFt: payload.targetAltitudeFt,
          targetSpeedKt: payload.targetSpeedKt,
          targetHeadingDeg: payload.targetHeadingDeg,
          fix: payload.fix,
          holdAltitudeFt: payload.holdAltitudeFt,
          newRunway: payload.newRunway,
          alternateIcao: payload.alternateIcao,
          relatedSuggestionId: payload.relatedSuggestionId,
          optionGroupId: payload.optionGroupId,
          optionLabel: payload.optionLabel
        })
      });
      if (res.ok) {
        if (payload.relatedSuggestionId) {
          set((state) => ({
            suggestions: state.suggestions.map((s) =>
              s.suggestionId === payload.relatedSuggestionId ? { ...s, status: 'EXECUTED' } : s
            )
          }));
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  triggerFog: async (phase) => {
    try {
      const res = await fetch(`${API_BASE}/demo/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase })
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  resetSim: async () => {
    try {
      const res = await fetch(`${API_BASE}/demo/reset`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  },

  setSpeed: async (speed) => {
    try {
      const res = await fetch(`${API_BASE}/demo/speed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed })
      });
      if (res.ok) {
        set({ simSpeed: speed });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  setMode: async (mode, scenarioId, recordingFile) => {
    try {
      const res = await fetch(`${API_BASE}/api/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, scenarioId, recordingFile })
      });
      if (res.ok) {
        set({ dataMode: mode });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  forkScenario: async (name, description) => {
    try {
      const res = await fetch(`${API_BASE}/api/scenario/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
      if (res.ok) {
        const data = await res.json();
        set({ dataMode: 'WHAT_IF' });
        return data.scenarioId;
      }
      return null;
    } catch {
      return null;
    }
  },

  reassignStand: async (aircraftId, standId) => {
    try {
      const res = await fetch(`${API_BASE}/demo/stand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraftId, standId })
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  reassignController: async (aircraftId, controllerId) => {
    try {
      const res = await fetch(`${API_BASE}/demo/reassign-controller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraftId, controllerId })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}));
