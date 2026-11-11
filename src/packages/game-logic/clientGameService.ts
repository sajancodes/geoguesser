import {
  COVERAGE_DATABASE,
  buildQuadtreeChunksForLocation,
  evaluateLocationEligibility,
} from '../coverage/coverageDatabase';
import {
  evaluateGuessAgainstLocation,
  selectFairPlayableLocation,
} from './scoring';
import { generateChunkSplatBinaryBuffer } from '../splat-renderer/splatBinary';
import type {
  GameModeId,
  GameRoundPublicState,
  GuessEvaluationResult,
  LocationCoverageRecord,
  WorldChunkDescriptor,
} from '../shared-types';

export interface CoverageRegistryEntry {
  locationId: string;
  title: string;
  countryCode: string;
  countryName: string;
  regionName: string;
  originWGS84: { lat: number; lon: number; elevation: number };
  h3Index: string;
  coverageLayers: LocationCoverageRecord['coverageLayers'];
  captureDate: string;
  assetVersion: string;
  dataSource: string;
  license: string;
  visualQualityScore: number;
  navigationQualityScore: number;
  eligibility: ReturnType<typeof evaluateLocationEligibility>;
}

interface ClientSessionRecord {
  sessionId: string;
  sessionLocationToken: string;
  roundNumber: number;
  totalRounds: number;
  mode: GameModeId;
  countryFilter: string | null;
  seedCode: string;
  location: LocationCoverageRecord;
  chunksByAnonId: Record<string, WorldChunkDescriptor>;
  recentLocationIds: string[];
  createdAtMs: number;
}

const activeSessions: Record<string, ClientSessionRecord> = {};
const inMemoryChunkBuffers: Record<string, Uint8Array> = {};
let latestActiveLocation: LocationCoverageRecord | null = null;

