import React, { useState } from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { Users, Radio, ShieldAlert, Clock, Gauge, CloudFog, RotateCcw, AlertTriangle } from 'lucide-react';

export const Page2Operations: React.FC = () => {
  const controllers = useAtcStore((s) => s.controllers);
  const commands = useAtcStore((s) => s.commands);
  const stands = useAtcStore((s) => s.stands);
  const metrics = useAtcStore((s) => s.metrics);
  const aircraft = useAtcStore((s) => s.aircraft);
  const weather = useAtcStore((s) => s.weather);
  const simSpeed = useAtcStore((s) => s.simSpeed);
  const setSpeed = useAtcStore((s) => s.setSpeed);
  const triggerFog = useAtcStore((s) => s.triggerFog);
  const resetSim = useAtcStore((s) => s.resetSim);
  const reassignStand = useAtcStore((s) => s.reassignStand);

  const [selectedStand, setSelectedStand] = useState<string | null>(null);
  const [reassignFlight, setReassignFlight] = useState('');

  const allFlights = Object.values(aircraft);

  const handleStandReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStand || !reassignFlight) return;
    await reassignStand(reassignFlight, selectedStand);
    setSelectedStand(null);
    setReassignFlight('');
  };

  return (
    <div className="flex-1 flex flex-col bg-[#070B12] overflow-y-auto p-4 space-y-4 select-none">
      {/* Top Scenario Control Bar */}
      <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-300">
            <Gauge className="w-4 h-4 text-cyan-400" />
            <span>SCENARIO CONTROLLER:</span>
          </div>

          {/* Fog Phases */}
          <div className="flex space-x-1.5">
            {['CLEAR', 'MIST', 'FOG', 'DENSE_FOG', 'IMPROVING', 'LIFTING'].map((p) => (
              <button
                key={p}
                onClick={() => triggerFog(p)}
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-colors ${
                  weather?.lvp.phase === p || (p === 'DENSE_FOG' && weather?.lvp.phase === 'LVP_ACTIVE')
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-[#121B2D] hover:bg-[#1A2C4A] text-slate-300 border border-[#233552]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Speed Controls & Reset */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-[#121B2D] p-1 rounded-lg border border-[#233552]">
            <span className="text-[10px] font-mono text-slate-400 px-2">SIM SPEED:</span>
            {[1.0, 2.0, 4.0].map((spd) => (
              <button
                key={spd}
                onClick={() => setSpeed(spd)}
                className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                  simSpeed === spd ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            onClick={() => resetSim()}
            className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET SCENARIO</span>
          </button>
        </div>
      </div>

      {/* Operations Metrics Comparison Bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>DELAY OPTIMIZATION</span>
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="flex items-baseline space-x-2 mt-2">
            <span className="text-2xl font-mono font-bold text-emerald-400">
              {metrics.delayedMinutes} min
            </span>
            <span className="text-xs font-mono text-slate-500 line-through">
              {metrics.fcfsBaselineDelayMin} min FCFS
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Honey B active sequencing reduced airport delay by ~{Math.max(0, Math.round(metrics.fcfsBaselineDelayMin - metrics.delayedMinutes))} min.
          </p>
        </div>

        <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>CONFLICTS MITIGATED</span>
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400 mt-2">
            {metrics.conflictsAvoided}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Proactive spacing & hold advisories issued before minimum loss.
          </p>
        </div>

        <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>CRITICAL FUEL / DIVERSIONS</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-rose-400 mt-2">
            {metrics.atRiskCount} Flights
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            FDB512 low-reserve & IGO1433 CAT I limit under active surveillance.
          </p>
        </div>

        <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3 shadow-lg">
          <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span>COMMANDS LOGGED</span>
            <Radio className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-purple-400 mt-2">
            {commands.length}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Full lifecycle tracking with monotonic revisions.
          </p>
        </div>
      </div>

      {/* Main Grid: Team Roster (Left) & Stand Allocation (Center) & Command Feed (Right) */}
      <div className="grid grid-cols-3 gap-4 flex-1">
        {/* Column 1: Controller Roster & Workload */}
        <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3.5 flex flex-col shadow-xl">
          <div className="flex items-center space-x-2 border-b border-[#1A2C4A] pb-2 mb-3">
            <Users className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              Controller Roster & Workload
            </h2>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto">
            {controllers.map((ctrl) => {
              const myFlights = allFlights.filter((a) => a.assignedControllerId === ctrl.id);
              const count = myFlights.length;
              const isHighWorkload = count >= 8;

              return (
                <div key={ctrl.id} className="p-3 rounded-lg bg-[#111A2D] border border-[#1E2E4A]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-white">{ctrl.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {ctrl.id}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">
                        {ctrl.role} · FREQ: {ctrl.frequency} MHz
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-xs font-mono font-bold ${isHighWorkload ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {count} Flights
                      </span>
                      <div className="w-16 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full ${isHighWorkload ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (count / 10) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* List of aircraft assigned */}
                  <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-[#19273F]">
                    {myFlights.map((f) => (
                      <span
                        key={f.callsign}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#16233B] text-slate-300 border border-[#233552]"
                      >
                        {f.callsign}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Stand Allocation Board */}
        <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3.5 flex flex-col shadow-xl">
          <div className="flex items-center justify-between border-b border-[#1A2C4A] pb-2 mb-3">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              OMDB Stand Allocation ({stands.length})
            </h2>
            <div className="flex space-x-2 text-[10px] font-mono">
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-slate-400">Free</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-slate-400">Occupied</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-slate-400">Blocked</span>
              </span>
            </div>
          </div>

          {/* Stand Grid */}
          <div className="grid grid-cols-4 gap-2 flex-1 overflow-y-auto">
            {stands.map((st) => {
              let bg = 'bg-[#111A2D] border-[#1E2E4A] text-slate-300';
              let badgeColor = 'text-emerald-400';

              if (st.status === 'BLOCKED') {
                bg = 'bg-rose-950/20 border-rose-500/60 text-rose-200';
                badgeColor = 'text-rose-400';
              } else if (st.status === 'OCCUPIED') {
                bg = 'bg-[#14233D] border-cyan-500/50 text-cyan-100';
                badgeColor = 'text-cyan-400';
              } else if (st.status === 'RESERVED') {
                bg = 'bg-purple-950/20 border-purple-500/50 text-purple-200';
                badgeColor = 'text-purple-400';
              }

              return (
                <div
                  key={st.id}
                  onClick={() => setSelectedStand(st.id)}
                  className={`p-2 rounded-lg border cursor-pointer hover:scale-[1.02] transition-all flex flex-col justify-between ${bg}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold">{st.id}</span>
                    <span className="text-[9px] font-mono text-slate-500">{st.size}</span>
                  </div>

                  <div className="mt-1">
                    <span className={`text-[10px] font-mono font-bold block truncate ${badgeColor}`}>
                      {st.currentAircraft || st.status}
                    </span>
                    <span className="text-[9px] text-slate-400 truncate block">
                      {st.terminal.split(',')[1] || st.terminal}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Reassignment Modal / Drawer */}
          {selectedStand && (
            <form onSubmit={handleStandReassignSubmit} className="mt-3 p-2.5 rounded-lg bg-[#14233D] border border-cyan-500/40 text-xs">
              <div className="font-mono font-bold text-cyan-300 mb-1.5">
                Reassign to Stand {selectedStand}
              </div>
              <div className="flex space-x-2">
                <select
                  value={reassignFlight}
                  onChange={(e) => setReassignFlight(e.target.value)}
                  className="flex-1 bg-[#090F1C] border border-[#233552] text-xs font-mono text-slate-200 rounded px-2 py-1"
                >
                  <option value="">Select arriving flight...</option>
                  {allFlights.map((f) => (
                    <option key={f.callsign} value={f.callsign}>
                      {f.callsign} ({f.aircraftType}) - Currently: {f.assignedStand || 'None'}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!reassignFlight}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-mono font-bold rounded"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStand(null)}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white font-mono rounded"
                >
                  ✕
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Column 3: Live Command Lifecycle Feed */}
        <div className="bg-[#0D1526] border border-[#1A2C4A] rounded-xl p-3.5 flex flex-col shadow-xl">
          <div className="flex items-center justify-between border-b border-[#1A2C4A] pb-2 mb-3">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              Live Command Feed ({commands.length})
            </h2>
            <span className="text-[10px] font-mono text-slate-400">AUTHORITATIVE</span>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            {commands.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 font-mono">
                No clearances issued yet.
              </div>
            ) : (
              commands.map((cmd) => {
                let statusBg = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                if (cmd.status === 'DONE') statusBg = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                else if (cmd.status === 'EXECUTING') statusBg = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse';
                else if (cmd.status === 'ACKNOWLEDGED') statusBg = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
                else if (cmd.status === 'UNABLE') statusBg = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                else if (cmd.status === 'SUPERSEDED') statusBg = 'bg-slate-700/50 text-slate-400 border-slate-600/40';

                return (
                  <div key={cmd.commandId} className="p-2.5 rounded-lg bg-[#111A2D] border border-[#1E2E4A] text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-white">{cmd.commandId}</span>
                        <span className="font-mono text-cyan-300">{cmd.aircraftId}</span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${statusBg}`}>
                        {cmd.status}
                      </span>
                    </div>

                    <p className="font-sans text-slate-200 mt-1 text-[11px]">
                      {cmd.displayText}
                    </p>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1.5 pt-1 border-t border-[#17253D]">
                      <span>BY: {cmd.controllerName} ({cmd.controllerId.replace('CTRL-', '')})</span>
                      <span>{cmd.issuedAt.slice(11, 19)} UTC</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
