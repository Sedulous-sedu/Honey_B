import React, { useState } from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { Aircraft } from '../types';
import { UserCheck, Shield } from 'lucide-react';

export const TrafficList: React.FC = () => {
  const aircraft = useAtcStore((s) => s.aircraft);
  const selectedId = useAtcStore((s) => s.selectedAircraftId);
  const setSelectedId = useAtcStore((s) => s.setSelectedAircraftId);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const controllers = useAtcStore((s) => s.controllers);

  const [tab, setTab] = useState<'ALL' | 'MINE' | 'ARR' | 'DEP' | 'OTHER'>('ALL');

  const allFlights = Object.values(aircraft);
  const activeCtrl = controllers.find((c) => c.id === activeControllerId);

  const myFlights = activeControllerId === 'ALL'
    ? allFlights
    : allFlights.filter((a) => a.assignedControllerId === activeControllerId);

  const arrFlights = allFlights.filter((a) =>
    ['ARRIVAL', 'APPROACH', 'FINAL', 'HOLDING'].includes(a.flightPhase)
  );
  const depFlights = allFlights.filter((a) =>
    ['DEPARTURE', 'TAXI_OUT'].includes(a.flightPhase)
  );
  const otherFlights = allFlights.filter((a) =>
    ['PARKED', 'AT_STAND', 'TAXI_IN', 'LANDED', 'DIVERTING'].includes(a.flightPhase)
  );

  let displayedFlights = allFlights;
  if (tab === 'MINE') {
    displayedFlights = myFlights;
  } else if (tab === 'ARR') {
    displayedFlights = arrFlights;
  } else if (tab === 'DEP') {
    displayedFlights = depFlights;
  } else if (tab === 'OTHER') {
    displayedFlights = otherFlights;
  }

  // When viewing a specific controller in ALL/ARR/DEP, sort their flights to the top
  const sortedFlights = [...displayedFlights].sort((a, b) => {
    if (activeControllerId === 'ALL') return 0;
    const aMine = a.assignedControllerId === activeControllerId ? 1 : 0;
    const bMine = b.assignedControllerId === activeControllerId ? 1 : 0;
    return bMine - aMine;
  });

  return (
    <div className="w-80 h-full bg-[#0B0F19] border-r border-[#162338] flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#162338] bg-[#0E1524]">
        {/* Sector Info Banner */}
        {activeControllerId !== 'ALL' ? (
          <div className="mb-2 p-2 rounded-lg bg-blue-950/40 border border-blue-500/40 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              <div>
                <span className="text-[10px] font-mono text-cyan-300 font-bold block">
                  SECTOR: {activeCtrl?.name.toUpperCase() || activeControllerId}
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  {activeCtrl?.role} · {myFlights.length} Assigned
                </span>
              </div>
            </div>
            <button
              onClick={() => setTab('MINE')}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                tab === 'MINE' ? 'bg-cyan-500 text-black' : 'bg-[#121E36] text-cyan-300 border border-cyan-500/30'
              }`}
            >
              MY SECTOR
            </button>
          </div>
        ) : (
          <div className="mb-2 p-1.5 rounded-lg bg-[#070B12] border border-[#162338] flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] font-mono text-slate-300 font-bold">
                WALL SCREEN: ALL SECTORS
              </span>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">
              {allFlights.length} TOTAL
            </span>
          </div>
        )}

        {/* Filter Tabs matching image */}
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#070B12] rounded border border-[#162338]">
          <button
            onClick={() => setTab('ALL')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ALL ({allFlights.length})
          </button>
          <button
            onClick={() => setTab(activeControllerId === 'ALL' ? 'ARR' : 'MINE')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === (activeControllerId === 'ALL' ? 'ARR' : 'MINE')
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeControllerId === 'ALL' ? `ARR (${arrFlights.length})` : `MINE (${myFlights.length})`}
          </button>
          <button
            onClick={() => setTab('DEP')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === 'DEP'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DEP ({depFlights.length})
          </button>
          <button
            onClick={() => setTab('OTHER')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === 'OTHER'
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
        {sortedFlights.map((ac) => {
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
          } else if (isAssignedToMe && activeControllerId !== 'ALL') {
            priorityBorder = 'border-l-4 border-l-cyan-400 bg-cyan-950/10';
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

          // Controller name label
          const ctrl = controllers.find((c) => c.id === ac.assignedControllerId);
          const ctrlDisplayName = ctrl ? ctrl.name : (ac.assignedControllerId || 'UNASSIGNED');

          return (
            <div
              key={ac.callsign}
              onClick={() => setSelectedId(ac.callsign)}
              className={`p-2.5 flex items-center justify-between cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#152338] ring-1 ring-cyan-500/50'
                  : 'hover:bg-[#10192A]'
              } ${priorityBorder} ${
                activeControllerId !== 'ALL' && !isAssignedToMe
                  ? 'opacity-25 hover:opacity-75 grayscale-[50%]'
                  : 'opacity-100'
              }`}
            >
              {/* Left: Callsign & Type */}
              <div className="flex items-center space-x-2">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-xs font-bold text-slate-100">{ac.callsign}</span>
                    <span className="text-[10px] font-mono text-slate-400">{ac.aircraftType}</span>
                    {isAssignedToMe && activeControllerId !== 'ALL' && (
                      <span className="text-[8px] font-mono font-bold px-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        MINE
                      </span>
                    )}
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
                <div className={`text-[9px] font-mono mt-0.5 ${isAssignedToMe ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
                  {isAssignedToMe && activeControllerId !== 'ALL' ? '● YOU' : ctrlDisplayName}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
