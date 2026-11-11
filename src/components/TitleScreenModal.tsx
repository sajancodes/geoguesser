import React from 'react';
import { Compass, Database, Play } from 'lucide-react';
import type { GameModeId, GraphicsCapabilityReport } from '../packages/shared-types';

export interface TitleScreenModalProps {
  selectedMode: GameModeId;
  onSelectMode: (mode: GameModeId) => void;
  countryFilter: string;
  onChangeCountryFilter: (code: string) => void;
  seedCode: string;
  onChangeSeedCode: (seed: string) => void;
  eligibleCount: number;
  totalLocationsCount: number;
  capabilities: GraphicsCapabilityReport | null;
  isStarting: boolean;
  onStartGame: () => void;
  onOpenCoverageDrawer: () => void;
}

const MODE_DEFINITIONS: Array<{
  id: GameModeId;
  label: string;
  spec: string;
}> = [
  {
    id: 'classic',
    label: 'Classic Survey',
    spec: '5 rounds · 120s timer · First-person movement · Server geodesic scoring',
  },
  {
    id: 'explorer',
    label: 'Explorer Telemetry',
    spec: 'Unlimited time · Live WGS84 / ECEF / ENU readout · Quadtree chunk inspector',
  },
  {
    id: 'no_movement',
    label: 'Stationary Pan (No Move)',
    spec: '5 rounds · Locked spawn coordinates · 360° camera rotation only',
  },
  {
    id: 'country_challenge',
    label: 'Country Filter',
    spec: 'Restrict eligible locations to a target national coverage sector (k = 250 km)',
  },
  {
    id: 'duel_seed',
    label: 'Synchronized Seed Duel',
    spec: 'Deterministic seed code for synchronized 2-player location & scoring comparison',
  },
];

