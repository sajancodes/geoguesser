import React, { useState } from 'react';
import { Check, Cpu, FileUp, Layers, X } from 'lucide-react';
import type {
  CoverageEligibilityResult,
  CoverageLayerStatus,
  PerformanceProfileId,
  WGS84Coordinate,
} from '../packages/shared-types';
import {
  decodeSplatBinaryBuffer,
  type DecodedGaussianSplatCloud,
} from '../packages/splat-renderer/splatBinary';
import { PERFORMANCE_PROFILES } from '../packages/rendering/capabilities';

export interface CoverageRegistryEntry {
  locationId: string;
  title: string;
  countryCode: string;
  countryName: string;
  regionName: string;
  originWGS84: WGS84Coordinate;
  h3Index: string;
  coverageLayers: CoverageLayerStatus;
  captureDate: string;
  assetVersion: string;
  dataSource: string;
  license: string;
  visualQualityScore: number;
  navigationQualityScore: number;
  eligibility: CoverageEligibilityResult;
}

export interface CoverageAndIngestionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: CoverageRegistryEntry[];
  activeProfile: PerformanceProfileId;
  onSelectProfile: (profile: PerformanceProfileId) => void;
  reducedEffects: boolean;
  onToggleReducedEffects: (reduced: boolean) => void;
  sensitivity: number;
  onChangeSensitivity: (val: number) => void;
  onLoadLocationInExplorer: (locationId: string) => void;
  onIngestCustomSplatCloud: (cloud: DecodedGaussianSplatCloud, label: string) => void;
}

