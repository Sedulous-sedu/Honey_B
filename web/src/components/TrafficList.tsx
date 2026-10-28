import React from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { Aircraft } from '../types';

export const TrafficList: React.FC = () => {
  const aircraft = useAtcStore((s) => s.aircraft);
  const selectedId = useAtcStore((s) => s.selectedAircraftId);
  const setSelectedId = useAtcStore((s) => s.setSelectedAircraftId);
  const trafficFilter = useAtcStore((s) => s.trafficFilter);
  const setTrafficFilter = useAtcStore((s) => s.setTrafficFilter);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);

  const allFlights = Object.values(aircraft);

  const arrFlights = allFlights.filter((a) =>
    ['ARRIVAL', 'APPROACH', 'FINAL', 'HOLDING'].includes(a.flightPhase)
  );
  const depFlights = allFlights.filter((a) =>
    ['DEPARTURE', 'TAXI_OUT'].includes(a.flightPhase)
  );
  const otherFlights = allFlights.filter((a) =>
    ['PARKED', 'AT_STAND', 'TAXI_IN', 'LANDED', 'DIVERTING'].includes(a.flightPhase)
  );

  const filteredFlights =
    trafficFilter === 'ARR'
      ? arrFlights
      : trafficFilter === 'DEP'
      ? depFlights
      : trafficFilter === 'OTHER'
      ? otherFlights
      : allFlights;

  return (
    <div className="w-80 h-full bg-[#0B0F19] border-r border-[#162338] flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#162338] bg-[#0E1524]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-mono font-bold tracking-widest text-slate-300 uppercase">Air Traffic</h2>
          <span className="text-[11px] font-mono text-cyan-400 font-bold">{allFlights.length} TRACKS</span>
        </div>

        {/* Filter Tabs matching the image */}
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#070B12] rounded border border-[#162338]">
          <button
            onClick={() => setTrafficFilter('ALL')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              trafficFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ALL ({allFlights.length})
          </button>
          <button
            onClick={() => setTrafficFilter('ARR')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              trafficFilter === 'ARR'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ARR ({arrFlights.length})
          </button>
          <button
            onClick={() => setTrafficFilter('DEP')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              trafficFilter === 'DEP'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DEP ({depFlights.length})
          </button>
          <button
            onClick={() => setTrafficFilter('OTHER')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              trafficFilter === 'OTHER'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            OTH ({otherFlights.length})
          </button>
        </div>
      </div>

      {/* Flight Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#131E30]">
        {filteredFlights.map((ac) => {
          const isSelected = selectedId === ac.callsign;
          const isAssignedToMe = activeControllerId === 'ALL' || ac.assignedControllerId === activeControllerId;

          const isArr = ['ARRIVAL', 'APPROACH', 'FINAL', 'HOLDING'].includes(ac.flightPhase);
          const isDep = ['DEPARTURE', 'TAXI_OUT'].includes(ac.flightPhase);

          // Priority indicator border
          let priorityBorder = 'border-transparent';
          if (ac.priority.level === 'MINIMUM_FUEL' || ac.priority.level === 'EMERGENCY') {
            priorityBorder = 'border-l-4 border-l-rose-500 bg-rose-950/10';
          } else if (ac.priority.level === 'MEDICAL') {
            priorityBorder = 'border-l-4 border-l-pink-500 bg-pink-950/10';
          } else if (ac.status === 'UNABLE_TO_LAND' || ac.flightPhase === 'DIVERTING') {
            priorityBorder = 'border-l-4 border-l-amber-500 bg-amber-950/10';
          }

          // Distance or ground status label matching photo
          let statusText = `${Math.round(ac.position.distanceToThresholdNm)} nm`;
          let statusColor = 'text-slate-300';

          if (ac.flightPhase === 'HOLDING') {
            statusText = 'HOLDING';
            statusColor = 'text-amber-400 font-bold';
          } else if (ac.flightPhase === 'DIVERTING') {
            statusText = 'DIVERT';
            statusColor = 'text-amber-400 font-bold';
          } else if (ac.flightPhase === 'TAXI_OUT') {
            statusText = 'TAXI';
            statusColor = 'text-emerald-400';
          } else if (ac.flightPhase === 'PARKED') {
            statusText = 'PUSH 12m';
            statusColor = 'text-amber-400';
          } else if (ac.flightPhase === 'DEPARTURE' && ac.altitudeFt < 200) {
            statusText = 'LINE UP';
            statusColor = 'text-cyan-400';
          } else if (ac.flightPhase === 'LANDED') {
            statusText = 'LANDED';
            statusColor = 'text-emerald-400 font-bold';
          }

          return (
            <div
              key={ac.callsign}
              onClick={() => setSelectedId(ac.callsign)}
              className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-[#152338] ring-1 ring-cyan-500/50'
                  : 'hover:bg-[#10192A]'
              } ${priorityBorder} ${!isAssignedToMe ? 'opacity-40 hover:opacity-80' : 'opacity-100'}`}
            >
              {/* Left: Callsign & Type */}
              <div className="flex items-center space-x-2">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-xs font-bold text-slate-100">{ac.callsign}</span>
                    <span className="text-[10px] font-mono text-slate-400">{ac.aircraftType}</span>
                  </div>
                  <div className="flex items-center space-x-1 mt-0.5">
                    <span
                      className={`text-[9px] font-bold px-1 py-0.2 rounded font-mono ${
                        isArr
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : isDep
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {isArr ? 'ARR' : isDep ? 'DEP' : 'GND'}
                    </span>
                    {ac.assignedRunway && (
                      <span className="text-[10px] font-mono text-slate-400">
                        RWY {ac.assignedRunway}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Distance / Status & Controller */}
              <div className="text-right">
                <span className={`text-xs font-mono ${statusColor}`}>{statusText}</span>
                <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                  {ac.assignedControllerId ? ac.assignedControllerId.replace('CTRL-', '') : 'UNASSIGNED'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
