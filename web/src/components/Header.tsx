import React from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { LayoutGrid, Radio, Users, Clock, CloudFog, RotateCcw } from 'lucide-react';

export const Header: React.FC = () => {
  const activePage = useAtcStore((s) => s.activePage);
  const setActivePage = useAtcStore((s) => s.setActivePage);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const setActiveControllerId = useAtcStore((s) => s.setActiveControllerId);
  const controllers = useAtcStore((s) => s.controllers);
  const serverTime = useAtcStore((s) => s.serverTime);
  const connected = useAtcStore((s) => s.connected);
  const weather = useAtcStore((s) => s.weather);
  const triggerFog = useAtcStore((s) => s.triggerFog);
  const resetSim = useAtcStore((s) => s.resetSim);
  const dataMode = useAtcStore((s) => s.dataMode);
  const providerHealth = useAtcStore((s) => s.providerHealth);
  const setMode = useAtcStore((s) => s.setMode);

  // Parse time
  const timeStr = serverTime ? serverTime.replace('T', ' ').replace('Z', ' UTC') : '03:00:00 UTC';

  const activeController = controllers.find((c) => c.id === activeControllerId);

  const handleControllerChange = (val: string) => {
    setActiveControllerId(val);
    const url = new URL(window.location.href);
    if (val === 'ALL') {
      url.searchParams.delete('controller');
    } else {
      url.searchParams.set('controller', val);
    }
    window.history.pushState({}, '', url.toString());
  };

  return (
    <header className="h-14 bg-[#0A1830] border-b border-[#1A3A66] px-4 flex items-center justify-between select-none">
      {/* Left: Brand & Navigation */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2.5">
          {/* Exact same Honey B logo image used in Pilot App */}
          <img
            src="/honey-b-logo.jpg"
            alt="Honey B logo"
            className="w-9 h-9 rounded-lg bg-[#FFFFFF] p-0.5 object-contain border border-[#F5A623] "
            draggable={false}
          />
          <span className="font-bold text-sm text-[#FFFFFF]">
            Honey B <span className="text-[#F5A623]">Ground Control</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0F2444] text-[#FFFFFF] border border-[#F5A623]/40">
            OMDB
          </span>
          {activeControllerId === 'ALL' ? (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#0F2444] text-[#F5A623] border border-[#F5A623]/50">
              Overview
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#0F2444] text-[#F5A623] border border-[#F5A623] flex items-center space-x-1">
              <span>{activeController?.name} ({activeControllerId.replace('CTRL-', '')})</span>
            </span>
          )}
        </div>

        {/* Page Switcher */}
        <div className="flex bg-[#08172C] p-0.5 rounded-lg border border-[#1A3A66]">
          <button
            onClick={() => setActivePage('wall')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors ${
              activePage === 'wall'
                ? 'bg-[#F5A623] text-[#0A1830]'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Radar</span>
          </button>
          <button
            onClick={() => setActivePage('operations')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors ${
              activePage === 'operations'
                ? 'bg-[#F5A623] text-[#0A1830]'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Team & Ops</span>
          </button>
        </div>
      </div>

      {/* Center: Mode Switcher, Provider Health, Clock & Controls */}
      <div className="flex items-center space-x-3">
        {/* Mode Selector */}
        <div className="flex items-center bg-[#08172C] p-0.5 rounded-lg border border-[#F5A623]/60 space-x-1">
          <span className="text-[10px] font-mono uppercase px-1.5 text-[#F5A623] font-bold">MODE:</span>
          {(['LIVE_OBSERVE', 'REPLAY', 'WHAT_IF', 'FIXTURE_SIMULATION'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                dataMode === m
                  ? m === 'LIVE_OBSERVE'
                    ? 'bg-emerald-500 text-[#0A1830]'
                    : m === 'REPLAY'
                    ? 'bg-amber-500 text-[#0A1830]'
                    : m === 'WHAT_IF'
                    ? 'bg-purple-500 text-[#FFFFFF]'
                    : 'bg-[#F5A623] text-[#0A1830]'
                  : 'text-[#FFFFFF]/60 hover:text-[#FFFFFF]'
              }`}
              title={`Switch operational mode to ${m}`}
            >
              {m === 'LIVE_OBSERVE' ? 'LIVE' : m === 'REPLAY' ? 'REPLAY' : m === 'WHAT_IF' ? 'WHAT-IF' : 'FIXTURE'}
            </button>
          ))}
        </div>

        {/* Provider Health Badges */}
        {providerHealth && providerHealth.length > 0 && (
          <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-[#0F2444] border border-[#1A3A66] text-[10px] font-mono">
            {providerHealth.map((p) => (
              <span
                key={p.provider}
                className={`px-1.5 py-0.2 rounded font-bold ${
                  p.status === 'ONLINE'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/20 text-rose-400'
                }`}
                title={`${p.provider}: ${p.status} (${p.endpoint})`}
              >
                {p.provider.includes('WEATHER') ? 'NOAA' : 'ADS-B'}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center space-x-2 px-3 py-1 rounded bg-[#0F2444] border border-[#F5A623]/40 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-[#F5A623]" />
          <span className="font-bold text-[#FFFFFF]">{timeStr}</span>
        </div>

        {/* Quick Fog & Weather Phase Switcher */}
        <div className="flex items-center bg-[#08172C] p-0.5 rounded-lg border border-[#F5A623]/50 space-x-1">
          <button
            onClick={() => triggerFog('CLEAR')}
            className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
              weather && !weather.lvp.active
                ? 'bg-[#0F2444] text-[#FFFFFF] border border-[#F5A623]/40'
                : 'text-[#FFFFFF]/60 hover:text-[#FFFFFF]'
            }`}
            title="Set Clear Weather (VFR 6000m)"
          >
            Clear
          </button>
          <button
            onClick={() => triggerFog('FOG')}
            className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
              weather && weather.lvp.active && weather.visibilityM > 500
                ? 'bg-[#F5A623] text-[#0A1830]'
                : 'text-[#F5A623] hover:bg-[#0F2444]'
            }`}
            title="Set Moderate Fog (800m · LVP Preparation)"
          >
            Fog 800m
          </button>
          <button
            onClick={() => triggerFog('DENSE_FOG')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold flex items-center space-x-1 transition-all ${
              weather && weather.lvp.active && weather.visibilityM <= 500
                ? 'bg-[#F5A623] text-[#0A1830] '
                : 'bg-[#0F2444] hover:bg-[#F5A623] text-[#F5A623] hover:text-[#0A1830]'
            }`}
            title="Instantly jump simulation to Dense Fog LVP (350m · CAT IIIB · UAE231 Priority)"
          >
            <CloudFog className="w-3.5 h-3.5" />
            <span>{weather && weather.visibilityM <= 500 ? 'Dense fog on' : 'Dense fog'}</span>
          </button>
        </div>

        <button
          onClick={() => resetSim()}
          className="p-1.5 rounded bg-[#0F2444] hover:bg-[#142E55] text-[#FFFFFF] border border-[#1A3A66] transition-colors"
          title="Reset Simulation Scenario"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Controller Profile Selector & Connection Indicator */}
      <div className="flex items-center space-x-4">
        {/* Active Controller Selector */}
        <div className="flex items-center space-x-2">
          <Users className="w-3.5 h-3.5 text-[#F5A623]" />
          <span className="text-[11px] font-mono text-[#FFFFFF]/80">Console:</span>
          <select
            value={activeControllerId}
            onChange={(e) => handleControllerChange(e.target.value)}
            className="bg-[#0F2444] border border-[#F5A623]/50 text-xs font-mono font-bold text-[#FFFFFF] rounded px-2.5 py-1 focus:outline-none focus:border-[#F5A623]"
          >
            <option value="ALL">All (overview)</option>
            {controllers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id.replace('CTRL-', '')} - {c.role})
              </option>
            ))}
          </select>
        </div>

        {/* WebSocket Live Status */}
        <div className="flex items-center space-x-1.5 pl-3 border-l border-[#1A3A66]">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-[10px] font-mono text-[#FFFFFF]/80">
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  );
};
