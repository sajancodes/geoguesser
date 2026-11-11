import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Database,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  GameModeId,
  GameRoundPublicState,
  RuntimeTelemetrySnapshot,
  StreetView3DMode,
} from '../packages/shared-types';
import { WorldGuessMap } from './WorldGuessMap';

export interface GameplayHudOverlayProps {
  gameState: 'playing' | 'paused';
  roundState: GameRoundPublicState;
  cumulativeScore: number;
  remainingSeconds: number | null;
  telemetry: RuntimeTelemetrySnapshot | null;
  guessCoord: { lat: number; lon: number } | null;
  onSelectGuessCoord: (lat: number, lon: number) => void;
  isSubmittingGuess: boolean;
  onSubmitGuess: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onResetToSpawn: () => void;
  onOpenCoverageDrawer: () => void;
  onReturnToTitle: () => void;
  onVirtualMove: (forward: number, right: number) => void;
  onVirtualLook: (yawDeg: number, pitchDeg: number) => void;
  active3DMode: StreetView3DMode;
  onChange3DMode: (mode: StreetView3DMode) => void;
  depthReliefStrength: number;
  onChangeDepthRelief: (strength: number) => void;
  quotaExceeded: boolean;
}

const MODE_LABELS: Record<GameModeId, string> = {
  classic: 'CLASSIC SURVEY',
  explorer: 'EXPLORER TELEMETRY',
  no_movement: 'STATIONARY PAN',
  country_challenge: 'COUNTRY FILTER',
  duel_seed: 'DUEL SEED',
};