export const TitleScreenModal: React.FC<TitleScreenModalProps> = ({
  selectedMode,
  onSelectMode,
  countryFilter,
  onChangeCountryFilter,
  seedCode,
  onChangeSeedCode,
  eligibleCount,
  totalLocationsCount,
  capabilities,
  isStarting,
  onStartGame,
  onOpenCoverageDrawer,
}) => {
  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-4 sm:p-8">
      {/* Top Status Strip over calm negative space */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 border border-[#262a30] bg-[#111315] px-4 py-2.5 rounded-[4px] max-w-2xl">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="inline-block w-2 h-2 rounded-full bg-[#16a34a]" />
          <span className="font-semibold text-[#f3f4f6]">Coverage Eligibility Active</span>
          <span className="text-[#9ca3af] font-mono">
            {eligibleCount}/{totalLocationsCount} Validated 3D Sectors
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {capabilities && (
            <span className="font-mono text-[#9ca3af]">
              Renderer: {capabilities.backend.toUpperCase()}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenCoverageDrawer}
            className="flex items-center gap-1.5 px-2.5 py-1 border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#f3f4f6] rounded-[4px] cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
            <span>Coverage & Ingestion</span>
          </button>
        </div>
      </div>

      {/* Left-Third Asymmetric Title Lockup & Mode Configuration Panel */}
      <main className="pointer-events-auto w-full max-w-xl border border-[#262a30] bg-[#111315] p-5 sm:p-6 rounded-[4px]">
        {/* Custom Inline SVG Geospatial Title Emblem */}
        <div className="flex items-center gap-3.5 pb-4 border-b border-[#262a30]">
          <svg
            viewBox="0 0 48 48"
            className="w-12 h-12 shrink-0"
            role="img"
            aria-label="Earth Uncovered Geodetic Emblem"
          >
            <rect x="2" y="2" width="44" height="44" rx="4" fill="#181b1f" stroke="#262a30" strokeWidth="2" />
            <circle cx="24" cy="24" r="15" fill="none" stroke="#0284c7" strokeWidth="1.75" />
            <ellipse cx="24" cy="24" rx="8" ry="15" fill="none" stroke="#9ca3af" strokeWidth="1.25" />
            <line x1="9" y1="24" x2="39" y2="24" stroke="#9ca3af" strokeWidth="1.25" />
            <line x1="24" y1="9" x2="24" y2="39" stroke="#0284c7" strokeWidth="1.5" />
            <rect x="21" y="21" width="6" height="6" fill="#0284c7" />
          </svg>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#f3f4f6]">
              EARTH UNCOVERED
            </h1>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              Real-World Street View 3D &amp; Photorealistic 3D Spatial Deduction Platform
            </p>
          </div>
        </div>

        {/* Mode Selection List */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-[#f3f4f6] mb-2">
            <span className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
              <span>Select Exploration Protocol</span>
            </span>
            <span className="font-mono text-[#9ca3af]">WGS84 / ENU</span>
          </div>

          <div className="divide-y divide-[#262a30] border border-[#262a30] rounded-[4px] bg-[#181b1f]">
            {MODE_DEFINITIONS.map((m) => {
              const selected = selectedMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMode(m.id)}
                  className={`w-full text-left px-3.5 py-2.5 flex items-start justify-between gap-3 cursor-pointer ${
                    selected ? 'bg-[#1f2630]' : 'hover:bg-[#1c2026]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold text-[#f3f4f6] flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          selected ? 'bg-[#0284c7]' : 'bg-[#262a30]'
                        }`}
                      />
                      <span>{m.label}</span>
                    </div>
                    <div className="text-[11px] text-[#9ca3af] mt-0.5 pl-4">{m.spec}</div>
                  </div>
                  <span className="font-mono text-[11px] text-[#9ca3af] shrink-0">
                    {selected ? 'SELECTED' : 'SELECT'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conditional Mode Parameters */}
        {selectedMode === 'country_challenge' && (
          <div className="mt-3 pt-3 border-t border-[#262a30] flex items-center justify-between gap-3 text-xs">
            <label htmlFor="country-filter-select" className="text-[#f3f4f6] font-semibold">
              Target Country Sector
            </label>
            <select
              id="country-filter-select"
              value={countryFilter}
              onChange={(e) => onChangeCountryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#181b1f] border border-[#262a30] rounded-[4px] text-[#f3f4f6] font-mono text-xs"
            >
              <option value="JP">JP — Japan (Kyoto Prefecture)</option>
              <option value="IS">IS — Iceland (Capital Region)</option>
              <option value="CL">CL — Chile (Valparaiso Region)</option>
              <option value="MA">MA — Morocco (Marrakesh-Safi)</option>
              <option value="FR">FR — France (Paris 7e)</option>
              <option value="US">US — United States (New York)</option>
            </select>
          </div>
        )}

        {selectedMode === 'duel_seed' && (
          <div className="mt-3 pt-3 border-t border-[#262a30] flex items-center justify-between gap-3 text-xs">
            <label htmlFor="duel-seed-input" className="text-[#f3f4f6] font-semibold">
              Shared Duel Seed Code
            </label>
            <input
              id="duel-seed-input"
              type="text"
              value={seedCode}
              onChange={(e) => onChangeSeedCode(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 24))}
              placeholder="SEED-ALPHA-1"
              className="px-2.5 py-1.5 bg-[#181b1f] border border-[#262a30] rounded-[4px] text-[#f3f4f6] font-mono text-xs w-48"
            />
          </div>
        )}

        {/* Primary Action CTA */}
        <div className="mt-4 pt-4 border-t border-[#262a30] flex items-center justify-between gap-3">
          <button
            type="button"
            data-start="true"
            disabled={isStarting}
            onClick={(e) => {
              e.currentTarget.blur();
              onStartGame();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-50 text-[#f3f4f6] font-semibold text-sm rounded-[4px] cursor-pointer"
          >
            <Play className="w-4 h-4" strokeWidth={1.75} />
            <span>{isStarting ? 'Initializing 3D Stream...' : 'Start Exploration'}</span>
          </button>
        </div>
      </main>

      {/* Bottom Safe-Margin Flat Control Hint Line */}
      <div className="pointer-events-none text-xs font-mono text-[#f3f4f6] bg-[#111315] border border-[#262a30] px-3.5 py-2 rounded-[4px] self-start">
        WASD Move · Shift Sprint · Drag / Pointer-Lock Look · M Toggle Map · Esc Pause
      </div>
    </div>
  );
};
