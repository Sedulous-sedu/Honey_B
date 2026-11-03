import React from 'react';
import { useAtcStore, resolveSelectedAircraft } from '../store/useAtcStore';
import { Fuel as FuelIcon, Clock, Compass } from 'lucide-react';
import { AirlineLogo } from './AirlineLogo';

export const FlightDetail: React.FC = () => {
  const selectedId = useAtcStore((s) => s.selectedAircraftId);
  const aircraft = useAtcStore((s) => s.aircraft);
  const commands = useAtcStore((s) => s.commands);
  const reassignController = useAtcStore((s) => s.reassignController);
  const controllers = useAtcStore((s) => s.controllers);
  const forkScenario = useAtcStore((s) => s.forkScenario);
  const dataMode = useAtcStore((s) => s.dataMode);

  const ac = resolveSelectedAircraft(aircraft, selectedId);
  if (!ac) return null;

  const isLiveOrReplay = dataMode === 'LIVE_OBSERVE' || dataMode === 'REPLAY';
  const acCommands = commands.filter(
    (c) => c.aircraftId === ac.callsign || (ac.trackId && c.aircraftId === ac.trackId)
  );
  const airline = ac.identity?.operatingAirline ?? null;
  const observedCallsign = ac.identity?.callsignObserved || (ac.callsign.startsWith('HEX-') || ac.callsign.startsWith('ICAO-') ? null : ac.callsign);
  const displayCallsign = observedCallsign || `ICAO ${ac.icao24?.toUpperCase() || ac.callsign}`;
  const distRefLabel = ac.position.distanceReference === 'OMDB_ARP' ? 'NM to OMDB ARP' : 'NM to RWY THR';

  return (
    <div className={`bg-[#0A1830] border ${ac.priority.level !== 'NORMAL' ? 'border-red-500 border-2' : 'border-[#F5A623]/40'} rounded-xl p-3 flex items-center justify-between select-none shadow-2xl text-[#FFFFFF]`}>
      {/* Flight Main Header */}
      <div className="flex items-center space-x-3.5 border-r border-[#1A3A66] pr-5">
        <AirlineLogo airline={airline} size="lg" />
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono text-base font-bold text-[#FFFFFF]">{displayCallsign}</span>
            <span className="font-mono text-xs text-[#FFFFFF]/80">
              {ac.aircraftType || 'UNKNOWN'} ({ac.wakeCategory || 'UNKNOWN'})
            </span>
            <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold rounded bg-[#F5A623] text-[#0A1830]">
              {ac.flightPhase}
            </span>
            {ac.priority.level !== 'NORMAL' && (
              <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold rounded bg-rose-500 text-[#FFFFFF] animate-pulse">
                {ac.priority.level}
              </span>
            )}
          </div>
          <div className="text-xs text-[#FFFFFF]/80 font-mono mt-0.5 flex items-center flex-wrap gap-x-2">
            <span className="text-[#F5A623] font-bold">
              {airline?.name || (ac.inferredFlightClass === 'SURFACE_VEHICLE' ? 'Surface / Airport Ops' : 'Unmatched / Civil Operator')}
            </span>
            <span>·</span>
            <span>{ac.origin || 'UNKNOWN'} → {ac.destination || 'UNKNOWN'}</span>
            {ac.registration && (
              <>
                <span>·</span>
                <span>REG: {ac.registration}</span>
              </>
            )}
            <span>·</span>
            <span>SQUAWK: {ac.squawk || 'UNKNOWN'}</span>
            <span>·</span>
            <span>ICAO24: {ac.icao24 ? ac.icao24.toUpperCase() : 'UNKNOWN'}</span>
          </div>
          {ac.identity && (
            <div className="text-[10px] font-mono text-[#FFFFFF]/60 mt-0.5 flex items-center space-x-2">
              <span>
                IATA Flight #: {ac.identity.flightNumberIata || `UNAVAILABLE (${ac.identity.flightNumberStatus})`}
              </span>
              <span>·</span>
              <span>ID Source: {ac.identity.identitySource}</span>
            </div>
          )}
        </div>
      </div>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-5 gap-5 text-xs font-mono border-r border-[#1A3A66] pr-5">
        <div>
          <div className="text-[10px] text-[#F5A623] uppercase flex items-center space-x-1">
            <Compass className="w-3 h-3 text-[#F5A623]" />
            <span>Alt / Hdg</span>
          </div>
          <div className="font-bold text-[#FFFFFF] mt-0.5">
            {ac.altitudeFt} ft · {Math.round(ac.headingDeg)}°
          </div>
        </div>

        <div>
          <div className="text-[10px] text-[#F5A623] uppercase flex items-center space-x-1">
            <Clock className="w-3 h-3 text-[#F5A623]" />
            <span>GS / Distance</span>
          </div>
          <div className="font-bold text-[#FFFFFF] mt-0.5">
            {Math.round(ac.speed.groundSpeedKt)} kt · {ac.position.distanceToThresholdNm.toFixed(1)} {distRefLabel}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-[#F5A623] uppercase flex items-center space-x-1">
            <span>Runway / Stand</span>
            <span className="text-[9px] px-1 rounded bg-[#0F2444] text-[#93c5fd] font-bold">
              {ac.assignedStand ? 'ASSIGNED' : 'UNKNOWN'}
            </span>
          </div>
          <div className="font-bold text-[#FFFFFF] mt-0.5">
            RWY {ac.assignedRunway || 'UNASSIGNED'} · Stand {ac.assignedStand || 'UNKNOWN'}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-[#F5A623] uppercase flex items-center space-x-1">
            <FuelIcon className="w-3 h-3 text-[#F5A623]" />
            <span>Fuel Remaining</span>
            <span
              className={`text-[9px] px-1 rounded font-bold ${
                ac.fuel.provenance === 'UNKNOWN'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {ac.fuel.provenance}
            </span>
          </div>
          <div className={`font-bold mt-0.5 ${ac.fuel.enduranceMin && ac.fuel.enduranceMin < 45 ? 'text-[#F5A623]' : 'text-[#FFFFFF]'}`}>
            {ac.fuel.totalKg && ac.fuel.totalKg > 0 && ac.fuel.enduranceMin
              ? `${Math.round(ac.fuel.totalKg)} kg (${Math.round(ac.fuel.enduranceMin)} min)`
              : 'UNKNOWN (Not in ADS-B)'}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-[#F5A623] uppercase">LVP Minima</div>
          <div className="font-bold text-[#FFFFFF] mt-0.5">
            {ac.capability.missingDataReasons && ac.capability.missingDataReasons.length > 0
              ? 'UNKNOWN (Not in ADS-B)'
              : ac.capability.lvpApproach}
          </div>
        </div>
      </div>

      {/* Controller Assignment Switcher & WHAT-IF Fork */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => forkScenario(`What-If for ${displayCallsign}`, `Forked scenario from flight ${displayCallsign}`)}
          className="px-2.5 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 text-xs font-mono font-bold flex items-center space-x-1 transition-all"
          title="Fork into an isolated WHAT-IF sandbox with independent clock and fuel/emergency injection"
        >
          <span>Fork WHAT-IF</span>
        </button>

        <div className="text-right">
          <div className="text-[10px] font-mono text-[#F5A623]">ASSIGNED CONTROLLER</div>
          {isLiveOrReplay ? (
            <div className="mt-0.5 bg-[#0F2444] border border-[#1A3A66] text-[11px] font-mono font-bold text-[#FFFFFF]/75 rounded px-2 py-1">
              {ac.assignedControllerId || 'UNASSIGNED (LIVE)'}
            </div>
          ) : (
            <select
              value={ac.assignedControllerId || ''}
              onChange={(e) => reassignController(ac.callsign, e.target.value)}
              className="mt-0.5 bg-[#0F2444] border border-[#F5A623]/50 text-xs font-mono font-bold text-[#FFFFFF] rounded px-2 py-1 focus:outline-none focus:border-[#F5A623]"
            >
              {controllers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id.replace('CTRL-', '')})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Latest Command Status Chip */}
        {acCommands.length > 0 && (
          <div className="pl-3 border-l border-[#1A3A66] text-right">
            <div className="text-[10px] font-mono text-[#F5A623]">LAST CLEARANCE</div>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="text-xs font-mono font-bold text-[#FFFFFF]">{acCommands[0].commandId}:</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#F5A623] text-[#0A1830]">
                {acCommands[0].status}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
