import React from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { Plane, Fuel as FuelIcon, Clock, Compass, ShieldAlert } from 'lucide-react';

export const FlightDetail: React.FC = () => {
  const selectedId = useAtcStore((s) => s.selectedAircraftId);
  const aircraft = useAtcStore((s) => s.aircraft);
  const commands = useAtcStore((s) => s.commands);
  const reassignController = useAtcStore((s) => s.reassignController);
  const controllers = useAtcStore((s) => s.controllers);

  const ac = selectedId ? aircraft[selectedId] : null;
  if (!ac) return null;

  const acCommands = commands.filter((c) => c.aircraftId === ac.callsign);
  const fuelMargin = ac.fuel.totalKg - ac.fuel.finalReserveKg;

  return (
    <div className="bg-[#0B1322] border-t border-[#162338] p-3 flex items-center justify-between select-none shadow-2xl">
      {/* Flight Main Header */}
      <div className="flex items-center space-x-4 border-r border-[#1B2940] pr-6">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <Plane className="w-5 h-5 transform -rotate-45" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-base font-bold text-white">{ac.callsign}</span>
            <span className="font-mono text-xs text-slate-400">{ac.aircraftType} ({ac.wakeCategory})</span>
            <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {ac.flightPhase}
            </span>
            {ac.priority.level !== 'NORMAL' && (
              <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                {ac.priority.level}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 font-mono mt-0.5">
            {ac.origin} → {ac.destination} · SQUAWK: {ac.squawk || '4211'} · ICAO24: {ac.icao24 || '8961B2'}
          </div>
        </div>
      </div>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-5 gap-6 text-xs font-mono border-r border-[#1B2940] pr-6">
        <div>
          <div className="text-[10px] text-slate-500 uppercase flex items-center space-x-1">
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>Alt / Hdg</span>
          </div>
          <div className="font-bold text-slate-200 mt-0.5">
            {ac.altitudeFt} ft · {ac.headingDeg}°
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 uppercase flex items-center space-x-1">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Speed / Dist</span>
          </div>
          <div className="font-bold text-slate-200 mt-0.5">
            {Math.round(ac.speed.groundSpeedKt)} kt · {Math.round(ac.position.distanceToThresholdNm)} NM
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 uppercase">Runway / Stand</div>
          <div className="font-bold text-slate-200 mt-0.5">
            RWY {ac.assignedRunway || '30L'} · Stand {ac.assignedStand || 'B14'}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 uppercase flex items-center space-x-1">
            <FuelIcon className="w-3 h-3 text-amber-400" />
            <span>Fuel Remaining</span>
          </div>
          <div className={`font-bold mt-0.5 ${ac.fuel.enduranceMin < 45 ? 'text-rose-400' : 'text-slate-200'}`}>
            {Math.round(ac.fuel.totalKg)} kg ({Math.round(ac.fuel.enduranceMin)} min)
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-500 uppercase">LVP Minima</div>
          <div className="font-bold text-slate-200 mt-0.5">
            {ac.capability.lvpApproach}
          </div>
        </div>
      </div>

      {/* Controller Assignment Switcher */}
      <div className="flex items-center space-x-3">
        <div className="text-right">
          <div className="text-[10px] font-mono text-slate-400">ASSIGNED CONTROLLER</div>
          <select
            value={ac.assignedControllerId || ''}
            onChange={(e) => reassignController(ac.callsign, e.target.value)}
            className="mt-0.5 bg-[#121B2D] border border-[#233552] text-xs font-mono font-bold text-cyan-300 rounded px-2 py-1 focus:outline-none"
          >
            {controllers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id.replace('CTRL-', '')})
              </option>
            ))}
          </select>
        </div>

        {/* Latest Command Status Chip */}
        {acCommands.length > 0 && (
          <div className="pl-3 border-l border-[#1B2940] text-right">
            <div className="text-[10px] font-mono text-slate-400">LAST CLEARANCE</div>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="text-xs font-mono font-bold text-slate-200">{acCommands[0].commandId}:</span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                  acCommands[0].status === 'DONE'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : acCommands[0].status === 'EXECUTING'
                    ? 'bg-cyan-500/20 text-cyan-300 animate-pulse'
                    : acCommands[0].status === 'ACKNOWLEDGED'
                    ? 'bg-blue-500/20 text-blue-300'
                    : acCommands[0].status === 'UNABLE'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {acCommands[0].status}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
