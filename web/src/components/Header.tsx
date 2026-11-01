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
    <header className="h-14 bg-[#0B1F3A] border-b border-[#1E4478] px-4 flex items-center justify-between select-none shadow-md">
      {/* Left: Brand & Navigation */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2.5">
          {/* Exact same Honey B logo image used in Pilot App */}
          <img
            src="/honey-b-logo.jpg"
            alt="Honey B logo"
            className="w-9 h-9 rounded-lg bg-[#FFFFFF] p-0.5 object-contain border border-[#F5A623] shadow-sm"
            draggable={false}
          />
          <span className="font-mono font-bold text-sm tracking-wider text-[#FFFFFF]">
            HONEY B <span className="text-[#F5A623]">GROUND CONTROL</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#102A4C] text-[#FFFFFF] border border-[#F5A623]/40">
            OMDB
          </span>
          {activeControllerId === 'ALL' ? (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#102A4C] text-[#F5A623] border border-[#F5A623]/50">
              OVERVIEW WALL (SUPERVISOR)
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#102A4C] text-[#F5A623] border border-[#F5A623] flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623] animate-pulse"></span>
              <span>SECTOR: {activeController?.name.toUpperCase()} ({activeControllerId.replace('CTRL-', '')})</span>
            </span>
          )}
        </div>

        {/* Page Switcher */}
        <div className="flex bg-[#08172C] p-0.5 rounded-lg border border-[#1E4478]">
          <button
            onClick={() => setActivePage('wall')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors ${
              activePage === 'wall'
                ? 'bg-[#F5A623] text-[#0B1F3A] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Radar Wall (P1)</span>
          </button>
          <button
            onClick={() => setActivePage('operations')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors ${
              activePage === 'operations'
                ? 'bg-[#F5A623] text-[#0B1F3A] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Team & Ops (P2)</span>
          </button>
        </div>
      </div>

      {/* Center: Live UTC Clock & Scenario Quick Controls */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 px-3 py-1 rounded bg-[#102A4C] border border-[#F5A623]/40 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-[#F5A623]" />
          <span className="font-bold text-[#FFFFFF]">{timeStr}</span>
        </div>

        {/* Quick Fog & Weather Phase Switcher */}
        <div className="flex items-center bg-[#08172C] p-0.5 rounded-lg border border-[#F5A623]/50 space-x-1">
          <button
            onClick={() => triggerFog('CLEAR')}
            className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
              weather && !weather.lvp.active
                ? 'bg-[#102A4C] text-[#FFFFFF] border border-[#F5A623]/40'
                : 'text-[#FFFFFF]/60 hover:text-[#FFFFFF]'
            }`}
            title="Set Clear Weather (VFR 6000m)"
          >
            ☀ CLEAR
          </button>
          <button
            onClick={() => triggerFog('FOG')}
            className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
              weather && weather.lvp.active && weather.visibilityM > 500
                ? 'bg-[#F5A623] text-[#0B1F3A] shadow-md'
                : 'text-[#F5A623] hover:bg-[#102A4C]'
            }`}
            title="Set Moderate Fog (800m · LVP Preparation)"
          >
            ☁ FOG 800m
          </button>
          <button
            onClick={() => triggerFog('DENSE_FOG')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold flex items-center space-x-1 transition-all ${
              weather && weather.lvp.active && weather.visibilityM <= 500
                ? 'bg-[#F5A623] text-[#0B1F3A] shadow-md animate-pulse'
                : 'bg-[#102A4C] hover:bg-[#F5A623] text-[#F5A623] hover:text-[#0B1F3A]'
            }`}
            title="Instantly jump simulation to Dense Fog LVP (350m · CAT IIIB · UAE231 Priority)"
          >
            <CloudFog className="w-3.5 h-3.5" />
            <span>{weather && weather.visibilityM <= 500 ? 'DENSE FOG ACTIVE' : 'TRIGGER DENSE FOG'}</span>
          </button>
        </div>

        <button
          onClick={() => resetSim()}
          className="p-1.5 rounded bg-[#102A4C] hover:bg-[#163763] text-[#FFFFFF] border border-[#1E4478] transition-colors"
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
          <span className="text-[11px] font-mono text-[#FFFFFF]/80">CONSOLE:</span>
          <select
            value={activeControllerId}
            onChange={(e) => handleControllerChange(e.target.value)}
            className="bg-[#102A4C] border border-[#F5A623]/50 text-xs font-mono font-bold text-[#FFFFFF] rounded px-2.5 py-1 focus:outline-none focus:border-[#F5A623]"
          >
            <option value="ALL">ALL (Overview Wall)</option>
            {controllers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id.replace('CTRL-', '')} - {c.role})
              </option>
            ))}
          </select>
        </div>

        {/* WebSocket Live Status */}
        <div className="flex items-center space-x-1.5 pl-3 border-l border-[#1E4478]">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-[#F5A623] animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-[10px] font-mono text-[#FFFFFF]/80">
            {connected ? 'LIVE WS 1Hz' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </header>
  );
};
