import React, { useEffect, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Crosshair, Globe, MapPin } from 'lucide-react';

export interface WorldGuessMapProps {
  guessCoord: { lat: number; lon: number } | null;
  actualCoord?: { lat: number; lon: number } | null;
  onSelectGuessCoord: (lat: number, lon: number) => void;
  readOnly?: boolean;
  quotaExceeded: boolean;
  heightClass?: string;
}

const REFERENCE_ANCHORS: Array<{ label: string; lat: number; lon: number }> = [
  { label: 'Kyoto, JP', lat: 34.998582, lon: 135.780895 },
  { label: 'Reykjavik, IS', lat: 64.142665, lon: -21.928412 },
  { label: 'Valparaiso, CL', lat: -33.041635, lon: -71.627345 },
  { label: 'Marrakech, MA', lat: 31.62482, lon: -7.99218 },
  { label: 'Paris, FR', lat: 48.85942, lon: 2.29978 },
  { label: 'New York, US', lat: 40.70328, lon: -73.98962 },
];

/**
 * Interactive World Guess Map combining @vis.gl/react-google-maps (`AdvancedMarker`)
 * and a synchronized deterministic WGS84 Geodesic Projection Plotter so coordinate pinning
 * works both with live Google Maps tiles and in offline/headless environments.
 */
