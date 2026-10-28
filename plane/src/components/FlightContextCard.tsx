import type { AircraftData } from '../types';
import { AircraftTelemetryCard } from './AircraftTelemetryCard';

interface Props {
  flight: AircraftData;
  isStale?: boolean;
}

export function FlightContextCard({ flight, isStale }: Props) {
  return <AircraftTelemetryCard aircraft={flight} isStale={isStale} />;
}
