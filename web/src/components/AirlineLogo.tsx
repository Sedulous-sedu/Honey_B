import React, { useState } from 'react';
import { Plane } from 'lucide-react';
import { OperatingAirline } from '../types';

export interface LogoManifestEntry {
  icao: string;
  iata: string;
  name: string;
  localPath: string;
  commonsPage: string;
  sha256: string;
}

export const AIRLINE_LOGO_MANIFEST: Record<string, LogoManifestEntry> = {
  UAE: {
    icao: 'UAE',
    iata: 'EK',
    name: 'Emirates',
    localPath: '/logos/uae.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:Emirates_Logo.svg',
    sha256: '9ad8b2085c8c7f68d684437cca21c55a107d31bcbc993029405e9206fa8ed490',
  },
  FDB: {
    icao: 'FDB',
    iata: 'FZ',
    name: 'flydubai',
    localPath: '/logos/fdb.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:Fly_Dubai_logo_2010_03.svg',
    sha256: 'ac165ee3e428266adab4e35f020415643eeb2a4ff1715c87f26de5ae9a430af4',
  },
  ETD: {
    icao: 'ETD',
    iata: 'EY',
    name: 'Etihad Airways',
    localPath: '/logos/etd.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:Etihad-airways-logo.svg',
    sha256: 'cd7037313ebe53e14178ebd2607c4bbd259c762ecb6a9cc2710b7d5b5e3c518a',
  },
  ABY: {
    icao: 'ABY',
    iata: 'G9',
    name: 'Air Arabia',
    localPath: '/logos/aby.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:Air_Arabia_logo_2018.svg',
    sha256: 'ac24d904396ccd3a21871582d627ece6a6289e8d8818b4417a4ec7aa16d386e7',
  },
  ADY: {
    icao: 'ADY',
    iata: '3L',
    name: 'Air Arabia Abu Dhabi',
    localPath: '/logos/ady.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:Air_Arabia_logo_2018.svg',
    sha256: 'ac24d904396ccd3a21871582d627ece6a6289e8d8818b4417a4ec7aa16d386e7',
  },
  DLH: {
    icao: 'DLH',
    iata: 'LH',
    name: 'Lufthansa',
    localPath: '/logos/dlh.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:Lufthansa_Logo_2018.svg',
    sha256: '3fde724dce168651d9288d25814ac9cd54d1db6f1a7dc079f088197b924420fd',
  },
  THY: {
    icao: 'THY',
    iata: 'TK',
    name: 'Turkish Airlines',
    localPath: '/logos/thy.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:Turkish_Airlines_logo_2019_compact.svg',
    sha256: '703a4d8758a1557a3f0ce8d692c1ed1388bbe9f6c95d07ccfcce8e1e56528594',
  },
  IGO: {
    icao: 'IGO',
    iata: '6E',
    name: 'IndiGo',
    localPath: '/logos/igo.svg',
    commonsPage: 'https://commons.wikimedia.org/wiki/File:IndiGo_Airlines_logo.svg',
    sha256: '091ed8743d86dea8d3f5bf01a941d3638e54c1bb4828145c80a0bd3b1ef7102e',
  },
};

interface AirlineLogoProps {
  airline?: OperatingAirline | null;
  size?: 'sm' | 'md' | 'lg';
}

export const AirlineLogo: React.FC<AirlineLogoProps> = ({ airline, size = 'md' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-7 h-7'
      : size === 'lg'
      ? 'w-10 h-10'
      : 'w-9 h-9'; // 36px default container per A0 spec (32-36px)

  const icao = airline?.icao?.toUpperCase();
  const manifestItem = icao ? AIRLINE_LOGO_MANIFEST[icao] : undefined;

  if (manifestItem && !imgFailed) {
    return (
      <div
        className={`${dims} shrink-0 rounded-md bg-[#F8FAFC] border border-[#CBD5E1] p-1 flex items-center justify-center overflow-hidden shadow-sm`}
        title={`${airline?.name || manifestItem.name} (${manifestItem.icao}/${manifestItem.iata}) · Verified local SVG`}
      >
        <img
          src={manifestItem.localPath}
          alt={`${manifestItem.name} logo`}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  // Known airline from directory without a bundled local SVG file (or if image failed):
  // Show verified airline ICAO code on neutral badge — never another airline's logo!
  if (airline && airline.icao) {
    return (
      <div
        className={`${dims} shrink-0 rounded-md bg-[#0F2444] border border-[#F5A623]/60 flex flex-col items-center justify-center leading-none shadow-sm`}
        title={`${airline.name} (${airline.icao}${airline.iata ? ` / ${airline.iata}` : ''}) · Directory matched`}
      >
        <span className="text-[10px] font-mono font-bold text-[#F5A623]">{airline.icao}</span>
        {airline.iata && (
          <span className="text-[8px] font-mono text-[#FFFFFF]/70 mt-0.5">{airline.iata}</span>
        )}
      </div>
    );
  }

  // Unresolved identity / private registration / hex-only / surface transponder:
  // Show neutral aircraft icon
  return (
    <div
      className={`${dims} shrink-0 rounded-md bg-[#08172C] border border-[#1A3A66] flex items-center justify-center text-[#FFFFFF]/60`}
      title="Operating airline unresolved or non-airline transponder"
    >
      <Plane className="w-4 h-4 transform -rotate-45" />
    </div>
  );
};

