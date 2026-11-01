import React, { useMemo, useState } from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { Eye, EyeOff, ZoomIn, ZoomOut, CloudFog } from 'lucide-react';

export const RadarScope: React.FC = () => {
  const aircraft = useAtcStore((s) => s.aircraft);
  const selectedId = useAtcStore((s) => s.selectedAircraftId);
  const setSelectedId = useAtcStore((s) => s.setSelectedAircraftId);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const controllers = useAtcStore((s) => s.controllers);
  const weather = useAtcStore((s) => s.weather);
  const triggerFog = useAtcStore((s) => s.triggerFog);

  const activeCtrl = controllers.find((c) => c.id === activeControllerId);
  const [zoom, setZoom] = useState(1.1);
  const [showLabels, setShowLabels] = useState(true);

  const isFogActive = Boolean(weather && (weather.lvp.active || weather.visibilityM < 1500));
  const isDenseFog = Boolean(weather && weather.visibilityM <= 450);

  // OMDB center reference: 25.2532 N, 55.3657 E
  const centerLat = 25.2532;
  const centerLon = 55.3657;

  // Scale: 30 NM radius maps to ~330 SVG units
  const nmToPx = 11.5 * zoom;
  const viewSize = 750;
  const halfView = viewSize / 2;

  // Lat/Lon to Radar SVG coordinates
  const project = (lat: number, lon: number): [number, number] => {
    const dLatNm = (lat - centerLat) * 60.0;
    const dLonNm = (lon - centerLon) * (60.0 * Math.cos((centerLat * Math.PI) / 180.0));
    const x = halfView + dLonNm * nmToPx;
    const y = halfView - dLatNm * nmToPx;
    return [x, y];
  };

  const flightsList = useMemo(() => Object.values(aircraft), [aircraft]);

  // OMDB Runways:
  const [rwy12L_x, rwy12L_y] = project(25.2662, 55.3496);
  const [rwy30R_x, rwy30R_y] = project(25.2443, 55.3852);

  const [rwy12R_x, rwy12R_y] = project(25.2605, 55.3448);
  const [rwy30L_x, rwy30L_y] = project(25.2384, 55.3804);

  // DXB VOR holding fix: 25.2528, 55.4500
  const [dxbVor_x, dxbVor_y] = project(25.2528, 55.4500);

  return (
    <div className="relative w-full h-full bg-[#0B1F3A] rounded-lg border border-[#F5A623]/40 overflow-hidden flex flex-col shadow-2xl">
      {/* Top Status Header */}
      <div className="absolute top-3 left-4 z-10 flex items-center space-x-3 bg-[#0B1F3A]/95 px-3 py-1.5 rounded-lg border border-[#F5A623]/50 backdrop-blur-sm shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623] animate-pulse"></span>
          <span className="text-xs font-mono font-bold tracking-wider text-[#FFFFFF]">SURVEILLANCE RADAR</span>
        </div>
        <span className="text-xs font-mono text-[#F5A623]">RANGE: {Math.round(30 / zoom)} NM</span>

        {activeControllerId === 'ALL' ? (
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[#102A4C] text-[#FFFFFF] border border-[#F5A623]/40">
            ALL SECTORS (WALL OVERVIEW)
          </span>
        ) : (
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-[#F5A623] text-[#0B1F3A]">
            SECTOR: {activeCtrl?.name || activeControllerId}
          </span>
        )}

        {isFogActive ? (
          <button
            onClick={() => triggerFog('CLEAR')}
            className="px-2.5 py-0.5 text-[10px] font-mono font-bold tracking-wider rounded bg-[#F5A623] text-[#0B1F3A] flex items-center space-x-1 shadow-md animate-pulse"
            title="Click to clear fog and restore VFR conditions"
          >
            <CloudFog className="w-3.5 h-3.5" />
            <span>
              🌫 {isDenseFog ? 'DENSE FOG (350m · RVR 400m)' : `FOG (${weather?.visibilityM}m)`} · LVP ACTIVE
            </span>
          </button>
        ) : (
          <button
            onClick={() => triggerFog('DENSE_FOG')}
            className="px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider rounded bg-[#102A4C] hover:bg-[#F5A623] text-[#F5A623] hover:text-[#0B1F3A] border border-[#F5A623]/50 flex items-center space-x-1 transition-colors"
            title="Simulate Dense Fog LVP on Radar"
          >
            <CloudFog className="w-3 h-3" />
            <span>SIMULATE FOG</span>
          </button>
        )}
      </div>

      {/* Atmospheric Fog Banner at Bottom Left when Fog is Active */}
      {isFogActive && (
        <div className="absolute bottom-4 left-4 z-10 bg-[#0B1F3A]/95 border-2 border-[#F5A623] rounded-xl px-3.5 py-2.5 shadow-2xl max-w-md backdrop-blur-md">
          <div className="flex items-center space-x-2">
            <CloudFog className="w-4 h-4 text-[#F5A623] animate-pulse shrink-0" />
            <span className="text-xs font-mono font-bold text-[#F5A623]">
              OMDB LOW VISIBILITY PROCEDURES ({weather?.lvp.phase})
            </span>
          </div>
          <p className="text-[11px] font-mono text-[#FFFFFF] mt-1 leading-snug">
            Vis <span className="font-bold text-[#F5A623]">{weather?.visibilityM}m</span> · RVR 30L{' '}
            <span className="font-bold text-[#F5A623]">{weather?.rvr?.[0]?.valueM ?? 400}m</span> · Longitudinal wake spacing doubled to{' '}
            <span className="font-bold text-[#F5A623]">6.0 NM</span>. Primary Flight{' '}
            <span
              onClick={() => setSelectedId('UAE231')}
              className="underline cursor-pointer font-bold text-[#F5A623]"
            >
              UAE231 (B77W)
            </span>{' '}
            requires RWY 30R CAT IIIB sidestep or DXB VOR holding options.
          </p>
        </div>
      )}

      {/* Quick Radar Tools (Zoom & Declutter) */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col space-y-1.5">
        <button
          onClick={() => setShowLabels((v) => !v)}
          className={`p-2 rounded-lg border text-xs font-mono font-bold flex items-center justify-center transition-colors ${
            showLabels
              ? 'bg-[#F5A623] border-[#F5A623] text-[#0B1F3A]'
              : 'bg-[#102A4C] border-[#1E4478] text-[#FFFFFF]'
          }`}
          title="Toggle data block declutter"
        >
          {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))}
          className="p-2 rounded-lg bg-[#102A4C] border border-[#F5A623]/40 text-[#FFFFFF] hover:bg-[#F5A623] hover:text-[#0B1F3A] transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          className="p-2 rounded-lg bg-[#102A4C] border border-[#F5A623]/40 text-[#FFFFFF] hover:bg-[#F5A623] hover:text-[#0B1F3A] transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* SVG Radar Scope */}
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="w-full h-full cursor-crosshair select-none"
      >
        <defs>
          <radialGradient id="radarSweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#102A4C" stopOpacity="0.85" />
            <stop offset="75%" stopColor="#0B1F3A" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#071426" stopOpacity="1" />
          </radialGradient>

          {/* Fog Plume Gradients & Blur Filter */}
          <radialGradient id="omdbFogCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#CBD5E1" stopOpacity={isDenseFog ? "0.42" : "0.26"} />
            <stop offset="45%" stopColor="#94A3B8" stopOpacity={isDenseFog ? "0.28" : "0.16"} />
            <stop offset="80%" stopColor="#F5A623" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0B1F3A" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="omdbFogCorridor" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E2E8F0" stopOpacity={isDenseFog ? "0.35" : "0.20"} />
            <stop offset="65%" stopColor="#94A3B8" stopOpacity={isDenseFog ? "0.18" : "0.10"} />
            <stop offset="100%" stopColor="#0B1F3A" stopOpacity="0" />
          </radialGradient>

          <filter id="fogSoftBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* Background */}
        <rect width={viewSize} height={viewSize} fill="url(#radarSweep)" />

        {/* Crosshair Center Lines */}
        <line x1={0} y1={halfView} x2={viewSize} y2={halfView} stroke="#1E4478" strokeWidth="1" strokeDasharray="4 6" />
        <line x1={halfView} y1={0} x2={halfView} y2={viewSize} stroke="#1E4478" strokeWidth="1" strokeDasharray="4 6" />

        {/* Range Rings: 5, 10, 15, 20, 30 NM */}
        {[5, 10, 15, 20, 30].map((nm) => {
          const r = nm * nmToPx;
          return (
            <g key={nm}>
              <circle
                cx={halfView}
                cy={halfView}
                r={r}
                fill="none"
                stroke="#1E4478"
                strokeWidth="1.2"
                strokeDasharray={nm === 30 ? "6 6" : "none"}
              />
              <text
                x={halfView + r + 3}
                y={halfView - 4}
                fill="#F5A623"
                opacity="0.7"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {nm} NM
              </text>
            </g>
          );
        })}

        {/* ══════════════════════════════════════════════════════════════════
            VISUALIZED OMDB FOG BANK & LVP PROTECTION ZONE (WHEN FOG ACTIVE)
           ══════════════════════════════════════════════════════════════════ */}
        {isFogActive && (
          <g className="pointer-events-none">
            {/* Outer Fog Bank Plume over OMDB Terminal Area */}
            <ellipse
              cx={halfView + 28}
              cy={halfView + 14}
              rx={(isDenseFog ? 18 : 13) * nmToPx}
              ry={(isDenseFog ? 11 : 8) * nmToPx}
              transform={`rotate(30 ${halfView + 28} ${halfView + 14})`}
              fill="url(#omdbFogCore)"
              filter="url(#fogSoftBlur)"
            />
            {/* Secondary Drifting Fog Layer along RWY 30L/30R Final Approach */}
            <ellipse
              cx={rwy30L_x + 70}
              cy={rwy30L_y + 42}
              rx={(isDenseFog ? 14 : 10) * nmToPx}
              ry={(isDenseFog ? 6.5 : 4.5) * nmToPx}
              transform={`rotate(30 ${rwy30L_x + 70} ${rwy30L_y + 42})`}
              fill="url(#omdbFogCorridor)"
              filter="url(#fogSoftBlur)"
            />
            {/* Dense Core Fog Blanket over Runways 30L & 30R */}
            <circle
              cx={halfView}
              cy={halfView}
              r={(isDenseFog ? 8.5 : 6) * nmToPx}
              fill="url(#omdbFogCore)"
            />

            {/* LVP 12 NM Approach Protection Ring */}
            <circle
              cx={halfView}
              cy={halfView}
              r={12 * nmToPx}
              fill="none"
              stroke="#F5A623"
              strokeWidth="1.6"
              strokeDasharray="8 5"
              strokeOpacity="0.85"
            />
            <rect
              x={halfView - 125}
              y={halfView - 12 * nmToPx - 18}
              width="250"
              height="16"
              rx="4"
              fill="#0B1F3A"
              fillOpacity="0.9"
              stroke="#F5A623"
              strokeWidth="1"
            />
            <text
              x={halfView}
              y={halfView - 12 * nmToPx - 7}
              textAnchor="middle"
              fill="#F5A623"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              🌫 OMDB FOG LVP ZONE · VIS {weather?.visibilityM}m · 6 NM SEP
            </text>
          </g>
        )}

        {/* OMDB Runways */}
        {/* RWY 12L/30R */}
        <line
          x1={rwy12L_x}
          y1={rwy12L_y}
          x2={rwy30R_x}
          y2={rwy30R_y}
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Extended Centerline 30R */}
        <line
          x1={rwy30R_x}
          y1={rwy30R_y}
          x2={rwy30R_x + 180}
          y2={rwy30R_y + 104}
          stroke="#F5A623"
          strokeOpacity="0.5"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text x={rwy30R_x + 6} y={rwy30R_y + 12} fill="#FFFFFF" fontSize="10" fontFamily="monospace" fontWeight="bold">30R</text>

        {/* RWY 12R/30L */}
        <line
          x1={rwy12R_x}
          y1={rwy12R_y}
          x2={rwy30L_x}
          y2={rwy30L_y}
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Extended Centerline 30L */}
        <line
          x1={rwy30L_x}
          y1={rwy30L_y}
          x2={rwy30L_x + 180}
          y2={rwy30L_y + 104}
          stroke="#F5A623"
          strokeOpacity="0.5"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text x={rwy30L_x + 6} y={rwy30L_y + 12} fill="#FFFFFF" fontSize="10" fontFamily="monospace" fontWeight="bold">30L</text>

        {/* DXB VOR Holding Fix */}
        <g>
          <polygon
            points={`${dxbVor_x},${dxbVor_y - 7} ${dxbVor_x + 6},${dxbVor_y + 5} ${dxbVor_x - 6},${dxbVor_y + 5}`}
            fill="#F5A623"
            opacity="0.9"
          />
          <text x={dxbVor_x + 10} y={dxbVor_y + 4} fill="#F5A623" fontSize="11" fontFamily="monospace" fontWeight="bold">
            DXB VOR
          </text>
          <ellipse
            cx={dxbVor_x + 20}
            cy={dxbVor_y}
            rx={32}
            ry={14}
            fill="none"
            stroke="#F5A623"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            transform={`rotate(-30 ${dxbVor_x + 20} ${dxbVor_y})`}
            opacity="0.75"
          />
        </g>

        {/* Aircraft Blips & Airplanes */}
        {flightsList.map((ac) => {
          const [px, py] = project(ac.position.lat, ac.position.lon);
          const isSelected = selectedId === ac.callsign;
          const isPrimaryUae = ac.callsign === 'UAE231';

          const isOwnedByActiveCtrl = activeControllerId === 'ALL' || ac.assignedControllerId === activeControllerId;
          const opacity = isOwnedByActiveCtrl ? 1.0 : 0.25;

          // Color coding anchored around #FFFFFF, #F5A623, and critical red
          let color = "#FFFFFF";
          if (!isOwnedByActiveCtrl && activeControllerId !== 'ALL') {
            color = "#8FAAD0";
          } else if (isPrimaryUae) {
            color = "#F5A623"; // Always highlight UAE231 in Honey Gold
          } else if (isSelected) {
            color = "#F5A623";
          } else if (ac.priority.level === "MINIMUM_FUEL" || ac.priority.level === "EMERGENCY") {
            color = "#EF4444";
          } else if (ac.priority.level === "MEDICAL") {
            color = "#F5A623";
          } else if (ac.status === "UNABLE_TO_LAND" || ac.flightPhase === "DIVERTING") {
            color = "#F5A623";
          }

          // Heading vector
          const rad = (ac.headingDeg * Math.PI) / 180;
          const vecLength = isPrimaryUae ? 28 : 22;
          const vx = px + Math.sin(rad) * vecLength;
          const vy = py - Math.cos(rad) * vecLength;

          let vTrend = "";
          if (ac.verticalRateFpm < -200) vTrend = "↓";
          else if (ac.verticalRateFpm > 200) vTrend = "↑";

          return (
            <g
              key={ac.callsign}
              opacity={opacity}
              onClick={() => setSelectedId(ac.callsign)}
              className="cursor-pointer transition-all duration-300"
            >
              {/* Primary Flight UAE231 Approach & Sidestep Preview Vectors in Fog */}
              {isPrimaryUae && ac.flightPhase !== 'LANDED' && (
                <>
                  {/* Outer beacon ring for UAE231 */}
                  <circle
                    cx={px}
                    cy={py}
                    r={22}
                    fill="rgba(245, 166, 35, 0.12)"
                    stroke="#F5A623"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                  {/* Sidestep Option Vector to RWY 30R when Fog is Active */}
                  {isFogActive && ac.assignedRunway === '30L' && (
                    <line
                      x1={px}
                      y1={py}
                      x2={rwy30R_x}
                      y2={rwy30R_y}
                      stroke="#22C55E"
                      strokeWidth="1.4"
                      strokeDasharray="5 4"
                      strokeOpacity="0.8"
                    />
                  )}
                </>
              )}

              {/* Selected Target Ring */}
              {isSelected && (
                <circle cx={px} cy={py} r={18} fill="none" stroke="#F5A623" strokeWidth="2" className="radar-target-pulse" />
              )}

              {/* Realistic Commercial Airplane Silhouette SVG */}
              <g transform={`translate(${px}, ${py}) rotate(${ac.headingDeg}) scale(${isPrimaryUae ? 1.15 : 0.9})`}>
                <path
                  d="M0,-12 L1.5,-7 L9,-1 L9,1.5 L1.5,0.5 L1.5,6.5 L4.5,9.5 L4.5,11 L0,9.8 L-4.5,11 L-4.5,9.5 L-1.5,6.5 L-1.5,0.5 L-9,1.5 L-9,-1 L-1.5,-7 Z"
                  fill={color}
                  stroke="#0B1F3A"
                  strokeWidth="0.9"
                />
              </g>

              {/* Heading / Velocity Vector */}
              <line x1={px} y1={py} x2={vx} y2={vy} stroke={color} strokeWidth={isPrimaryUae ? "1.8" : "1.2"} strokeOpacity="0.85" />

              {/* Data Block */}
              {(showLabels || isSelected || isPrimaryUae) && (
                <g transform={`translate(${px + 14}, ${py - 22})`}>
                  <rect
                    x="0"
                    y="0"
                    width={isPrimaryUae ? "88" : "64"}
                    height={isPrimaryUae ? "32" : "24"}
                    fill="#0B1F3A"
                    fillOpacity="0.95"
                    stroke={isPrimaryUae || isSelected ? "#F5A623" : "#1E4478"}
                    strokeWidth={isPrimaryUae || isSelected ? "1.8" : "0.8"}
                    rx="3"
                  />
                  {/* Line 1: Callsign */}
                  <text x="4" y="10" fill={isPrimaryUae || isSelected ? "#F5A623" : color} fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                    {isPrimaryUae ? `★ ${ac.callsign}` : ac.callsign}
                  </text>
                  {/* Line 2: Altitude & Speed */}
                  <text x="4" y="19" fill="#FFFFFF" fontSize="8.5" fontFamily="monospace">
                    {ac.altitudeFt > 6000 ? `FL${Math.round(ac.altitudeFt / 100)}` : `${ac.altitudeFt}${vTrend}`} {Math.round(ac.speed.groundSpeedKt)}K
                  </text>
                  {/* Line 3 for UAE231: Runway & LVP/Fuel tag */}
                  {isPrimaryUae && (
                    <text x="4" y="28" fill={isFogActive ? "#F5A623" : "#4ADE80"} fontSize="8" fontFamily="monospace" fontWeight="bold">
                      {isFogActive ? `FOG · RWY ${ac.assignedRunway}` : `PRIMARY · ${ac.assignedRunway}`}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