export const GameplayHudOverlay: React.FC<GameplayHudOverlayProps> = ({
  gameState,
  roundState,
  cumulativeScore,
  remainingSeconds,
  telemetry,
  guessCoord,
  onSelectGuessCoord,
  isSubmittingGuess,
  onSubmitGuess,
  isMuted,
  onToggleMute,
  onTogglePause,
  onResetToSpawn,
  onOpenCoverageDrawer,
  onReturnToTitle,
  onVirtualMove,
  onVirtualLook,
  active3DMode,
  onChange3DMode,
  depthReliefStrength,
  onChangeDepthRelief,
  quotaExceeded,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  const explorerMeta = roundState.sceneBootstrap.explorerMetadata;
  const cacheMb = telemetry ? (telemetry.cacheUsedBytes / (1024 * 1024)).toFixed(1) : '0.0';
  const budgetMb = telemetry ? Math.round(telemetry.cacheBudgetBytes / (1024 * 1024)) : 160;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
      {/* Top Bar: Left Telemetry Cluster + Right Utility Controls */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Top-Left Compact Status & Streaming Telemetry Cluster */}
        <div className="pointer-events-auto border border-[#262a30] bg-[#111315] px-3.5 py-2 rounded-[4px] flex flex-col gap-1.5 max-w-xl">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-[#0284c7]">
              {MODE_LABELS[roundState.mode]}
            </span>
            <span className="text-[#262a30]">|</span>
            <span className="font-mono tabular-nums text-[#f3f4f6]">
              ROUND {roundState.roundNumber}/{roundState.totalRounds}
            </span>
            <span className="text-[#262a30]">|</span>
            <span className="font-mono tabular-nums text-[#f3f4f6]">
              SCORE {cumulativeScore.toLocaleString()}
            </span>
            {remainingSeconds !== null && (
              <>
                <span className="text-[#262a30]">|</span>
                <span className="flex items-center gap-1.5 font-mono tabular-nums text-[#f3f4f6]">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      remainingSeconds <= 20 ? 'bg-[#dc2626]' : 'bg-[#16a34a]'
                    }`}
                  />
                  <span>
                    {Math.floor(remainingSeconds / 60)}:
                    {String(remainingSeconds % 60).padStart(2, '0')}
                  </span>
                </span>
              </>
            )}
            {roundState.mode === 'duel_seed' && (
              <>
                <span className="text-[#262a30]">|</span>
                <span className="font-mono text-[11px] text-[#9ca3af]">
                  SEED: {roundState.seedCode}
                </span>
              </>
            )}
          </div>

          {telemetry && (
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono tabular-nums text-[#9ca3af] border-t border-[#262a30] pt-1">
              <span className="flex items-center gap-1 text-[#f3f4f6]">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    telemetry.fps >= 30 ? 'bg-[#16a34a]' : 'bg-[#d97706]'
                  }`}
                />
                <span>{telemetry.fps} FPS</span>
              </span>
              <span>p95 {telemetry.frameTimeP95Ms}ms</span>
              <span>Profile {telemetry.activeProfile}</span>
              <span>
                Chunks {telemetry.visibleChunksCount}/{telemetry.loadedChunksCount}
              </span>
              <span>
                Cache {cacheMb}/{budgetMb}MB
              </span>
              <span>Splats {telemetry.activeSplatCount.toLocaleString()}</span>
              <span>
                ENU ({telemetry.playerENU.east}m, {telemetry.playerENU.north}m) · HDG{' '}
                {telemetry.cameraYawDeg}°
              </span>
            </div>
          )}

          {explorerMeta && telemetry?.playerWGS84 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#f3f4f6] border-t border-[#262a30] pt-1">
              <span>{explorerMeta.title}</span>
              <span className="text-[#9ca3af]">
                WGS84 ({telemetry.playerWGS84.lat.toFixed(5)}°, {telemetry.playerWGS84.lon.toFixed(5)}°) · H3{' '}
                {telemetry.currentH3Index}
              </span>
            </div>
          )}
        </div>

        {/* Top-Right Compact Utility Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Open Coverage Registry and Settings"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenCoverageDrawer();
            }}
            className="h-9 px-2.5 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-semibold rounded-[4px] flex items-center gap-1.5 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
            <span className="hidden sm:inline">Coverage & Settings</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-9 h-9 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] rounded-[4px] flex items-center justify-center cursor-pointer"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-[#9ca3af]" strokeWidth={1.75} />
            ) : (
              <Volume2 className="w-4 h-4 text-[#f3f4f6]" strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Reset Player to Spawn Origin"
            onClick={(e) => {
              e.currentTarget.blur();
              onResetToSpawn();
            }}
            className="w-9 h-9 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] rounded-[4px] flex items-center justify-center cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={gameState === 'paused' ? 'Resume Game' : 'Pause Game'}
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            className="w-9 h-9 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] rounded-[4px] flex items-center justify-center cursor-pointer"
          >
            {gameState === 'paused' ? (
              <Play className="w-4 h-4 text-[#0284c7]" strokeWidth={1.75} />
            ) : (
              <Pause className="w-4 h-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {/* Center Reticle (Non-intrusive 4px crosshair) */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-1.5 h-1.5 bg-[#f3f4f6] border border-[#111315] rounded-full opacity-65" />
      </div>

      {/* Collapsible Unified Bottom Control & Guess Map Dock */}
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
        <div className="pointer-events-auto flex items-center gap-1.5 mb-1">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setDockCollapsed(!dockCollapsed);
            }}
            className="px-3 py-1 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-mono rounded-[4px] flex items-center gap-1.5 cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
                <span>Show Controls & Guess Map</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-[#0284c7]" strokeWidth={1.75} />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setMapExpanded(!mapExpanded);
              }}
              className="px-3 py-1 border border-[#262a30] bg-[#111315] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-mono rounded-[4px] cursor-pointer"
            >
              {mapExpanded ? 'Compact Map' : 'Expand World Map'}
            </button>
          )}
        </div>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full border border-[#262a30] bg-[#111315] p-3 rounded-[4px] flex flex-col gap-2.5">
            {/* 3D Street View Manipulation Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 border border-[#262a30] bg-[#181b1f] rounded-[4px] text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] font-mono text-[#9ca3af] mr-1">3D ENGINE:</span>
                <button
                  type="button"
                  onClick={() => onChange3DMode('streetview_3d_hybrid')}
                  className={`px-2 py-0.5 text-[11px] font-mono rounded-[4px] border cursor-pointer ${
                    active3DMode === 'streetview_3d_hybrid'
                      ? 'border-[#0284c7] bg-[#1f2630] text-[#f3f4f6] font-semibold'
                      : 'border-[#262a30] bg-[#111315] text-[#9ca3af] hover:text-[#f3f4f6]'
                  }`}
                >
                  Street View + 3D Depth
                </button>
                <button
                  type="button"
                  onClick={() => onChange3DMode('streetview_3d_relief')}
                  className={`px-2 py-0.5 text-[11px] font-mono rounded-[4px] border cursor-pointer ${
                    active3DMode === 'streetview_3d_relief'
                      ? 'border-[#0284c7] bg-[#1f2630] text-[#f3f4f6] font-semibold'
                      : 'border-[#262a30] bg-[#111315] text-[#9ca3af] hover:text-[#f3f4f6]'
                  }`}
                >
                  3D Canyon + Splats
                </button>
                <button
                  type="button"
                  onClick={() => onChange3DMode('google_photorealistic_3d')}
                  className={`px-2 py-0.5 text-[11px] font-mono rounded-[4px] border cursor-pointer ${
                    active3DMode === 'google_photorealistic_3d'
                      ? 'border-[#0284c7] bg-[#1f2630] text-[#f3f4f6] font-semibold'
                      : 'border-[#262a30] bg-[#111315] text-[#9ca3af] hover:text-[#f3f4f6]'
                  }`}
                >
                  Wide 3D Immersive (115°)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="hud-depth-relief-slider"
                  className="text-[11px] font-mono text-[#9ca3af]"
                >
                  3D Depth Extrusion: {Math.round(depthReliefStrength * 100)}%
                </label>
                <input
                  id="hud-depth-relief-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={depthReliefStrength}
                  onChange={(e) => onChangeDepthRelief(Number(e.target.value))}
                  className="w-24 accent-[#0284c7] cursor-pointer"
                />
              </div>
            </div>

            {/* Expandable or Compact World Guess Map */}
            <WorldGuessMap
              guessCoord={guessCoord}
              onSelectGuessCoord={onSelectGuessCoord}
              quotaExceeded={quotaExceeded}
              heightClass={mapExpanded ? 'h-64' : 'h-36'}
            />

            {/* Bottom Action Bar: Touch / Accessible Controls + Submit Guess CTA */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                {roundState.allowMovement ? (
                  <>
                    <button
                      type="button"
                      aria-label="Step Forward"
                      onPointerDown={() => onVirtualMove(1, 0)}
                      onPointerUp={() => onVirtualMove(0, 0)}
                      onPointerLeave={() => onVirtualMove(0, 0)}
                      className="h-9 px-2.5 border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-mono rounded-[4px] cursor-pointer"
                    >
                      FWD [W]
                    </button>
                    <button
                      type="button"
                      aria-label="Step Backward"
                      onPointerDown={() => onVirtualMove(-1, 0)}
                      onPointerUp={() => onVirtualMove(0, 0)}
                      onPointerLeave={() => onVirtualMove(0, 0)}
                      className="h-9 px-2.5 border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-mono rounded-[4px] cursor-pointer"
                    >
                      BACK [S]
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-mono text-[#d97706] px-2">
                    MOVEMENT LOCKED (PAN ONLY)
                  </span>
                )}

                <button
                  type="button"
                  aria-label="Turn Camera Left"
                  onClick={() => onVirtualLook(-22, 0)}
                  className="h-9 px-2.5 border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-mono rounded-[4px] cursor-pointer"
                >
                  LOOK L
                </button>
                <button
                  type="button"
                  aria-label="Turn Camera Right"
                  onClick={() => onVirtualLook(22, 0)}
                  className="h-9 px-2.5 border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-mono rounded-[4px] cursor-pointer"
                >
                  LOOK R
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!guessCoord || isSubmittingGuess}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSubmitGuess();
                  }}
                  className="h-9 px-4 bg-[#0284c7] hover:bg-[#0369a1] disabled:opacity-40 disabled:cursor-not-allowed text-[#f3f4f6] text-xs font-semibold rounded-[4px] flex items-center gap-1.5 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>
                    {isSubmittingGuess
                      ? 'Calculating Geodesic...'
                      : guessCoord
                        ? `Submit Guess (${guessCoord.lat.toFixed(2)}°, ${guessCoord.lon.toFixed(2)}°)`
                        : 'Place Map Pin to Guess'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pause Modal Card */}
      {gameState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Exploration Paused"
          className="fixed inset-0 z-40 pointer-events-auto flex items-center justify-center p-4 bg-[#111315]/85"
        >
          <div className="w-full max-w-md border border-[#262a30] bg-[#111315] p-5 rounded-[4px] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#262a30]">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#0284c7]" strokeWidth={1.75} />
                <h2 className="text-sm font-semibold text-[#f3f4f6]">Exploration Paused</h2>
              </div>
              <span className="font-mono text-xs text-[#9ca3af]">
                ROUND {roundState.roundNumber}/{roundState.totalRounds}
              </span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[#262a30] border border-[#262a30] bg-[#181b1f] rounded-[4px] text-center">
              <div className="p-3">
                <div className="text-[11px] uppercase text-[#9ca3af]">Session Score</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#f3f4f6] mt-0.5">
                  {cumulativeScore.toLocaleString()}
                </div>
              </div>
              <div className="p-3">
                <div className="text-[11px] uppercase text-[#9ca3af]">Active Splats</div>
                <div className="text-lg font-mono font-semibold tabular-nums text-[#f3f4f6] mt-0.5">
                  {telemetry ? telemetry.activeSplatCount.toLocaleString() : '0'}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-2.5 bg-[#0284c7] hover:bg-[#0369a1] text-[#f3f4f6] text-xs font-semibold rounded-[4px] cursor-pointer"
              >
                Resume Exploration (Esc)
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetToSpawn();
                  onTogglePause();
                }}
                className="w-full py-2 border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-semibold rounded-[4px] cursor-pointer"
              >
                Reset Position to Sector Spawn
              </button>
              <button
                type="button"
                onClick={onOpenCoverageDrawer}
                className="w-full py-2 border border-[#262a30] bg-[#181b1f] hover:border-[#0284c7] text-[#f3f4f6] text-xs font-semibold rounded-[4px] cursor-pointer"
              >
                Coverage Registry & Performance Settings
              </button>
              <button
                type="button"
                onClick={onReturnToTitle}
                className="w-full py-2 border border-[#262a30] bg-[#111315] hover:border-[#dc2626] text-[#9ca3af] hover:text-[#f3f4f6] text-xs font-semibold rounded-[4px] cursor-pointer"
              >
                Exit to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