export const WorldGuessMap: React.FC<WorldGuessMapProps> = ({
  guessCoord,
  actualCoord = null,
  onSelectGuessCoord,
  readOnly = false,
  quotaExceeded,
  heightClass = 'h-56',
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const hasGoogleMapsKey = Boolean(apiKey && apiKey.trim().length > 0 && !quotaExceeded);
  const [mapEngineMode, setMapEngineMode] = useState<'google' | 'geodesic_grid'>(
    hasGoogleMapsKey ? 'google' : 'geodesic_grid'
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (quotaExceeded) {
      setMapEngineMode('geodesic_grid');
    }
  }, [quotaExceeded]);

  // Draw the WGS84 Geodesic Coordinate Plotter whenever in geodesic_grid mode or when coords update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#111315';
    ctx.fillRect(0, 0, w, h);

    // Draw 30-degree graticule grid lines
    ctx.strokeStyle = '#262a30';
    ctx.lineWidth = 1;
    for (let lon = -150; lon <= 150; lon += 30) {
      const x = ((lon + 180) / 360) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Equator & Prime Meridian emphasis
    ctx.strokeStyle = '#343942';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Simplified continental bounding polygons for clear spatial orientation
    const continents: Array<Array<[number, number]>> = [
      // North America
      [[-165, 68], [-130, 70], [-60, 50], [-80, 25], [-105, 18], [-125, 48]],
      // South America
      [[-80, 10], [-35, -6], [-48, -28], [-70, -54], [-75, -15]],
      // Europe
      [[-10, 36], [30, 38], [45, 68], [10, 71], [-10, 58]],
      // Africa
      [[-17, 15], [-5, 35], [32, 31], [50, 11], [35, -34], [18, -34], [8, 4]],
      // Asia
      [[30, 40], [60, 68], [145, 65], [142, 35], [104, 2], [78, 8], [48, 14]],
      // Australia
      [[114, -22], [153, -26], [147, -38], [115, -34]],
    ];

    ctx.fillStyle = '#1f242b';
    ctx.strokeStyle = '#475569';
    for (const poly of continents) {
      ctx.beginPath();
      poly.forEach(([lon, lat], idx) => {
        const px = ((lon + 180) / 360) * w;
        const py = ((90 - lat) / 180) * h;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const toCanvasXY = (lat: number, lon: number): [number, number] => [
      ((lon + 180) / 360) * w,
      ((90 - lat) / 180) * h,
    ];

    // Geodesic connector line when both guess and actual coordinates exist
    if (guessCoord && actualCoord) {
      const [gx, gy] = toCanvasXY(guessCoord.lat, guessCoord.lon);
      const [ax, ay] = toCanvasXY(actualCoord.lat, actualCoord.lon);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Guess Pin
    if (guessCoord) {
      const [gx, gy] = toCanvasXY(guessCoord.lat, guessCoord.lon);
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Draw Actual Location Pin (on results screen)
    if (actualCoord) {
      const [ax, ay] = toCanvasXY(actualCoord.lat, actualCoord.lon);
      ctx.fillStyle = '#16a34a';
      ctx.strokeStyle = '#f3f4f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, ay, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [guessCoord, actualCoord, mapEngineMode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    const lon = Number((normX * 360 - 180).toFixed(4));
    const lat = Number((90 - normY * 180).toFixed(4));
    onSelectGuessCoord(lat, lon);
  };

  const handleGoogleMapClick = (e: MapMouseEvent) => {
    if (readOnly) return;
    const latLng = e.detail.latLng;
    if (latLng) {
      onSelectGuessCoord(Number(latLng.lat.toFixed(4)), Number(latLng.lng.toFixed(4)));
    }
  };

  return (
    <div className="flex flex-col border border-[#262a30] bg-[#181b1f] rounded-[4px] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#262a30] bg-[#111315] text-xs">
        <div className="flex items-center gap-2 text-[#f3f4f6] font-semibold">
          <Globe className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
          <span>WGS84 Target Selection Map</span>
          {guessCoord ? (
            <span className="font-mono text-[#9ca3af] ml-1">
              {guessCoord.lat.toFixed(4)}°, {guessCoord.lon.toFixed(4)}°
            </span>
          ) : (
            <span className="text-[#9ca3af] font-normal ml-1">Click map to place marker</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasGoogleMapsKey && (
            <button
              type="button"
              onClick={() =>
                setMapEngineMode((prev) => (prev === 'google' ? 'geodesic_grid' : 'google'))
              }
              className="px-2 py-0.5 text-[11px] border border-[#262a30] bg-[#181b1f] text-[#f3f4f6] hover:border-[#0284c7] rounded-[4px] cursor-pointer"
            >
              {mapEngineMode === 'google' ? 'Use Graticule Plotter' : 'Use Google Maps'}
            </button>
          )}
        </div>
      </div>

      <div className={`relative w-full ${heightClass} bg-[#111315]`}>
        {mapEngineMode === 'google' && hasGoogleMapsKey ? (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={
              actualCoord
                ? { lat: actualCoord.lat, lng: actualCoord.lon }
                : { lat: 25, lng: 15 }
            }
            defaultZoom={actualCoord ? 4 : 2}
            gestureHandling="greedy"
            disableDefaultUI={true}
            onClick={handleGoogleMapClick}
            style={{ width: '100%', height: '100%' }}
          >
            {guessCoord && (
              <AdvancedMarker position={{ lat: guessCoord.lat, lng: guessCoord.lon }}>
                <div className="px-1.5 py-0.5 bg-[#0284c7] text-[#f3f4f6] text-[10px] font-mono font-semibold border border-[#f3f4f6] rounded-[4px]">
                  GUESS
                </div>
              </AdvancedMarker>
            )}
            {actualCoord && (
              <AdvancedMarker position={{ lat: actualCoord.lat, lng: actualCoord.lon }}>
                <div className="px-1.5 py-0.5 bg-[#16a34a] text-[#f3f4f6] text-[10px] font-mono font-semibold border border-[#f3f4f6] rounded-[4px]">
                  ACTUAL
                </div>
              </AdvancedMarker>
            )}
          </GoogleMap>
        ) : (
          <canvas
            ref={canvasRef}
            width={640}
            height={300}
            data-testid="geodesic-guess-canvas"
            onClick={handleCanvasClick}
            className={`w-full h-full block ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`}
          />
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-[#262a30] bg-[#111315] text-[11px] text-[#9ca3af]">
          <div className="flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
            <span>Click map to place your deduction pin</span>
          </div>
          {guessCoord ? (
            <span className="font-mono text-[#0284c7] font-semibold">
              Pin: {guessCoord.lat.toFixed(2)}°, {guessCoord.lon.toFixed(2)}°
            </span>
          ) : (
            <span className="text-[10px] text-[#6b7280]">No pin placed yet</span>
          )}
        </div>
      )}
    </div>
  );
};
