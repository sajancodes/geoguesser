import type { GuessEvaluationResult, LocationCoverageRecord } from '../shared-types';
import { computeGeodesicInverse } from '../geographic-index/coordinates';
import { getEligiblePlayableLocations } from '../coverage/coverageDatabase';

export const MAX_ROUND_SCORE = 5000;
export const DEFAULT_GLOBAL_DIFFICULTY_K_KM = 2000;
export const COUNTRY_DIFFICULTY_K_KM = 250;

/**
 * Calculate competitive round score using exponential geodesic decay:
 * S = round(5000 * exp(-d / k))
 * where d is geodesic distance in kilometres and k is the difficulty constant.
 */
export function calculateGeodesicScore(
  distanceKm: number,
  difficultyConstantK: number = DEFAULT_GLOBAL_DIFFICULTY_K_KM
): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return 0;
  // Exact hit tolerance (< 25 meters) awards full 5000 points
  if (distanceKm <= 0.025) return MAX_ROUND_SCORE;
  const safeK = Math.max(1, difficultyConstantK);
  const raw = MAX_ROUND_SCORE * Math.exp(-distanceKm / safeK);
  return Math.max(0, Math.min(MAX_ROUND_SCORE, Math.round(raw)));
}

/**
 * Evaluate a player's submitted WGS84 guess against the server-held location record.
 */
export function evaluateGuessAgainstLocation(
  sessionId: string,
  roundNumber: number,
  guessLat: number,
  guessLon: number,
  location: LocationCoverageRecord,
  isCountryMode: boolean = false
): GuessEvaluationResult {
  const clampedLat = Math.max(-90, Math.min(90, guessLat));
  const clampedLon = ((((guessLon + 180) % 360) + 360) % 360) - 180;

  const geodesic = computeGeodesicInverse(
    { lat: clampedLat, lon: clampedLon },
    { lat: location.originWGS84.lat, lon: location.originWGS84.lon }
  );

  const k = isCountryMode ? COUNTRY_DIFFICULTY_K_KM : DEFAULT_GLOBAL_DIFFICULTY_K_KM;
  const score = calculateGeodesicScore(geodesic.distanceKm, k);

  return {
    sessionId,
    roundNumber,
    guessWGS84: { lat: clampedLat, lon: clampedLon },
    actualWGS84: location.originWGS84,
    locationId: location.locationId,
    locationTitle: location.title,
    countryName: location.countryName,
    regionName: location.regionName,
    distanceKm: Number(geodesic.distanceKm.toFixed(2)),
    distanceMeters: Math.round(geodesic.distanceMeters),
    initialBearingDeg: Math.round(geodesic.initialBearingDeg),
    score,
    maxScore: MAX_ROUND_SCORE,
    difficultyConstantK: k,
    architecturalNotes: location.architecturalNotes,
    dataSource: location.dataSource,
    license: location.license,
    captureDate: location.captureDate,
  };
}

/**
 * Select a fair, non-repeating eligible location using a deterministic seed or history filter.
 */
export function selectFairPlayableLocation(
  recentLocationIds: string[],
  countryCodeFilter?: string | null,
  seedCode?: string | null,
  cityNameFilter?: string | null
): LocationCoverageRecord {
  const eligible = getEligiblePlayableLocations(countryCodeFilter ?? null, cityNameFilter ?? null);
  if (eligible.length === 0) {
    const fallback = getEligiblePlayableLocations(null, null);
    return fallback[0];
  }

  if (seedCode && seedCode.trim().length > 0) {
    let hash = 2166136261 >>> 0;
    const cleanSeed = seedCode.trim().toUpperCase();
    for (let i = 0; i < cleanSeed.length; i++) {
      hash ^= cleanSeed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return eligible[(hash >>> 0) % eligible.length];
  }

  const unvisited = eligible.filter((loc) => !recentLocationIds.includes(loc.locationId));
  const pool = unvisited.length > 0 ? unvisited : eligible;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
