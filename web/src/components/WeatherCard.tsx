import React from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { CloudFog, Wind as WindIcon, Gauge, Eye } from 'lucide-react';

export const WeatherCard: React.FC = () => {
  const weather = useAtcStore((s) => s.weather);
  const triggerFog = useAtcStore((s) => s.triggerFog);

  if (!weather) return null;

  const isLvp = weather.lvp.active;
  const isDenseFog = weather.visibilityM < 500;
  const visPct = Math.min(100, Math.max(6, Math.round((weather.visibilityM / 6000) * 100)));

  return (
    <div
      className={`bg-[#0A1830]/95 backdrop-blur-md border rounded-xl p-3 shadow-xl select-none text-[#FFFFFF] transition-all ${
        isLvp ? 'border-2 border-[#F5A623]' : 'border-[#F5A623]/50'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[#1A3A66] pb-2 mb-2">
        <div className="flex items-center space-x-2">
          <CloudFog className="w-4 h-4 text-[#F5A623]" />
          <h3 className="font-mono text-xs font-bold text-[#FFFFFF]">
            METEOROLOGICAL OBS: OMDB
          </h3>
        </div>
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
            isDenseFog
              ? 'bg-[#F5A623] text-[#0A1830] animate-pulse'
              : isLvp
              ? 'bg-[#F5A623]/20 text-[#F5A623] border border-[#F5A623]'
              : 'bg-[#0F2444] text-[#FFFFFF] border border-[#1A3A66]'
          }`}
        >
          {weather.flightCategory} · {weather.lvp.phase}
        </span>
      </div>

      {/* Visual Fog Density & Visibility Bar */}
      <div className="mb-2.5 bg-[#08172C] p-2 rounded-lg border border-[#1A3A66]">
        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
          <span className="text-[#FFFFFF]/80">RUNWAY VISIBILITY / FOG DENSITY</span>
          <span className="font-bold text-[#F5A623]">
            {isDenseFog ? '🌫 DENSE FOG (CAT IIIB)' : isLvp ? '☁ FOG LVP PREP' : '☀ CLEAR VFR'}
          </span>
        </div>
        <div className="w-full h-2 bg-[#0F2444] rounded-full overflow-hidden border border-[#1A3A66]">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${visPct}%`,
              background: isDenseFog ? '#EF4444' : isLvp ? '#F5A623' : '#22C55E',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Visibility & RVR */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[#FFFFFF]/80">
            <span className="flex items-center space-x-1">
              <Eye className="w-3 h-3 text-[#F5A623]" />
              <span>VISIBILITY:</span>
            </span>
            <span className={`font-mono font-bold ${weather.visibilityM < 800 ? 'text-[#F5A623]' : 'text-[#FFFFFF]'}`}>
              {weather.visibilityM} m
            </span>
          </div>

          {weather.rvr && weather.rvr.map((r) => (
            <div key={r.runway} className="flex items-center justify-between text-[#FFFFFF]/80 text-[11px]">
              <span>RVR {r.runway}:</span>
              <span className={`font-mono font-bold ${r.valueM < 550 ? 'text-[#F5A623]' : 'text-[#FFFFFF]'}`}>
                {r.valueM} m {r.trend === 'DOWN' ? '↓' : r.trend === 'UP' ? '↑' : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Wind & Pressure */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[#FFFFFF]/80">
            <span className="flex items-center space-x-1">
              <WindIcon className="w-3 h-3 text-[#F5A623]" />
              <span>WIND:</span>
            </span>
            <span className="font-mono font-bold text-[#FFFFFF]">
              {weather.wind.directionDeg}° / {weather.wind.speedKt} kt
            </span>
          </div>

          <div className="flex items-center justify-between text-[#FFFFFF]/80 text-[11px]">
            <span className="flex items-center space-x-1">
              <Gauge className="w-3 h-3 text-[#F5A623]" />
              <span>QNH:</span>
            </span>
            <span className="font-mono font-bold text-[#FFFFFF]">
              {weather.qnhHpa} hPa
            </span>
          </div>

          <div className="flex items-center justify-between text-[#FFFFFF]/80 text-[11px]">
            <span>CEILING:</span>
            <span className="font-mono font-bold text-[#FFFFFF]">
              {weather.ceilingFt} ft
            </span>
          </div>
        </div>
      </div>

      {/* Quick Weather Phase Buttons */}
      <div className="mt-2 pt-2 border-t border-[#1A3A66] flex items-center justify-between gap-1">
        <button
          onClick={() => triggerFog('CLEAR')}
          className={`flex-1 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
            !isLvp
              ? 'bg-[#F5A623] text-[#0A1830] border-[#F5A623]'
              : 'bg-[#08172C] text-[#FFFFFF]/80 border-[#1A3A66] hover:border-[#F5A623]'
          }`}
        >
          Clear (6km)
        </button>
        <button
          onClick={() => triggerFog('FOG')}
          className={`flex-1 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
            isLvp && !isDenseFog
              ? 'bg-[#F5A623] text-[#0A1830] border-[#F5A623]'
              : 'bg-[#08172C] text-[#FFFFFF]/80 border-[#1A3A66] hover:border-[#F5A623]'
          }`}
        >
          Fog (800m)
        </button>
        <button
          onClick={() => triggerFog('DENSE_FOG')}
          className={`flex-1 py-1 rounded text-[10px] font-mono font-bold border transition-colors ${
            isDenseFog
              ? 'bg-[#F5A623] text-[#0A1830] border-[#F5A623]'
              : 'bg-[#08172C] text-[#F5A623] border-[#F5A623]/60 hover:bg-[#F5A623] hover:text-[#0A1830]'
          }`}
        >
          Dense Fog (350m)
        </button>
      </div>

      {/* Raw METAR ticker at bottom */}
      <div className="mt-2 pt-1.5 border-t border-[#1A3A66]">
        <div className="font-mono text-[10px] text-[#F5A623] truncate tracking-wide">
          {weather.rawMetar}
        </div>
      </div>
    </div>
  );
};
