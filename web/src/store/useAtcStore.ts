import { create } from 'zustand';
import { Aircraft, Weather, Suggestion, Command, Stand, Controller, EventLogEntry, Metrics } from '../types';

interface AtcState {
  connected: boolean;
  activePage: 'wall' | 'operations';
  activeControllerId: string; // 'ALL' or specific ID like 'CTRL-ARR-01'
  selectedAircraftId: string | null;
  serverTime: string;
  simSpeed: number;
  revision: number;

  aircraft: Record<string, Aircraft>;
  weather: Weather | null;
  suggestions: Suggestion[];
  commands: Command[];
  stands: Stand[];
  controllers: Controller[];
  claims: Record<string, any>;
  eventLog: EventLogEntry[];
  metrics: Metrics;

  trafficFilter: 'ALL' | 'ARR' | 'DEP' | 'OTHER';
  searchTerm: string;

  // Actions
  setConnected: (c: boolean) => void;
  setActivePage: (p: 'wall' | 'operations') => void;
  setActiveControllerId: (id: string) => void;
  setSelectedAircraftId: (id: string | null) => void;
  setTrafficFilter: (f: 'ALL' | 'ARR' | 'DEP' | 'OTHER') => void;
  setSearchTerm: (s: string) => void;

  applySnapshot: (snapshot: any) => void;
  updateAircraft: (ac: Aircraft) => void;
  updateWeather: (w: Weather) => void;
  addOrUpdateCommand: (cmd: Command) => void;
  updateCommandStatus: (statusPayload: any) => void;
  updateStand: (standPayload: any) => void;
  updateMetricsAndLogs: (data: any) => void;

  // Server HTTP Actions
  sendCommand: (aircraftId: string, suggestion: Suggestion) => Promise<boolean>;
  triggerFog: (phase: string) => Promise<boolean>;
  resetSim: () => Promise<boolean>;
  setSpeed: (speed: number) => Promise<boolean>;
  reassignStand: (aircraftId: string, standId: string) => Promise<boolean>;
  reassignController: (aircraftId: string, controllerId: string) => Promise<boolean>;
}

const API_BASE = `http://${window.location.hostname || 'localhost'}:8000`;

export const useAtcStore = create<AtcState>((set, get) => ({
  connected: false,
  activePage: 'wall',
  activeControllerId: 'CTRL-ARR-01', // Default Ahmed
  selectedAircraftId: 'UAE231', // Default demo flight
  serverTime: '2026-10-28T03:00:00Z',
  simSpeed: 1.0,
  revision: 100,

  aircraft: {},
  weather: null,
  suggestions: [],
  commands: [],
  stands: [],
  controllers: [],
  claims: {},
  eventLog: [],
  metrics: {
    totalFlights: 28,
    atRiskCount: 2,
    delayedMinutes: 0,
    fcfsBaselineDelayMin: 0,
    conflictsAvoided: 0
  },

  trafficFilter: 'ALL',
  searchTerm: '',

  setConnected: (connected) => set({ connected }),
  setActivePage: (activePage) => set({ activePage }),
  setActiveControllerId: (activeControllerId) => set({ activeControllerId }),
  setSelectedAircraftId: (selectedAircraftId) => set({ selectedAircraftId }),
  setTrafficFilter: (trafficFilter) => set({ trafficFilter }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),

  applySnapshot: (snap) => {
    const acMap: Record<string, Aircraft> = {};
    if (Array.isArray(snap.aircraft)) {
      snap.aircraft.forEach((a: Aircraft) => { acMap[a.callsign] = a; });
    } else if (snap.aircraft) {
      acMap[snap.aircraft.callsign] = snap.aircraft;
    }

    set({
      serverTime: snap.serverTime || get().serverTime,
      simSpeed: snap.simSpeed || 1.0,
      aircraft: Object.keys(acMap).length > 0 ? acMap : get().aircraft,
      weather: snap.weather || get().weather,
      commands: snap.commands || get().commands,
      stands: snap.stands || get().stands,
      controllers: snap.controllers || get().controllers,
      claims: snap.claims || get().claims,
      suggestions: snap.suggestions || get().suggestions,
      eventLog: snap.eventLog || get().eventLog
    });
  },

  updateAircraft: (ac) => {
    set((state) => ({
      aircraft: { ...state.aircraft, [ac.callsign]: ac }
    }));
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
      stands: data.stands || state.stands
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