export const CoverageAndIngestionDrawer: React.FC<CoverageAndIngestionDrawerProps> = ({
  isOpen,
  onClose,
  entries,
  activeProfile,
  onSelectProfile,
  reducedEffects,
  onToggleReducedEffects,
  sensitivity,
  onChangeSensitivity,
  onLoadLocationInExplorer,
  onIngestCustomSplatCloud,
}) => {
  const [activeTab, setActiveTab] = useState<'coverage' | 'ingestion' | 'performance'>('coverage');
  const [ingestionStatus, setIngestionStatus] = useState<{
    kind: 'idle' | 'ok' | 'error';
    message: string;
  }>({
    kind: 'idle',
    message: 'Select a .splat (32 bytes/record) or ASCII .ply file, or run a synthetic PLY verification payload.',
  });

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuf = await file.arrayBuffer();
      const validation = decodeSplatBinaryBuffer(new Uint8Array(arrayBuf));
      if (!validation.valid || !validation.cloud) {
        setIngestionStatus({
          kind: 'error',
          message: validation.error ?? 'Failed to validate splat file.',
        });
        return;
      }

      onIngestCustomSplatCloud(validation.cloud, file.name);
      setIngestionStatus({
        kind: 'ok',
        message: `Mounted ${validation.cloud.splatCount.toLocaleString()} Gaussians (${validation.format}) from "${file.name}" into local ENU origin.`,
      });
    } catch (err) {
      setIngestionStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to read uploaded file.',
      });
    }
  };

  const handleSamplePlyIngestion = () => {
    const rows: string[] = [
      'ply',
      'format ascii 1.0',
      'element vertex 180',
      'property float x',
      'property float y',
      'property float z',
      'property uchar red',
      'property uchar green',
      'property uchar blue',
      'property float scale_0',
      'property float scale_1',
      'property float scale_2',
      'end_header',
    ];

    for (let i = 0; i < 180; i++) {
      const angle = (i / 180) * Math.PI * 4;
      const radius = 1.8 + (i % 5) * 0.25;
      const x = (Math.cos(angle) * radius).toFixed(3);
      const y = (0.4 + (i / 180) * 3.2).toFixed(3);
      const z = (Math.sin(angle) * radius - 4.0).toFixed(3);
      rows.push(`${x} ${y} ${z} 20 165 233 0.24 0.24 0.24`);
    }

    const bytes = new TextEncoder().encode(rows.join('\n'));
    const res = decodeSplatBinaryBuffer(bytes);
    if (res.valid && res.cloud) {
      onIngestCustomSplatCloud(res.cloud, 'calibration-helix.ply');
      setIngestionStatus({
        kind: 'ok',
        message: `Validated and mounted 180-vertex ASCII PLY calibration point cloud at local ENU spawn.`,
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Coverage Registry, Asset Ingestion, and Performance Governor"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111315]/85"
    >
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col border border-[#262a30] bg-[#111315] rounded-[4px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#262a30] bg-[#181b1f]">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-[#0284c7]" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-[#f3f4f6]">
              Geospatial Coverage Registry, Asset Ingestion & Hardware Profiles
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Coverage Registry"
            onClick={onClose}
            className="p-1 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] rounded-[4px] cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#262a30] bg-[#111315] px-5 gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('coverage')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 cursor-pointer ${
              activeTab === 'coverage'
                ? 'border-[#0284c7] text-[#f3f4f6]'
                : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'
            }`}
          >
            Coverage Database ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ingestion')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 cursor-pointer ${
              activeTab === 'ingestion'
                ? 'border-[#0284c7] text-[#f3f4f6]'
                : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'
            }`}
          >
            .SPLAT / .PLY Ingestion Pipeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 cursor-pointer ${
              activeTab === 'performance'
                ? 'border-[#0284c7] text-[#f3f4f6]'
                : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'
            }`}
          >
            Hardware & Controls
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'coverage' && (
            <div className="space-y-3">
              <p className="text-xs text-[#9ca3af]">
                Locations must pass all 6 coverage layer checks (Geographic, Terrain, Road, Building,
                Photorealistic 3D Splat, and Collision Proxy) plus visual (&ge;80) and navigation (&ge;85)
                thresholds before entering playable game rounds. Incomplete sectors are disabled with explicit
                reasons.
              </p>

              <div className="divide-y divide-[#262a30] border border-[#262a30] rounded-[4px] bg-[#181b1f]">
                {entries.map((entry) => {
                  const isEligible = entry.eligibility.eligible;
                  return (
                    <div key={entry.locationId} className="p-3.5 flex flex-col gap-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold text-[#f3f4f6]">
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${
                                isEligible ? 'bg-[#16a34a]' : 'bg-[#d97706]'
                              }`}
                            />
                            <span>
                              {entry.title} — {entry.regionName}, {entry.countryName}
                            </span>
                            <span className="font-mono text-[#9ca3af]">v{entry.assetVersion}</span>
                          </div>
                          <div className="font-mono text-[11px] text-[#9ca3af] mt-0.5">
                            WGS84: {entry.originWGS84.lat.toFixed(4)}°, {entry.originWGS84.lon.toFixed(4)}° · Elev{' '}
                            {entry.originWGS84.elevation}m · H3: {entry.h3Index}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-[#9ca3af]">
                            Visual {entry.visualQualityScore} · Nav {entry.navigationQualityScore}
                          </span>
                          <button
                            type="button"
                            disabled={!isEligible}
                            onClick={() => {
                              onLoadLocationInExplorer(entry.locationId);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs font-semibold border border-[#262a30] bg-[#111315] hover:border-[#0284c7] disabled:opacity-40 disabled:cursor-not-allowed text-[#f3f4f6] rounded-[4px] cursor-pointer"
                          >
                            {isEligible ? 'Inspect in Explorer' : 'Ineligible Sector'}
                          </button>
                        </div>
                      </div>

                      {/* 6-Layer Matrix */}
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 text-[11px] font-mono pt-1">
                        {(
                          [
                            ['GEO', entry.coverageLayers.geographic],
                            ['DEM', entry.coverageLayers.terrain],
                            ['ROAD', entry.coverageLayers.road],
                            ['BLDG', entry.coverageLayers.building],
                            ['SPLAT', entry.coverageLayers.photorealistic3D],
                            ['COLLISION', entry.coverageLayers.collision],
                          ] as const
                        ).map(([label, ok]) => (
                          <div
                            key={label}
                            className="px-2 py-1 border border-[#262a30] bg-[#111315] rounded-[4px] flex items-center gap-1.5"
                          >
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full ${
                                ok ? 'bg-[#16a34a]' : 'bg-[#dc2626]'
                              }`}
                            />
                            <span className="text-[#f3f4f6]">{label}</span>
                          </div>
                        ))}
                      </div>

                      {!isEligible && entry.eligibility.reasons.length > 0 && (
                        <div className="text-[11px] text-[#9ca3af] border-t border-[#262a30] pt-1.5 flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-[#dc2626] shrink-0" />
                          <span>Blocked by Eligibility Service: {entry.eligibility.reasons.join('; ')}</span>
                        </div>
                      )}

                      <div className="text-[11px] text-[#9ca3af] font-mono">
                        Source: {entry.dataSource} · License: {entry.license} · Captured: {entry.captureDate}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'ingestion' && (
            <div className="space-y-4 text-xs">
              <div className="border border-[#262a30] bg-[#181b1f] p-4 rounded-[4px] space-y-3">
                <div className="flex items-center gap-2 font-semibold text-[#f3f4f6]">
                  <FileUp className="w-4 h-4 text-[#0284c7]" strokeWidth={1.75} />
                  <span>Runtime Binary Gaussian Splat (.splat / .ply) Ingestion</span>
                </div>
                <p className="text-[#9ca3af]">
                  Upload a standard 32-byte-per-splat binary <code>.splat</code> file or an ASCII{' '}
                  <code>.ply</code> point/splat cloud. The binary validator verifies float finiteness,
                  normalizes rotor quaternions, enforces the browser chunk safety budget (&le;250,000 splats),
                  and mounts the cloud directly at the current local ENU origin.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <label className="px-3 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-[#f3f4f6] font-semibold rounded-[4px] cursor-pointer inline-flex items-center gap-2">
                    <FileUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Select .splat / .ply File</span>
                    <input
                      type="file"
                      accept=".splat,.ply"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleSamplePlyIngestion}
                    className="px-3 py-2 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] font-semibold rounded-[4px] cursor-pointer"
                  >
                    Mount Calibration .PLY Helix (180 Splats)
                  </button>
                </div>

                <div className="p-3 border border-[#262a30] bg-[#111315] rounded-[4px] flex items-center gap-2 font-mono text-[11px]">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      ingestionStatus.kind === 'ok'
                        ? 'bg-[#16a34a]'
                        : ingestionStatus.kind === 'error'
                          ? 'bg-[#dc2626]'
                          : 'bg-[#d97706]'
                    }`}
                  />
                  <span className="text-[#f3f4f6]">{ingestionStatus.message}</span>
                </div>
              </div>

              <div className="border border-[#262a30] bg-[#181b1f] p-4 rounded-[4px] space-y-2">
                <div className="font-semibold text-[#f3f4f6]">
                  Offline Photogrammetry & COLMAP Processing Pipeline Specification
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="p-2.5 border border-[#262a30] bg-[#111315] rounded-[4px]">
                    <div className="text-[#f3f4f6] font-semibold">1. CAPTURE</div>
                    <div className="text-[#9ca3af] mt-1">
                      Multi-view frames + RTK-GPS WGS84 EXIF timestamps
                    </div>
                  </div>
                  <div className="p-2.5 border border-[#262a30] bg-[#111315] rounded-[4px]">
                    <div className="text-[#f3f4f6] font-semibold">2. RECONSTRUCT</div>
                    <div className="text-[#9ca3af] mt-1">
                      COLMAP SfM + Splatfacto 3DGS + Poisson collision mesh
                    </div>
                  </div>
                  <div className="p-2.5 border border-[#262a30] bg-[#111315] rounded-[4px]">
                    <div className="text-[#f3f4f6] font-semibold">3. OPTIMIZE</div>
                    <div className="text-[#9ca3af] mt-1">
                      Floater pruning + Quadtree LOD 0..2 chunking (40m cells)
                    </div>
                  </div>
                  <div className="p-2.5 border border-[#262a30] bg-[#111315] rounded-[4px]">
                    <div className="text-[#f3f4f6] font-semibold">4. PUBLISH</div>
                    <div className="text-[#9ca3af] mt-1">
                      Versioned chunk manifests + H3 coverage registration
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-4 text-xs">
              <div className="border border-[#262a30] bg-[#181b1f] p-4 rounded-[4px] space-y-3">
                <div className="flex items-center gap-2 font-semibold text-[#f3f4f6]">
                  <Cpu className="w-4 h-4 text-[#0284c7]" strokeWidth={1.75} />
                  <span>Rendering & Memory Budget Profiles</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(['PERFORMANCE', 'BALANCED', 'QUALITY'] as const).map((pid) => {
                    const cfg = PERFORMANCE_PROFILES[pid];
                    const active = activeProfile === pid;
                    return (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => onSelectProfile(pid)}
                        className={`p-3 text-left border rounded-[4px] cursor-pointer ${
                          active
                            ? 'border-[#0284c7] bg-[#1f2630]'
                            : 'border-[#262a30] bg-[#111315] hover:border-[#0284c7]'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold text-[#f3f4f6]">
                          <span>{cfg.id}</span>
                          {active && <Check className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />}
                        </div>
                        <div className="text-[11px] text-[#9ca3af] mt-1">{cfg.label}</div>
                        <div className="font-mono text-[11px] text-[#9ca3af] mt-2 space-y-0.5">
                          <div>Radius: {cfg.streamingRadiusMeters}m</div>
                          <div>Max Splats: {cfg.maxActiveSplats.toLocaleString()}</div>
                          <div>Cache Cap: {Math.round(cfg.memoryBudgetBytes / (1024 * 1024))} MB</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-[#262a30] bg-[#181b1f] p-4 rounded-[4px] space-y-3">
                <div className="font-semibold text-[#f3f4f6]">First-Person Controller & Accessibility</div>

                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="look-sensitivity-range" className="text-[#9ca3af]">
                    Camera Look Sensitivity ({sensitivity.toFixed(1)}x)
                  </label>
                  <input
                    id="look-sensitivity-range"
                    type="range"
                    min="0.4"
                    max="2.4"
                    step="0.1"
                    value={sensitivity}
                    onChange={(e) => onChangeSensitivity(Number(e.target.value))}
                    className="w-48"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#262a30]">
                  <span className="text-[#9ca3af]">
                    Reduced Effects (Disable head-bob & wind foliage motion)
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleReducedEffects(!reducedEffects)}
                    className="px-3 py-1 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] font-mono rounded-[4px] cursor-pointer"
                  >
                    {reducedEffects ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
