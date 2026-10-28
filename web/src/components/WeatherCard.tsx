import React from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { CloudFog, Wind as WindIcon, Gauge, Eye } from 'lucide-react';

export const WeatherCard: React.FC = () => {
  const weather = useAtcStore((s) => s.weather);

  if (!weather) return null;

  const isLvp = weather.lvp.active;
  const isDenseFog = weather.visibilityM < 500;

  return (
    <div className="bg-[#0D1526]/90 backdrop-blur-md border border-[#1A2C4A] rounded-xl p-3 shadow-xl select-none">
      <div className="flex items-center justify-between border-b border-[#1A2C4A] pb-2 mb-2">
        <div className="flex items-center space-x-2">
          <CloudFog className={`w-4 h-4 ${isDenseFog ? 'text-rose-400' : isLvp ? 'text-amber-400' : 'text-cyan-400'}`} />
          <h3 className="font-mono text-xs font-bold text-slate-200">
            METEOROLOGICAL OBS: OMDB
          </h3>
        </div>
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
            isDenseFog
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
              : isLvp
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          }`}
        >
          {weather.flightCategory} · {weather.lvp.phase}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Visibility & RVR */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center space-x-1">
              <Eye className="w-3 h-3 text-cyan-400" />
              <span>VISIBILITY:</span>
            </span>
            <span className={`font-mono font-bold ${weather.visibilityM < 800 ? 'text-amber-300' : 'text-slate-100'}`}>
              {weather.visibilityM} m
            </span>
          </div>

          {weather.rvr && weather.rvr.map((r) => (
            <div key={r.runway} className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>RVR {r.runway}:</span>
              <span className={`font-mono font-bold ${r.valueM < 550 ? 'text-rose-400' : 'text-slate-200'}`}>
                {r.valueM} m {r.trend === 'DOWN' ? '↓' : r.trend === 'UP' ? '↑' : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Wind & Pressure */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center space-x-1">
              <WindIcon className="w-3 h-3 text-cyan-400" />
              <span>WIND:</span>
            </span>
            <span className="font-mono font-bold text-slate-100">
              {weather.wind.directionDeg}° / {weather.wind.speedKt} kt
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="flex items-center space-x-1">
              <Gauge className="w-3 h-3 text-cyan-400" />
              <span>QNH:</span>
            </span>
            <span className="font-mono font-bold text-slate-200">
              {weather.qnhHpa} hPa
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>CEILING:</span>
            <span className="font-mono font-bold text-slate-200">
              {weather.ceilingFt} ft
            </span>
          </div>
        </div>
      </div>

      {/* Raw METAR ticker at bottom */}
      <div className="mt-2 pt-2 border-t border-[#162338]">
        <div className="font-mono text-[10px] text-slate-400 truncate tracking-wide">
          {weather.rawMetar}
        </div>
      </div>
    </div>
  );
};
