import React from 'react';
import { TrafficList } from './TrafficList';
import { RadarScope } from './RadarScope';
import { HoneyBPanel } from './HoneyBPanel';
import { WeatherCard } from './WeatherCard';
import { FlightDetail } from './FlightDetail';

export const Page1MainWall: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#070B12]">
      {/* Upper Area: Traffic List | Center Radar Scope + Weather | Right Honey B */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Traffic List (28 tracks) */}
        <TrafficList />

        {/* Center: Radar Scope with Weather overlay */}
        <div className="flex-1 relative flex flex-col p-2 bg-[#070B12]">
          {/* Main Scope */}
          <RadarScope />

          {/* Weather card floating top-right over radar */}
          <div className="absolute top-4 right-4 z-20 w-80">
            <WeatherCard />
          </div>
        </div>

        {/* Right: Honey B Decision Support Panel */}
        <HoneyBPanel />
      </div>

      {/* Bottom: Selected Aircraft Telemetry Drawer */}
      <FlightDetail />
    </div>
  );
};
