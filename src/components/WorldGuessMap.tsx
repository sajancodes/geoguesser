import React, { useEffect, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Check, Crosshair, Globe, MapPin, Search, X } from 'lucide-react';
import { searchWorldPlaces, type SearchPlaceItem } from '../packages/coverage/searchGazetteer';

export interface WorldGuessMapProps {
  guessCoord: { lat: number; lon: number } | null;
  actualCoord?: { lat: number; lon: number } | null;
  onSelectGuessCoord: (lat: number, lon: number) => void;
  readOnly?: boolean;
  quotaExceeded: boolean;
  heightClass?: string;
}

function MapPanController({ panTarget }: { panTarget: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && panTarget) {
      map.panTo(panTarget);
      map.setZoom(5);
    }
  }, [map, panTarget]);
  return null;
}

/**
 * Interactive World Guess Map combining @vis.gl/react-google-maps (`AdvancedMarker`)
 * and a synchronized deterministic WGS84 Geodesic Projection Plotter with instant search
 * across all 200+ countries, capitals, and major world cities.
 */
export const WorldGuessMap: React.FC<WorldGuessMapProps> = ({
  guessCoord,
  actualCoord = null,
  onSelectGuessCoord,
  readOnly = false,
  quotaExceeded,
  heightClass = 'h-56',
}) => {
  const apiKey = (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    (typeof window !== 'undefined' ? localStorage.getItem('earth_uncovered_gmp_key') : '') ||
    ''
  ).trim();
  const hasGoogleMapsKey = Boolean(apiKey && apiKey.length > 0 && !quotaExceeded);
  const [mapEngineMode, setMapEngineMode] = useState<'google' | 'geodesic_grid'>(
    hasGoogleMapsKey ? 'google' : 'geodesic_grid'
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pinnedLabel, setPinnedLabel] = useState<string | null>(null);
  const [panTarget, setPanTarget] = useState<{ lat: number; lng: number } | null>(null);

  const searchResults = searchWorldPlaces(searchQuery, 7);

  useEffect(() => {
    if (quotaExceeded) {
      setMapEngineMode('geodesic_grid');
    }
  }, [quotaExceeded]);

  // Handle place selection from search
  const handleSelectPlace = (item: SearchPlaceItem) => {
    onSelectGuessCoord(item.lat, item.lon);
    setPanTarget({ lat: item.lat, lng: item.lon });
    setPinnedLabel(`${item.name} (${item.lat.toFixed(2)}°, ${item.lon.toFixed(2)}°)`);
    setSearchQuery(item.name);
    setShowSuggestions(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        const idx =
          highlightedIndex >= 0 && highlightedIndex < searchResults.length
            ? highlightedIndex
            : 0;
        handleSelectPlace(searchResults[idx]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

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
    setPinnedLabel(null);
    onSelectGuessCoord(lat, lon);
  };

  const handleGoogleMapClick = (e: MapMouseEvent) => {
    if (readOnly) return;
    const latLng = e.detail.latLng;
    if (latLng) {
      setPinnedLabel(null);
      onSelectGuessCoord(Number(latLng.lat.toFixed(4)), Number(latLng.lng.toFixed(4)));
    }
  };

  return (
    <div className="flex flex-col border border-[#262a30] bg-[#181b1f] rounded-[4px] overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#262a30] bg-[#111315] text-xs">
        <div className="flex items-center gap-2 text-[#f3f4f6] font-semibold">
          <Globe className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
          <span>WGS84 Target Selection Map</span>
          {guessCoord ? (
            <span className="font-mono text-[#0284c7] font-semibold ml-1">
              {guessCoord.lat.toFixed(4)}°, {guessCoord.lon.toFixed(4)}°
            </span>
          ) : (
            <span className="text-[#9ca3af] font-normal ml-1">Click map or search below to pick</span>
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

      {/* Instant Search Bar on Map for Easy Picking */}
      {!readOnly && (
        <div className="relative border-b border-[#262a30] bg-[#14171a] p-2">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
                setHighlightedIndex(0);
              }}
              onFocus={() => {
                if (searchQuery.trim().length > 0) setShowSuggestions(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search country, capital, city or place to pin (e.g. Nepal, France, Tokyo, Canada...)"
              className="w-full pl-8 pr-7 py-1.5 bg-[#181b1f] border border-[#262a30] focus:border-[#0284c7] rounded-[4px] text-xs text-[#f3f4f6] placeholder-[#6b7280] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowSuggestions(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#f3f4f6] p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showSuggestions && searchResults.length > 0 && (
            <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-[#181b1f] border border-[#262a30] rounded-[4px] shadow-2xl max-h-52 overflow-y-auto">
              {searchResults.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPlace(item)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between border-b border-[#262a30]/60 hover:bg-[#202732] cursor-pointer transition-colors ${
                    idx === highlightedIndex ? 'bg-[#1b2533] text-[#0284c7]' : 'text-[#f3f4f6]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
                    <div>
                      <span className="font-semibold text-[#f3f4f6]">{item.name}</span>
                      <span className="text-[11px] text-[#9ca3af] ml-1.5">
                        {item.type === 'country' ? `[${item.countryCode}]` : `(${item.country})`}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-[#9ca3af] shrink-0">
                    {item.lat.toFixed(2)}°, {item.lon.toFixed(2)}°
                  </span>
                </button>
              ))}
            </div>
          )}

          {pinnedLabel && (
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#0284c7] font-mono px-0.5">
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3 text-[#16a34a]" strokeWidth={3} />
                <span>Pinned: <strong>{pinnedLabel}</strong></span>
              </span>
              <button
                type="button"
                onClick={() => setPinnedLabel(null)}
                className="text-[10px] text-[#9ca3af] hover:text-[#f3f4f6] underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Map Viewport */}
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
            <MapPanController panTarget={panTarget} />
            {guessCoord && (
              <AdvancedMarker position={{ lat: guessCoord.lat, lng: guessCoord.lon }}>
                <div className="px-1.5 py-0.5 bg-[#0284c7] text-[#f3f4f6] text-[10px] font-mono font-semibold border border-[#f3f4f6] rounded-[4px] shadow-lg">
                  GUESS
                </div>
              </AdvancedMarker>
            )}
            {actualCoord && (
              <AdvancedMarker position={{ lat: actualCoord.lat, lng: actualCoord.lon }}>
                <div className="px-1.5 py-0.5 bg-[#16a34a] text-[#f3f4f6] text-[10px] font-mono font-semibold border border-[#f3f4f6] rounded-[4px] shadow-lg">
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
            <span>Search above or click map to place deduction pin</span>
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
