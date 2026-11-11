import { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import type {
  GameModeId,
  GameRoundPublicState,
  GraphicsCapabilityReport,
  GuessEvaluationResult,
  PerformanceProfileId,
  RuntimeTelemetrySnapshot,
  StreetView3DMode,
} from './packages/shared-types';
import { WorldEngineController } from './packages/world-engine/worldEngine';
import { TitleScreenModal } from './components/TitleScreenModal';
import { GameplayHudOverlay } from './components/GameplayHudOverlay';
import { RoundResultsModal } from './components/RoundResultsModal';
import {
  CoverageAndIngestionDrawer,
  type CoverageRegistryEntry,
} from './components/CoverageAndIngestionDrawer';
import type { DecodedGaussianSplatCloud } from './packages/splat-renderer/splatBinary';

type AppShellState = 'title' | 'playing' | 'paused' | 'gameover';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WorldEngineController | null>(null);

  const [shellState, setShellState] = useState<AppShellState>('title');
  const [selectedMode, setSelectedMode] = useState<GameModeId>('classic');
  const [countryFilter, setCountryFilter] = useState<string>('JP');
  const [seedCode, setSeedCode] = useState<string>('SEED-KYOTO-1');

  const [coverageEntries, setCoverageEntries] = useState<CoverageRegistryEntry[]>([]);
  const [eligibleCount, setEligibleCount] = useState<number>(4);
  const [capabilities, setCapabilities] = useState<GraphicsCapabilityReport | null>(null);

  const [roundState, setRoundState] = useState<GameRoundPublicState | null>(null);
  const [recentLocationIds, setRecentLocationIds] = useState<string[]>([]);
  const [cumulativeScore, setCumulativeScore] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [telemetry, setTelemetry] = useState<RuntimeTelemetrySnapshot | null>(null);

  const [guessCoord, setGuessCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [roundResult, setRoundResult] = useState<GuessEvaluationResult | null>(null);

  const [isStartingRound, setIsStartingRound] = useState<boolean>(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  const [isCoverageDrawerOpen, setIsCoverageDrawerOpen] = useState<boolean>(false);
  const [activeProfile, setActiveProfile] = useState<PerformanceProfileId>('BALANCED');
  const [reducedEffects, setReducedEffects] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [active3DMode, setActive3DMode] = useState<StreetView3DMode>('streetview_3d_hybrid');
  const [depthReliefStrength, setDepthReliefStrength] = useState<number>(0.45);
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Mirror shellState to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  // Listen for Google Maps Platform Demo Key Quota Event (Case A compliance)
  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  // Fetch Coverage Registry and bootstrap initial live 3D background scene on mount
  useEffect(() => {
    let cancelled = false;
    async function loadInitialCoverageAndBootstrap() {
      try {
        const covRes = await fetch('/api/coverage');
        if (covRes.ok) {
          const covData = (await covRes.json()) as {
            eligibleCount: number;
            locations: CoverageRegistryEntry[];
          };
          if (!cancelled) {
            setCoverageEntries(covData.locations);
            setEligibleCount(covData.eligibleCount);
          }
        }

        // Load a real 3D preview round for the Title Screen live camera tour
        const sessRes = await fetch('/api/game/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'classic',
            roundNumber: 1,
            totalRounds: 5,
            recentLocationIds: [],
          }),
        });
        if (sessRes.ok) {
          const initialRound = (await sessRes.json()) as GameRoundPublicState;
          if (!cancelled) {
            setRoundState(initialRound);
            engineRef.current?.loadSceneBootstrap(
              initialRound.sceneBootstrap,
              initialRound.allowMovement
            );
            engineRef.current?.setTitleFlyoverMode(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setErrorBanner(
            err instanceof Error
              ? `Unable to initialize world service: ${err.message}`
              : 'World service initialization failed.'
          );
        }
      }
    }
    loadInitialCoverageAndBootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize the 3D WorldEngineController once on mount
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const controller = new WorldEngineController(container, {
      onTelemetryUpdate: (snap) => {
        setTelemetry(snap);
        setActiveProfile(snap.activeProfile);
      },
      onPauseToggleRequested: () => {
        setShellState((prev) => {
          if (prev === 'playing') {
            controller.setPaused(true);
            return 'paused';
          }
          if (prev === 'paused') {
            controller.setPaused(false);
            return 'playing';
          }
          return prev;
        });
      },
    });

    engineRef.current = controller;
    setCapabilities(controller.getCapabilities());

    return () => {
      controller.dispose();
      engineRef.current = null;
    };
  }, []);

  // Start or advance a game round
  const startRoundSession = useCallback(
    async (options: {
      mode: GameModeId;
      roundNumber: number;
      totalRounds: number;
      resetCumulative: boolean;
      specificLocationId?: string | null;
    }) => {
      setIsStartingRound(true);
      setErrorBanner(null);

      try {
        const res = await fetch('/api/game/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: options.mode,
            countryFilter: options.mode === 'country_challenge' ? countryFilter : null,
            seedCode: options.mode === 'duel_seed' ? seedCode : null,
            locationId: options.specificLocationId ?? null,
            roundNumber: options.roundNumber,
            totalRounds: options.totalRounds,
            recentLocationIds: options.resetCumulative ? [] : recentLocationIds,
          }),
        });

        if (!res.ok) {
          throw new Error(`Session endpoint returned HTTP ${res.status}`);
        }

        const nextRound = (await res.json()) as GameRoundPublicState;
        setRoundState(nextRound);
        setGuessCoord(null);
        setRoundResult(null);
        setRemainingSeconds(nextRound.timeLimitSeconds);

        if (options.resetCumulative) {
          setCumulativeScore(0);
          setRecentLocationIds([]);
        }

        const engine = engineRef.current;
        if (engine) {
          engine.loadSceneBootstrap(nextRound.sceneBootstrap, nextRound.allowMovement);
          engine.setTitleFlyoverMode(false);
          engine.setPaused(false);
        }

        document.body.dataset.state = 'playing';
        setShellState('playing');
      } catch (err) {
        setErrorBanner(
          err instanceof Error ? err.message : 'Unable to start exploration round.'
        );
      } finally {
        setIsStartingRound(false);
      }
    },
    [countryFilter, recentLocationIds, seedCode]
  );

  // Support `?autostart=1` query parameter and Enter/Space keyboard shortcut on Title Screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && shellState === 'title') {
      startRoundSession({
        mode: 'classic',
        roundNumber: 1,
        totalRounds: 5,
        resetCumulative: true,
      });
    }
  }, [shellState, startRoundSession]);

  useEffect(() => {
    if (shellState !== 'title' || isCoverageDrawerOpen) return;
    const onTitleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        startRoundSession({
          mode: selectedMode,
          roundNumber: 1,
          totalRounds: selectedMode === 'explorer' ? 1 : 5,
          resetCumulative: true,
        });
      }
    };
    window.addEventListener('keydown', onTitleKeyDown);
    return () => window.removeEventListener('keydown', onTitleKeyDown);
  }, [isCoverageDrawerOpen, selectedMode, shellState, startRoundSession]);

  // Submit guess to server-authoritative geodesic scoring endpoint
  const handleSubmitGuess = useCallback(
    async (overrideCoord?: { lat: number; lon: number }) => {
      if (!roundState || isSubmittingGuess) return;
      const coordToSubmit = overrideCoord ?? guessCoord ?? { lat: 0, lon: 0 };

      setIsSubmittingGuess(true);
      setErrorBanner(null);

      try {
        const res = await fetch('/api/game/guess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: roundState.sessionId,
            guessLat: coordToSubmit.lat,
            guessLon: coordToSubmit.lon,
            elapsedSeconds:
              roundState.timeLimitSeconds !== null && remainingSeconds !== null
                ? roundState.timeLimitSeconds - remainingSeconds
                : 0,
          }),
        });

        if (res.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }

        if (!res.ok) {
          throw new Error(`Scoring service returned HTTP ${res.status}`);
        }

        const evalRes = (await res.json()) as GuessEvaluationResult;
        setRoundResult(evalRes);
        setCumulativeScore((prev) => prev + evalRes.score);
        setRecentLocationIds((prev) => [...prev, evalRes.locationId]);

        engineRef.current?.setPaused(true);
        engineRef.current?.playScoreRevealSound(evalRes.score >= 3500);
        document.body.dataset.state = 'gameover';
        setShellState('gameover');
      } catch (err) {
        setErrorBanner(
          err instanceof Error ? err.message : 'Unable to evaluate geodesic guess.'
        );
      } finally {
        setIsSubmittingGuess(false);
      }
    },
    [guessCoord, isSubmittingGuess, remainingSeconds, roundState]
  );

  // Round countdown timer during active timed modes
  useEffect(() => {
    if (shellState !== 'playing' || remainingSeconds === null) return;
    if (remainingSeconds <= 0) {
      handleSubmitGuess(guessCoord ?? { lat: 0, lon: 0 });
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [guessCoord, handleSubmitGuess, remainingSeconds, shellState]);

  const handleSelectGuessCoord = useCallback((lat: number, lon: number) => {
    setGuessCoord({ lat, lon });
    engineRef.current?.playPinDropSound();
  }, []);

  const handleResetToSpawn = useCallback(() => {
    if (!roundState || !engineRef.current) return;
    engineRef.current.setTitleFlyoverMode(false);
  }, [roundState]);

  const handleSelectProfile = useCallback((profile: PerformanceProfileId) => {
    setActiveProfile(profile);
    engineRef.current?.setPerformanceProfile(profile, false);
  }, []);

  const handleToggleReducedEffects = useCallback((reduced: boolean) => {
    setReducedEffects(reduced);
    engineRef.current?.setReducedEffects(reduced);
  }, []);

  const handleChangeSensitivity = useCallback((val: number) => {
    setSensitivity(val);
    engineRef.current?.setSensitivity(val);
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleIngestCustomSplat = useCallback(
    (cloud: DecodedGaussianSplatCloud, label: string) => {
      engineRef.current?.ingestCustomSplatCloud(cloud, label);
    },
    []
  );

  const handleChange3DMode = useCallback((mode: StreetView3DMode) => {
    setActive3DMode(mode);
    engineRef.current?.setStreetView3DMode(mode);
  }, []);

  const handleChangeDepthRelief = useCallback((strength: number) => {
    setDepthReliefStrength(strength);
    engineRef.current?.setDepthReliefStrength(strength);
  }, []);

  const appTree = (
    <div className="relative w-screen h-screen overflow-hidden bg-[#111315] select-none">
      {/* Required Google Maps Platform Demo Key Quota Banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Runtime Error Notification Bar */}
      {errorBanner && (
        <div
          role="alert"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 border border-[#dc2626] bg-[#111315] text-[#f3f4f6] px-4 py-2 rounded-[4px] text-xs flex items-center gap-2.5"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-[#dc2626]" />
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="ml-2 px-2 py-0.5 border border-[#262a30] bg-[#181b1f] text-[11px] rounded-[4px] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Isolated Full-Viewport Real Street View 3D & WebGL Overlay Container */}
      <div
        ref={canvasMountRef}
        className="fixed inset-0 w-full h-full z-0"
        aria-label="3D Photorealistic Street Exploration Viewport"
      />

      {/* Title Screen State */}
      {shellState === 'title' && (
        <TitleScreenModal
          selectedMode={selectedMode}
          onSelectMode={setSelectedMode}
          countryFilter={countryFilter}
          onChangeCountryFilter={setCountryFilter}
          seedCode={seedCode}
          onChangeSeedCode={setSeedCode}
          eligibleCount={eligibleCount}
          totalLocationsCount={coverageEntries.length || 8}
          capabilities={capabilities}
          isStarting={isStartingRound}
          onStartGame={() =>
            startRoundSession({
              mode: selectedMode,
              roundNumber: 1,
              totalRounds: selectedMode === 'explorer' ? 1 : 5,
              resetCumulative: true,
            })
          }
          onOpenCoverageDrawer={() => setIsCoverageDrawerOpen(true)}
        />
      )}

      {/* Active Gameplay & Pause HUD State */}
      {(shellState === 'playing' || shellState === 'paused') && roundState && (
        <GameplayHudOverlay
          gameState={shellState}
          roundState={roundState}
          cumulativeScore={cumulativeScore}
          remainingSeconds={remainingSeconds}
          telemetry={telemetry}
          guessCoord={guessCoord}
          onSelectGuessCoord={handleSelectGuessCoord}
          isSubmittingGuess={isSubmittingGuess}
          onSubmitGuess={() => handleSubmitGuess()}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onTogglePause={() => {
            if (shellState === 'playing') {
              engineRef.current?.setPaused(true);
              setShellState('paused');
            } else {
              engineRef.current?.setPaused(false);
              setShellState('playing');
            }
          }}
          onResetToSpawn={handleResetToSpawn}
          onOpenCoverageDrawer={() => setIsCoverageDrawerOpen(true)}
          onReturnToTitle={() => {
            engineRef.current?.setPaused(false);
            engineRef.current?.setTitleFlyoverMode(true);
            setShellState('title');
          }}
          onVirtualMove={(fwd, right) =>
            engineRef.current?.setVirtualJoystick(fwd, right)
          }
          onVirtualLook={(yaw, pitch) =>
            engineRef.current?.nudgeCameraLook(yaw, pitch)
          }
          active3DMode={active3DMode}
          onChange3DMode={handleChange3DMode}
          depthReliefStrength={depthReliefStrength}
          onChangeDepthRelief={handleChangeDepthRelief}
          quotaExceeded={gmpQuotaExceeded}
        />
      )}

      {/* Round Results / Gameover State */}
      {shellState === 'gameover' && roundResult && roundState && (
        <RoundResultsModal
          result={roundResult}
          totalRounds={roundState.totalRounds}
          cumulativeScore={cumulativeScore}
          quotaExceeded={gmpQuotaExceeded}
          onNextRound={() => {
            const isFinal = roundResult.roundNumber >= roundState.totalRounds;
            startRoundSession({
              mode: roundState.mode,
              roundNumber: isFinal ? 1 : roundResult.roundNumber + 1,
              totalRounds: roundState.totalRounds,
              resetCumulative: isFinal,
            });
          }}
          onReturnToTitle={() => {
            engineRef.current?.setPaused(false);
            engineRef.current?.setTitleFlyoverMode(true);
            setShellState('title');
          }}
        />
      )}

      {/* Coverage Registry, .splat/.ply Ingestion & Hardware Profile Modal */}
      <CoverageAndIngestionDrawer
        isOpen={isCoverageDrawerOpen}
        onClose={() => setIsCoverageDrawerOpen(false)}
        entries={coverageEntries}
        activeProfile={activeProfile}
        onSelectProfile={handleSelectProfile}
        reducedEffects={reducedEffects}
        onToggleReducedEffects={handleToggleReducedEffects}
        sensitivity={sensitivity}
        onChangeSensitivity={handleChangeSensitivity}
        onLoadLocationInExplorer={(locationId) => {
          setSelectedMode('explorer');
          startRoundSession({
            mode: 'explorer',
            roundNumber: 1,
            totalRounds: 1,
            resetCumulative: true,
            specificLocationId: locationId,
          });
        }}
        onIngestCustomSplatCloud={handleIngestCustomSplat}
      />
    </div>
  );

  return googleMapsApiKey ? (
    <APIProvider
      apiKey={googleMapsApiKey}
      libraries={['streetView', 'maps3d', 'marker']}
    >
      {appTree}
    </APIProvider>
  ) : (
    appTree
  );
}
