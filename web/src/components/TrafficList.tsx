import React, { useState, useMemo } from 'react';
import { useAtcStore, getTrackKey, resolveSelectedAircraft } from '../store/useAtcStore';
import { AirlineLogo } from './AirlineLogo';
import { UserCheck, Shield, Search, Radio, AlertTriangle } from 'lucide-react';

export const TrafficList: React.FC = () => {
  const aircraft = useAtcStore((s) => s.aircraft);
  const selectedId = useAtcStore((s) => s.selectedAircraftId);
  const setSelectedId = useAtcStore((s) => s.setSelectedAircraftId);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const controllers = useAtcStore((s) => s.controllers);
  const dataMode = useAtcStore((s) => s.dataMode);
  const providerHealth = useAtcStore((s) => s.providerHealth);
  const searchTerm = useAtcStore((s) => s.searchTerm);
  const setSearchTerm = useAtcStore((s) => s.setSearchTerm);

  const [tab, setTab] = useState<'ALL' | 'ARR' | 'AIRBORNE' | 'SURFACE'>('ALL');

  const isLiveOrReplay = dataMode === 'LIVE_OBSERVE' || dataMode === 'REPLAY';
  const selectedAircraft = useMemo(
    () => resolveSelectedAircraft(aircraft, selectedId),
    [aircraft, selectedId]
  );
  const selectedTrackKey = selectedAircraft ? getTrackKey(selectedAircraft) : selectedId;

  const allFlights = useMemo(() => Object.values(aircraft), [aircraft]);
  const activeCtrl = controllers.find((c) => c.id === activeControllerId);

  // Search filter across callsign, confirmed passenger flight number, airline name/code, registration, and ICAO24
  const searchedFlights = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allFlights;
    return allFlights.filter((ac) => {
      const ident = ac.identity;
      const callsignMatch = ac.callsign.toLowerCase().includes(q) || (ident?.callsignObserved?.toLowerCase().includes(q) ?? false);
      const icao24Match = (ac.icao24?.toLowerCase().includes(q) ?? false) || (ident?.icao24?.toLowerCase().includes(q) ?? false);
      const regMatch = ac.registration?.toLowerCase().includes(q) ?? false;
      const airlineMatch =
        (ident?.operatingAirline?.name.toLowerCase().includes(q) ?? false) ||
        (ident?.operatingAirline?.icao.toLowerCase().includes(q) ?? false) ||
        (ident?.operatingAirline?.iata?.toLowerCase().includes(q) ?? false);
      const fnMatch =
        ident?.flightNumberStatus === 'CONFIRMED_MATCH' &&
        (ident.flightNumberIata?.toLowerCase().includes(q) ?? false);
      return callsignMatch || icao24Match || regMatch || airlineMatch || fnMatch;
    });
  }, [allFlights, searchTerm]);

  const arrFlights = useMemo(
    () =>
      searchedFlights.filter((a) =>
        isLiveOrReplay
          ? a.inferredFlightClass === 'INFERRED_APPROACH' || ['APPROACH', 'FINAL', 'HOLDING', 'ARRIVAL'].includes(a.flightPhase)
          : ['ARRIVAL', 'APPROACH', 'FINAL', 'HOLDING'].includes(a.flightPhase)
      ),
    [searchedFlights, isLiveOrReplay]
  );

  const airborneFlights = useMemo(
    () =>
      searchedFlights.filter((a) =>
        isLiveOrReplay
          ? !a.onGround && a.inferredFlightClass !== 'SURFACE_OBSERVED' && a.inferredFlightClass !== 'SURFACE_VEHICLE'
          : ['DEPARTURE', 'TAXI_OUT', 'CRUISE', 'EN_ROUTE'].includes(a.flightPhase)
      ),
    [searchedFlights, isLiveOrReplay]
  );

  const surfaceFlights = useMemo(
    () =>
      searchedFlights.filter((a) =>
        isLiveOrReplay
          ? Boolean(a.onGround) || ['AT_STAND', 'LANDED', 'TAXI_IN', 'PARKED'].includes(a.flightPhase)
          : ['PARKED', 'AT_STAND', 'TAXI_IN', 'LANDED', 'DIVERTING'].includes(a.flightPhase)
      ),
    [searchedFlights, isLiveOrReplay]
  );

  let displayedFlights = searchedFlights;
  if (tab === 'ARR') {
    displayedFlights = arrFlights;
  } else if (tab === 'AIRBORNE') {
    displayedFlights = airborneFlights;
  } else if (tab === 'SURFACE') {
    displayedFlights = surfaceFlights;
  }

  // Sort by distance to OMDB ARP (closest first), without pinning synthetic UAE231 in live/replay modes
  const sortedFlights = useMemo(() => {
    return [...displayedFlights].sort((a, b) => {
      if (!isLiveOrReplay) {
        if (a.callsign === 'UAE231') return -1;
        if (b.callsign === 'UAE231') return 1;
      }
      const distA = a.position?.distanceToThresholdNm ?? 999;
      const distB = b.position?.distanceToThresholdNm ?? 999;
      return distA - distB;
    });
  }, [displayedFlights, isLiveOrReplay]);

  const adsbHealth = providerHealth.find(
    (p) => p.provider.toLowerCase().includes('adsb') || p.provider.toLowerCase().includes('opensky')
  );

  return (
    <div className="w-80 h-full bg-[#0A1830] border-r border-[#1A3A66] flex flex-col select-none overflow-hidden text-[#FFFFFF]">
      {/* Header */}
      <div className="p-3 border-b border-[#1A3A66] bg-[#0F2444] space-y-2">
        {/* Mode & Source Banner */}
        {!isLiveOrReplay && activeControllerId !== 'ALL' ? (
          <div className="p-2 rounded-lg bg-[#0A1830] border border-[#F5A623]/60 flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <UserCheck className="w-4 h-4 text-[#F5A623]" />
              <div>
                <span className="text-[10px] font-mono text-[#F5A623] font-bold block">
                  SECTOR: {activeCtrl?.name.toUpperCase() || activeControllerId}
                </span>
                <span className="text-[9px] font-mono text-[#FFFFFF]/80">
                  {activeCtrl?.role} · Simulation Mode
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-1.5 rounded-lg bg-[#0A1830] border border-[#1A3A66] flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              {isLiveOrReplay ? (
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-[#F5A623]" />
              )}
              <span className="text-[10px] font-mono text-[#FFFFFF] font-bold truncate">
                {dataMode === 'LIVE_OBSERVE'
                  ? `OBSERVED ADS-B (${adsbHealth?.provider || 'adsb.lol'})`
                  : dataMode === 'REPLAY'
                  ? 'RECORDED OBSERVATIONS'
                  : dataMode === 'WHAT_IF'
                  ? 'WHAT-IF SCENARIO SANDBOX'
                  : 'FIXTURE SIMULATION'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#F5A623] font-bold shrink-0">
              {allFlights.length} TRACKS
            </span>
          </div>
        )}

        {/* Search Input (Callsign, Airline, Registration, ICAO24) */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#FFFFFF]/50 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search callsign, airline, reg, ICAO24..."
            className="w-full pl-8 pr-2 py-1 text-[11px] font-mono bg-[#08172C] border border-[#1A3A66] rounded text-[#FFFFFF] placeholder-[#FFFFFF]/40 focus:outline-none focus:border-[#F5A623]"
          />
        </div>

        {/* Filter Tabs */}
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#08172C] rounded border border-[#1A3A66]">
          <button
            onClick={() => setTab('ALL')}
            className={`py-1 text-[10px] font-mono font-bold rounded transition-colors ${
              tab === 'ALL'
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            ALL ({searchedFlights.length})
          </button>
          <button
            onClick={() => setTab('ARR')}
            className={`py-1 text-[10px] font-mono font-bold rounded transition-colors ${
              tab === 'ARR'
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
            title={isLiveOrReplay ? 'Inferred approach profile tracks' : 'Arrival flights'}
          >
            {isLiveOrReplay ? `APP (${arrFlights.length})` : `ARR (${arrFlights.length})`}
          </button>
          <button
            onClick={() => setTab('AIRBORNE')}
            className={`py-1 text-[10px] font-mono font-bold rounded transition-colors ${
              tab === 'AIRBORNE'
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            {isLiveOrReplay ? `AIR (${airborneFlights.length})` : `DEP (${airborneFlights.length})`}
          </button>
          <button
            onClick={() => setTab('SURFACE')}
            className={`py-1 text-[10px] font-mono font-bold rounded transition-colors ${
              tab === 'SURFACE'
                ? 'bg-[#F5A623] text-[#0A1830] shadow-sm'
                : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
            }`}
          >
            GND ({surfaceFlights.length})
          </button>
        </div>
      </div>

      {/* Flight Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1A3A66]/60">
        {sortedFlights.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-[#F5A623] mx-auto opacity-80" />
            <div className="text-xs font-mono font-bold text-[#FFFFFF]">
              {allFlights.length === 0
                ? adsbHealth?.status === 'DOWN' || adsbHealth?.status === 'DISCONNECTED'
                  ? 'SOURCE UNAVAILABLE'
                  : 'NO COVERAGE / 0 OBSERVED TRACKS'
                : 'NO MATCHING TRACKS'}
            </div>
            <p className="text-[10px] font-mono text-[#FFFFFF]/60 leading-relaxed">
              {allFlights.length === 0
                ? 'No synthetic aircraft are injected in LIVE_OBSERVE. Waiting for live ADS-B observations from provider pool.'
                : 'Try clearing the search filter or selecting ALL tracks.'}
            </p>
          </div>
        ) : (
          sortedFlights.map((ac) => {
            const trackKey = getTrackKey(ac);
            const isSelected = selectedTrackKey === trackKey;
            const ident = ac.identity;
            const airline = ident?.operatingAirline || null;

            // Primary observed callsign or explicit fallback
            const primaryCallsign =
              ident?.callsignObserved ||
              (ac.callsign && !ac.callsign.startsWith('HEX-') ? ac.callsign : null) ||
              ac.registration ||
              `ICAO-${(ac.icao24 || 'UNKNOWN').toUpperCase()}`;

            const confirmedIataFn =
              ident?.flightNumberStatus === 'CONFIRMED_MATCH' ? ident.flightNumberIata : null;

            // Priority border only when observed Squawk 7700 or confirmed scenario priority
            let priorityBorder = 'border-transparent';
            if (ac.priority.level === 'MINIMUM_FUEL' || ac.priority.level === 'EMERGENCY' || ac.priority.level === 'MEDICAL') {
              priorityBorder = 'border border-red-500 border-l-4 bg-red-950/30';
            }

            // Distance with explicit reference
            const distNm = ac.position?.distanceToThresholdNm ?? 0;
            const distRef =
              !isLiveOrReplay && ac.assignedRunway
                ? `to RWY ${ac.assignedRunway}`
                : 'to OMDB ARP';
            const distLabel = `${distNm.toFixed(1)} NM`;

            // Observation age
            const obsAgeSec = Math.max(0, Math.round(ac.dataFreshnessSec ?? 0));

            // Classification badge
            let classBadge = 'OBSERVED';
            let classStyle = 'bg-[#08172C] text-[#FFFFFF]/80 border border-[#1A3A66]';
            if (isLiveOrReplay) {
              if (ac.inferredFlightClass === 'SURFACE_VEHICLE') {
                classBadge = 'SURFACE VEH';
              } else if (ac.onGround || ac.inferredFlightClass === 'SURFACE_OBSERVED') {
                classBadge = 'ON GROUND';
              } else if (ac.inferredFlightClass === 'INFERRED_APPROACH') {
                classBadge = 'INFERRED APP';
                classStyle = 'bg-[#0F2444] text-[#F5A623] border border-[#F5A623]/50';
              } else {
                classBadge = 'OBSERVED';
              }
            } else {
              const isArr = ['ARRIVAL', 'APPROACH', 'FINAL', 'HOLDING'].includes(ac.flightPhase);
              const isDep = ['DEPARTURE', 'TAXI_OUT'].includes(ac.flightPhase);
              classBadge = isArr ? 'ARR' : isDep ? 'DEP' : 'GND';
              classStyle = isArr
                ? 'bg-[#F5A623] text-[#0A1830]'
                : isDep
                ? 'bg-[#0F2444] text-[#F5A623] border border-[#F5A623]/50'
                : classStyle;
            }

            const typeAndReg = [
              ac.aircraftType && ac.aircraftType !== 'UNKNOWN' ? ac.aircraftType : null,
              ac.registration ? ac.registration : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={trackKey}
                onClick={() => setSelectedId(trackKey)}
                className={`p-2.5 flex items-center justify-between cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#0F2444] ring-1 ring-[#F5A623]'
                    : 'hover:bg-[#0F2444]/60'
                } ${priorityBorder}`}
              >
                {/* Left: 36px AirlineLogo + Callsign, Airline Name, Aircraft Type/Reg */}
                <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                  <AirlineLogo airline={airline} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono text-xs font-bold text-[#FFFFFF] truncate">
                        {primaryCallsign}
                      </span>
                      {confirmedIataFn && (
                        <span className="text-[10px] font-mono text-[#F5A623] font-bold">
                          ({confirmedIataFn})
                        </span>
                      )}
                      {typeAndReg && (
                        <span className="text-[10px] font-mono text-[#FFFFFF]/70 truncate">
                          {typeAndReg}
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] font-mono text-[#FFFFFF]/75 truncate mt-0.5">
                      {airline ? airline.name : ident?.callsignObserved ? 'Airline Unresolved' : 'No Callsign Broadcast'}
                    </div>

                    <div className="flex items-center space-x-1.5 mt-1">
                      <span className={`text-[8px] font-bold px-1 py-0.2 rounded font-mono ${classStyle}`}>
                        {classBadge}
                      </span>
                      <span className="text-[9px] font-mono text-[#FFFFFF]/55">
                        {ac.icao24 ? `#${ac.icao24.toUpperCase()}` : ''} · {obsAgeSec}s ago
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Measured Distance + Reference & Altitude */}
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold text-[#FFFFFF]">{distLabel}</div>
                  <div className="text-[8px] font-mono text-[#F5A623]/90">{distRef}</div>
                  <div className="text-[9px] font-mono text-[#FFFFFF]/70 mt-0.5">
                    {ac.onGround ? 'SURFACE' : `${Math.round(ac.altitudeFt)} ft`}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
