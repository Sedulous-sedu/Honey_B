import React, { useState } from 'react';
import { useAtcStore } from '../store/useAtcStore';
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

  // Always pin primary demo flight UAE231 to the top, then sort active controller's flights
  const sortedFlights = [...displayedFlights].sort((a, b) => {
    if (a.callsign === 'UAE231') return -1;
    if (b.callsign === 'UAE231') return 1;
    if (activeControllerId === 'ALL') return 0;
    const aMine = a.assignedControllerId === activeControllerId ? 1 : 0;
    const bMine = b.assignedControllerId === activeControllerId ? 1 : 0;
    return bMine - aMine;
  });

  return (
    <div className="w-80 h-full bg-[#0A1830] border-r border-[#1A3A66] flex flex-col select-none overflow-hidden text-[#FFFFFF]">
      {/* Header */}
      <div className="p-3 border-b border-[#1A3A66] bg-[#0F2444]">
        {/* Sector Info Banner */}
        {activeControllerId !== 'ALL' ? (
          <div className="mb-2 p-2 rounded-lg bg-[#0A1830] border border-[#F5A623]/60 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <UserCheck className="w-4 h-4 text-[#F5A623]" />
              <div>
                <span className="text-[10px] font-mono text-[#F5A623] font-bold block">
                  SECTOR: {activeCtrl?.name.toUpperCase() || activeControllerId}
                </span>
                <span className="text-[9px] font-mono text-[#FFFFFF]/80">
                  {activeCtrl?.role} · {myFlights.length} Assigned
                </span>
              </div>
            </div>
            <button
              onClick={() => setTab('MINE')}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                tab === 'MINE' ? 'bg-[#F5A623] text-[#0A1830]' : 'bg-[#0F2444] text-[#F5A623] border border-[#F5A623]/40'
              }`}
            >
              MY SECTOR
            </button>
          </div>
        ) : (
          <div className="mb-2 p-1.5 rounded-lg bg-[#0A1830] border border-[#1A3A66] flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-[#F5A623]" />
              <span className="text-[10px] font-mono text-[#FFFFFF] font-bold">
                WALL SCREEN: ALL SECTORS
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#F5A623] font-bold">
              {allFlights.length} TOTAL
            </span>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#08172C] rounded border border-[#1A3A66]">
          <button
            onClick={() => setTab('ALL')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === 'ALL'
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            ALL ({allFlights.length})
          </button>
          <button
            onClick={() => setTab(activeControllerId === 'ALL' ? 'ARR' : 'MINE')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === (activeControllerId === 'ALL' ? 'ARR' : 'MINE')
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            {activeControllerId === 'ALL' ? `ARR (${arrFlights.length})` : `MINE (${myFlights.length})`}
          </button>
          <button
            onClick={() => setTab('DEP')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === 'DEP'
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            DEP ({depFlights.length})
          </button>
          <button
            onClick={() => setTab('OTHER')}
            className={`py-1 text-[11px] font-mono font-bold rounded transition-colors ${
              tab === 'OTHER'
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            OTH ({otherFlights.length})
          </button>
        </div>
      </div>

      {/* Flight Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1A3A66]/60">
        {sortedFlights.map((ac) => {
          const isSelected = selectedId === ac.callsign;
          const isAssignedToMe = activeControllerId === 'ALL' || ac.assignedControllerId === activeControllerId;

          const isArr = ['ARRIVAL', 'APPROACH', 'FINAL', 'HOLDING'].includes(ac.flightPhase);
          const isDep = ['DEPARTURE', 'TAXI_OUT'].includes(ac.flightPhase);

          // Priority indicator border
          let priorityBorder = 'border-transparent';
          if (ac.priority.level === 'MINIMUM_FUEL' || ac.priority.level === 'EMERGENCY' || ac.priority.level === 'MEDICAL') {
            priorityBorder = 'border border-red-500 border-l-4 bg-red-950/30';
          } else if (ac.status === 'UNABLE_TO_LAND' || ac.flightPhase === 'DIVERTING') {
            priorityBorder = 'border-l-4 border-l-[#F5A623] bg-[#F5A623]/5';
          } else if (isAssignedToMe && activeControllerId !== 'ALL') {
            priorityBorder = 'border-l-4 border-l-[#FFFFFF] bg-[#0F2444]/40';
          }

          let statusText = `${Math.round(ac.position.distanceToThresholdNm)} nm`;
          let statusColor = 'text-[#FFFFFF]';

          if (ac.flightPhase === 'HOLDING') {
            statusText = 'HOLDING';
            statusColor = 'text-[#F5A623] font-bold';
          } else if (ac.flightPhase === 'DIVERTING') {
            statusText = 'DIVERT';
            statusColor = 'text-[#F5A623] font-bold';
          } else if (ac.flightPhase === 'TAXI_OUT') {
            statusText = 'TAXI';
            statusColor = 'text-[#FFFFFF]';
          } else if (ac.flightPhase === 'PARKED') {
            statusText = 'PUSH 12m';
            statusColor = 'text-[#F5A623]';
          } else if (ac.flightPhase === 'DEPARTURE' && ac.altitudeFt < 200) {
            statusText = 'LINE UP';
            statusColor = 'text-[#F5A623]';
          } else if (ac.flightPhase === 'LANDED') {
            statusText = 'LANDED';
            statusColor = 'text-[#F5A623] font-bold';
          }

          const ctrl = controllers.find((c) => c.id === ac.assignedControllerId);
          const ctrlDisplayName = ctrl ? ctrl.name : (ac.assignedControllerId || 'UNASSIGNED');

          return (
            <div
              key={ac.callsign}
              onClick={() => setSelectedId(ac.callsign)}
              className={`p-2.5 flex items-center justify-between cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#0F2444] ring-1 ring-[#F5A623]'
                  : 'hover:bg-[#0F2444]/60'
              } ${priorityBorder} ${
                activeControllerId !== 'ALL' && !isAssignedToMe
                  ? 'opacity-30 hover:opacity-80'
                  : 'opacity-100'
              }`}
            >
              {/* Left: Callsign & Type */}
              <div className="flex items-center space-x-2">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-xs font-bold text-[#FFFFFF]">
                      {ac.callsign === 'UAE231' ? `★ ${ac.callsign}` : ac.callsign}
                    </span>
                    <span className="text-[10px] font-mono text-[#FFFFFF]/70">{ac.aircraftType}</span>
                    {ac.callsign === 'UAE231' && (
                      <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#F5A623] text-[#0A1830]">
                        PRIMARY
                      </span>
                    )}
                    {isAssignedToMe && activeControllerId !== 'ALL' && (
                      <span className="text-[8px] font-mono font-bold px-1 rounded bg-[#F5A623] text-[#0A1830]">
                        MINE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 mt-0.5">
                    <span
                      className={`text-[9px] font-bold px-1 py-0.2 rounded font-mono ${
                        isArr
                          ? 'bg-[#F5A623] text-[#0A1830]'
                          : isDep
                          ? 'bg-[#0F2444] text-[#F5A623] border border-[#F5A623]/50'
                          : 'bg-[#08172C] text-[#FFFFFF]/80 border border-[#1A3A66]'
                      }`}
                    >
                      {isArr ? 'ARR' : isDep ? 'DEP' : 'GND'}
                    </span>
                    {ac.assignedRunway && (
                      <span className="text-[10px] font-mono text-[#FFFFFF]/80">
                        RWY {ac.assignedRunway}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Distance / Status & Controller */}
              <div className="text-right">
                <span className={`text-xs font-mono ${statusColor}`}>{statusText}</span>
                <div className={`text-[9px] font-mono mt-0.5 ${isAssignedToMe ? 'text-[#F5A623] font-bold' : 'text-[#FFFFFF]/60'}`}>
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
