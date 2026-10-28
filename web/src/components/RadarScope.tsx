import React, { useMemo, useState } from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { Eye, EyeOff, ZoomIn, ZoomOut } from 'lucide-react';

export const RadarScope: React.FC = () => {
  const aircraft = useAtcStore((s) => s.aircraft);
  const selectedId = useAtcStore((s) => s.selectedAircraftId);
  const setSelectedId = useAtcStore((s) => s.setSelectedAircraftId);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const controllers = useAtcStore((s) => s.controllers);
  const weather = useAtcStore((s) => s.weather);

  const activeCtrl = controllers.find((c) => c.id === activeControllerId);
  const [zoom, setZoom] = useState(1.1);
  const [showLabels, setShowLabels] = useState(true);

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
    <div className="relative w-full h-full bg-[#070B12] rounded-lg border border-[#162338] overflow-hidden flex flex-col shadow-2xl">
      {/* Top Status Header */}
      <div className="absolute top-3 left-4 z-10 flex items-center space-x-3 bg-[#0B1322]/90 px-3 py-1.5 rounded-lg border border-[#1F2E47] backdrop-blur-sm shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-mono font-bold tracking-wider text-emerald-400">SURVEILLANCE RADAR</span>
        </div>
        <span className="text-xs font-mono text-slate-400">RANGE: {Math.round(30 / zoom)} NM</span>

        {activeControllerId === 'ALL' ? (
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
            ALL SECTORS (WALL OVERVIEW)
          </span>
        ) : (
          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            SECTOR: {activeCtrl?.name || activeControllerId}
          </span>
        )}

        {weather?.lvp.active && (
          <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
            LVP {weather.lvp.phase}
          </span>
        )}
      </div>

      {/* Quick Radar Tools (Zoom & Declutter) */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col space-y-1.5">
        <button
          onClick={() => setShowLabels((v) => !v)}
          className={`p-2 rounded-lg border text-xs font-mono font-bold flex items-center justify-center transition-colors ${
            showLabels
              ? 'bg-[#121E36] border-cyan-500/40 text-cyan-300'
              : 'bg-[#101B2E] border-[#233552] text-slate-400'
          }`}
          title="Toggle data block declutter"
        >
          {showLabels ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))}
          className="p-2 rounded-lg bg-[#101B2E] border border-[#233552] text-slate-200 hover:bg-[#1A2C4A] transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          className="p-2 rounded-lg bg-[#101B2E] border border-[#233552] text-slate-200 hover:bg-[#1A2C4A] transition-colors"
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
            <stop offset="0%" stopColor="#0B1626" stopOpacity="0.4" />
            <stop offset="80%" stopColor="#08101C" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#050912" stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* Background */}
        <rect width={viewSize} height={viewSize} fill="url(#radarSweep)" />

        {/* Crosshair Center Lines */}
        <line x1={0} y1={halfView} x2={viewSize} y2={halfView} stroke="#13233A" strokeWidth="1" strokeDasharray="4 6" />
        <line x1={halfView} y1={0} x2={halfView} y2={viewSize} stroke="#13233A" strokeWidth="1" strokeDasharray="4 6" />

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
                stroke="#152740"
                strokeWidth="1.2"
                strokeDasharray={nm === 30 ? "6 6" : "none"}
              />
              <text
                x={halfView + r + 3}
                y={halfView - 4}
                fill="#3A557A"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {nm} NM
              </text>
            </g>
          );
        })}

        {/* OMDB Runways */}
        {/* RWY 12L/30R */}
        <line
          x1={rwy12L_x}
          y1={rwy12L_y}
          x2={rwy30R_x}
          y2={rwy30R_y}
          stroke="#475569"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Extended Centerline 30R */}
        <line
          x1={rwy30R_x}
          y1={rwy30R_y}
          x2={rwy30R_x + 180}
          y2={rwy30R_y + 104}
          stroke="#263852"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text x={rwy30R_x + 6} y={rwy30R_y + 12} fill="#64748B" fontSize="10" fontFamily="monospace">30R</text>

        {/* RWY 12R/30L */}
        <line
          x1={rwy12R_x}
          y1={rwy12R_y}
          x2={rwy30L_x}
          y2={rwy30L_y}
          stroke="#475569"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Extended Centerline 30L */}
        <line
          x1={rwy30L_x}
          y1={rwy30L_y}
          x2={rwy30L_x + 180}
          y2={rwy30L_y + 104}
          stroke="#263852"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <text x={rwy30L_x + 6} y={rwy30L_y + 12} fill="#64748B" fontSize="10" fontFamily="monospace">30L</text>

        {/* DXB VOR Holding Fix */}
        <g>
          <polygon
            points={`${dxbVor_x},${dxbVor_y - 7} ${dxbVor_x + 6},${dxbVor_y + 5} ${dxbVor_x - 6},${dxbVor_y + 5}`}
            fill="#3B82F6"
            opacity="0.8"
          />
          <text x={dxbVor_x + 10} y={dxbVor_y + 4} fill="#60A5FA" fontSize="11" fontFamily="monospace" fontWeight="bold">
            DXB VOR
          </text>
          <ellipse
            cx={dxbVor_x + 20}
            cy={dxbVor_y}
            rx={32}
            ry={14}
            fill="none"
            stroke="#2563EB"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            transform={`rotate(-30 ${dxbVor_x + 20} ${dxbVor_y})`}
            opacity="0.7"
          />
        </g>

        {/* Aircraft Blips & Airplanes */}
        {flightsList.map((ac) => {
          const [px, py] = project(ac.position.lat, ac.position.lon);
          const isSelected = selectedId === ac.callsign;

          // Multi-controller dimming:
          const isOwnedByActiveCtrl = activeControllerId === 'ALL' || ac.assignedControllerId === activeControllerId;
          const opacity = isOwnedByActiveCtrl ? 1.0 : 0.2;

          // Color coding
          let color = "#10B981"; // Emerald
          if (!isOwnedByActiveCtrl && activeControllerId !== 'ALL') {
            color = "#475569";
          } else if (isSelected) {
            color = "#00F2FE"; // Bright cyan
          } else if (ac.priority.level === "MINIMUM_FUEL" || ac.priority.level === "EMERGENCY") {
            color = "#EF4444"; // Red
          } else if (ac.priority.level === "MEDICAL") {
            color = "#EC4899"; // Pink
          } else if (ac.status === "UNABLE_TO_LAND" || ac.flightPhase === "DIVERTING") {
            color = "#F59E0B"; // Amber
          }

          // Heading vector
          const rad = (ac.headingDeg * Math.PI) / 180;
          const vecLength = 22;
          const vx = px + Math.sin(rad) * vecLength;
          const vy = py - Math.cos(rad) * vecLength;

          // Vertical trend
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
              {/* Selected Target Ring */}
              {isSelected && (
                <circle cx={px} cy={py} r={18} fill="none" stroke="#00F2FE" strokeWidth="1.5" className="radar-target-pulse" />
              )}

              {/* Realistic Commercial Airplane Silhouette SVG */}
              <g transform={`translate(${px}, ${py}) rotate(${ac.headingDeg}) scale(0.9)`}>
                {/* Airplane SVG Path */}
                <path
                  d="M0,-12 L1.5,-7 L9,-1 L9,1.5 L1.5,0.5 L1.5,6.5 L4.5,9.5 L4.5,11 L0,9.8 L-4.5,11 L-4.5,9.5 L-1.5,6.5 L-1.5,0.5 L-9,1.5 L-9,-1 L-1.5,-7 Z"
                  fill={color}
                  stroke="#050811"
                  strokeWidth="0.8"
                />
              </g>

              {/* Heading / Velocity Vector */}
              <line x1={px} y1={py} x2={vx} y2={vy} stroke={color} strokeWidth="1.2" strokeOpacity="0.8" />

              {/* Data Block (Clean, Compact, Non-overlapping) */}
              {(showLabels || isSelected) && (
                <g transform={`translate(${px + 14}, ${py - 20})`}>
                  <rect
                    x="0"
                    y="0"
                    width="62"
                    height="24"
                    fill="#0A111E"
                    fillOpacity="0.9"
                    stroke={isSelected ? "#00F2FE" : "#1B2A42"}
                    strokeWidth={isSelected ? "1.2" : "0.7"}
                    rx="3"
                  />
                  {/* Line 1: Callsign */}
                  <text x="3" y="10" fill={color} fontSize="9.5" fontFamily="monospace" fontWeight="bold">
                    {ac.callsign}
                  </text>
                  {/* Line 2: Altitude & Speed */}
                  <text x="3" y="19" fill="#E2E8F0" fontSize="8.5" fontFamily="monospace">
                    {ac.altitudeFt > 6000 ? `FL${Math.round(ac.altitudeFt / 100)}` : `${ac.altitudeFt}${vTrend}`} {Math.round(ac.speed.groundSpeedKt)}K
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