function makeRandomId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${rand}${time}`;
}

export function registerInMemoryChunkBuffer(chunkId: string, buffer: Uint8Array): void {
  inMemoryChunkBuffers[chunkId] = buffer;
}

export function getInMemoryChunkBuffer(chunkId: string): Uint8Array | null {
  return inMemoryChunkBuffers[chunkId] ?? null;
}

export function getLatestActiveLocation(): LocationCoverageRecord | null {
  return latestActiveLocation;
}

/**
 * Updates the active session's ground-truth WGS84 coordinate when Street View resolves
 * an exact outdoor panorama near the mathematically sampled point.
 */
export function updateActiveSessionActualLocation(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (latestActiveLocation) {
    latestActiveLocation = {
      ...latestActiveLocation,
      originWGS84: {
        ...latestActiveLocation.originWGS84,
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(5)),
      },
    };
  }
  for (const session of Object.values(activeSessions)) {
    if (latestActiveLocation && session.location.locationId === latestActiveLocation.locationId) {
      session.location = latestActiveLocation;
    }
  }
}

/**
 * Serverless in-browser Coverage Registry
 */
export function getCoverageRegistry(): {
  totalLocations: number;
  eligibleCount: number;
  locations: CoverageRegistryEntry[];
} {
  const entries: CoverageRegistryEntry[] = COVERAGE_DATABASE.map((rec) => {
    const eligibility = evaluateLocationEligibility(rec);
    return {
      locationId: rec.locationId,
      title: rec.title,
      countryCode: rec.countryCode,
      countryName: rec.countryName,
      regionName: rec.regionName,
      originWGS84: rec.originWGS84,
      h3Index: rec.h3Index,
      coverageLayers: rec.coverageLayers,
      captureDate: rec.captureDate,
      assetVersion: rec.assetVersion,
      dataSource: rec.dataSource,
      license: rec.license,
      visualQualityScore: rec.visualQualityScore,
      navigationQualityScore: rec.navigationQualityScore,
      eligibility,
    };
  });

  return {
    totalLocations: entries.length,
    eligibleCount: entries.filter((e) => e.eligibility.eligible).length,
    locations: entries,
  };
}

/**
 * Serverless in-browser Game Session Creator
 * Generates secrets, chooses fair random playable locations, and populates 3D Gaussian Splats
 */
export function createGameSession(options: {
  mode?: GameModeId;
  countryFilter?: string | null;
  cityFilter?: string | null;
  seedCode?: string | null;
  locationId?: string | null;
  roundNumber?: number;
  totalRounds?: number;
  recentLocationIds?: string[];
}): GameRoundPublicState {
  const mode: GameModeId = options.mode ?? 'classic';
  const countryFilter = options.countryFilter ?? null;
  const cityFilter = options.cityFilter ?? null;
  const roundNumber = Math.max(1, Number(options.roundNumber) || 1);
  const totalRounds = mode === 'explorer' ? 1 : Math.max(1, Number(options.totalRounds) || 5);
  const recentIds = Array.isArray(options.recentLocationIds) ? options.recentLocationIds : [];
  const seedCode =
    typeof options.seedCode === 'string' && options.seedCode.trim().length > 0
      ? options.seedCode.trim().toUpperCase()
      : makeRandomId('SEED').toUpperCase().replace('_', '-');

  let selectedLocation: LocationCoverageRecord | undefined;

  // Specific location requested
  if (options.locationId && !cityFilter && !countryFilter) {
    const candidate = COVERAGE_DATABASE.find((c) => c.locationId === options.locationId);
    if (candidate && evaluateLocationEligibility(candidate).eligible) {
      selectedLocation = candidate;
    }
  }

  // Fair random selection across filtered pool (or all over country/Nepal/world)
  if (!selectedLocation) {
    selectedLocation = selectFairPlayableLocation(
      recentIds,
      countryFilter,
      mode === 'duel_seed' ? seedCode : null,
      cityFilter
    );
  }

  latestActiveLocation = selectedLocation;

  const sessionId = makeRandomId('sess');
  const sessionLocationToken = makeRandomId('tok');
  const allChunks = buildQuadtreeChunksForLocation(selectedLocation);

  const chunksByAnonId: Record<string, WorldChunkDescriptor> = {};
  const publicChunks: WorldChunkDescriptor[] = [];

  for (const chunk of allChunks) {
    const anonChunkId = makeRandomId('chunk');
    const splatBuf = generateChunkSplatBinaryBuffer(selectedLocation, chunk);
    registerInMemoryChunkBuffer(anonChunkId, splatBuf);
    registerInMemoryChunkBuffer(chunk.chunkId, splatBuf);

    // Create a local blob URL for instant in-browser consumption
    let blobUrl = '';
    try {
      if (typeof window !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
        const blob = new Blob([splatBuf.buffer as ArrayBuffer], { type: 'application/octet-stream' });
        blobUrl = URL.createObjectURL(blob);
      }
    } catch {
      // Fallback
    }

    const publicChunk: WorldChunkDescriptor = {
      ...chunk,
      chunkId: anonChunkId,
      locationId: sessionLocationToken,
      parentId: null,
      childIds: [],
      assetManifest: {
        ...chunk.assetManifest,
        splatUrl: blobUrl || `/inmemory/${sessionLocationToken}/${anonChunkId}.splat`,
      },
    };

    chunksByAnonId[anonChunkId] = chunk;
    publicChunks.push(publicChunk);
  }

  // Preserve parent-child relationships using anonymized IDs
  for (let i = 0; i < allChunks.length; i++) {
    const orig = allChunks[i];
    const pub = publicChunks[i];
    if (orig.parentId) {
      const parentOrigIdx = allChunks.findIndex((c) => c.chunkId === orig.parentId);
      if (parentOrigIdx >= 0) {
        pub.parentId = publicChunks[parentOrigIdx].chunkId;
      }
    }
    if (orig.childIds.length > 0) {
      pub.childIds = orig.childIds
        .map((childId) => {
          const childIdx = allChunks.findIndex((c) => c.chunkId === childId);
          return childIdx >= 0 ? publicChunks[childIdx].chunkId : null;
        })
        .filter((id): id is string => id !== null);
    }
  }

  activeSessions[sessionId] = {
    sessionId,
    sessionLocationToken,
    roundNumber,
    totalRounds,
    mode,
    countryFilter,
    seedCode,
    location: selectedLocation,
    chunksByAnonId,
    recentLocationIds: recentIds,
    createdAtMs: Date.now(),
  };

  const isExplorer = mode === 'explorer';
  const isNoMove = mode === 'no_movement';

  return {
    sessionId,
    roundNumber,
    totalRounds,
    mode,
    countryFilter,
    seedCode,
    timeLimitSeconds: null,
    startedAtIso: new Date().toISOString(),
    allowMovement: !isNoMove,
    sceneBootstrap: {
      sessionLocationToken,
      streetViewTarget: {
        lat: selectedLocation.originWGS84.lat,
        lon: selectedLocation.originWGS84.lon,
        elevation: selectedLocation.originWGS84.elevation,
        headingDeg: selectedLocation.spawnPointENU.yawDeg,
        pitchDeg: 2,
      },
      spawnPointENU: selectedLocation.spawnPointENU,
      sunAzimuthDeg: selectedLocation.sunAzimuthDeg,
      sunElevationDeg: selectedLocation.sunElevationDeg,
      skyHorizonHex: selectedLocation.skyHorizonHex,
      skyZenithHex: selectedLocation.skyZenithHex,
      groundTintHex: selectedLocation.groundTintHex,
      buildings: selectedLocation.buildings,
      roads: selectedLocation.roads,
      signs: selectedLocation.signs,
      props: selectedLocation.props,
      chunks: publicChunks,
      explorerMetadata: isExplorer
        ? {
            locationId: selectedLocation.locationId,
            title: selectedLocation.title,
            countryName: selectedLocation.countryName,
            regionName: selectedLocation.regionName,
            originWGS84: selectedLocation.originWGS84,
            h3Index: selectedLocation.h3Index,
          }
        : null,
    },
  };
}

/**
 * Serverless in-browser Guess Evaluation
 * Computes Vincenty geodesic ellipsoidal inverse distance and score
 */
export function submitGuess(request: {
  sessionId: string;
  guessLat: number;
  guessLon: number;
  elapsedSeconds?: number;
}): GuessEvaluationResult {
  const session = activeSessions[request.sessionId];
  const location = session?.location ?? latestActiveLocation ?? COVERAGE_DATABASE[0];

  return evaluateGuessAgainstLocation(
    request.sessionId,
    session?.roundNumber ?? 1,
    request.guessLat,
    request.guessLon,
    location,
    session?.mode === 'country_challenge'
  );
}

/**
 * Serverless in-browser Architectural & Geospatial Analysis
 */
export function analyzeGeospatial(
  locationId?: string | null,
  guessLat?: number,
  guessLon?: number
): {
  analysis: string;
  architecturalNotes: string[];
} {
  const location =
    (locationId ? COVERAGE_DATABASE.find((c) => c.locationId === locationId) : null) ??
    latestActiveLocation ??
    COVERAGE_DATABASE[0];

  const distanceKm =
    typeof guessLat === 'number' && typeof guessLon === 'number'
      ? Math.round(
          Math.hypot(
            (guessLat - location.originWGS84.lat) * 111,
            (guessLon - location.originWGS84.lon) * 111 * Math.cos((location.originWGS84.lat * Math.PI) / 180)
          )
        )
      : 0;

  const analysis = [
    `Geospatial Field Analysis for ${location.countryName} Sector:`,
    `- Geodetic Origin: WGS84 lat ${location.originWGS84.lat.toFixed(4)}°, lon ${location.originWGS84.lon.toFixed(4)}° (${location.originWGS84.elevation}m ASL).`,
    `- Solar Ephemeris: Azimuth ${location.sunAzimuthDeg}°, Elevation ${location.sunElevationDeg}°.`,
    `- Regional Clues: ${location.architecturalNotes.join(' ')}`,
    `- Guess Offset: Approximately ${distanceKm} km from actual location.`,
  ].join('\n');

  return {
    analysis,
    architecturalNotes: location.architecturalNotes,
  };
}
