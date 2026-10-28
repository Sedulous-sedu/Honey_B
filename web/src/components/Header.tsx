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

  return (
    <header className="h-14 bg-[#090F1B] border-b border-[#162338] px-4 flex items-center justify-between select-none">
      {/* Left: Brand & Navigation */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🐝</span>
          <span className="font-mono font-bold text-sm tracking-wider text-white">
            HONEY B <span className="text-blue-400">GROUND CONTROL</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            OMDB
          </span>
        </div>

        {/* Page Switcher */}
        <div className="flex bg-[#0D1526] p-0.5 rounded-lg border border-[#1A2C4A]">
          <button
            onClick={() => setActivePage('wall')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors ${
              activePage === 'wall'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Radar Wall (P1)</span>
          </button>
          <button
            onClick={() => setActivePage('operations')}
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors ${
              activePage === 'operations'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Team & Ops (P2)</span>
          </button>
        </div>
      </div>

      {/* Center: Live UTC Clock & Scenario Quick Controls */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 px-3 py-1 rounded bg-[#0D1526] border border-[#1A2C4A] text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-bold text-cyan-300">{timeStr}</span>
        </div>

        {/* Quick Fog Trigger */}
        <button
          onClick={() => triggerFog('DENSE_FOG')}
          className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition-all ${
            weather?.lvp.active
              ? 'bg-amber-600 text-white shadow-amber-600/30'
              : 'bg-[#121E36] hover:bg-amber-900/40 text-amber-300 border border-amber-600/40'
          }`}
          title="Instantly jump simulation to Dense Fog LVP"
        >
          <CloudFog className="w-3.5 h-3.5" />
          <span>{weather?.lvp.active ? 'FOG ACTIVE' : 'TRIGGER FOG'}</span>
        </button>

        <button
          onClick={() => resetSim()}
          className="p-1.5 rounded bg-[#121E36] hover:bg-[#1A2C4A] text-slate-300 border border-[#233552] transition-colors"
          title="Reset Simulation Scenario"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: Controller Profile Selector & Connection Indicator */}
      <div className="flex items-center space-x-4">
        {/* Active Controller Selector */}
        <div className="flex items-center space-x-2">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-mono text-slate-400">CONSOLE:</span>
          <select
            value={activeControllerId}
            onChange={(e) => setActiveControllerId(e.target.value)}
            className="bg-[#0D1526] border border-[#233552] text-xs font-mono font-bold text-cyan-300 rounded px-2.5 py-1 focus:outline-none focus:border-cyan-400"
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
        <div className="flex items-center space-x-1.5 pl-3 border-l border-[#1A2C4A]">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <span className="text-[10px] font-mono text-slate-400">
            {connected ? 'LIVE WS 1Hz' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </header>
  );
};
