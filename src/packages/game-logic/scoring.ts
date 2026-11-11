import type { GuessEvaluationResult, LocationCoverageRecord } from '../shared-types';
import { computeGeodesicInverse } from '../geographic-index/coordinates';
import { getEligiblePlayableLocations } from '../coverage/coverageDatabase';
import {
  ALL_WORLD_COUNTRIES,
  createLocationFromCountry,
} from '../coverage/worldCountries';
import { generateMathematicalNonRepeatingPlace } from './mathRandomSampler';

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
 * Select a fair, non-repeating eligible location using continuous mathematical sampling
 * (2D Weyl low-discrepancy sequences + CSPRNG + cross-session geodesic maximin deduplication)
 * or a deterministic seed for Duel Seed mode.
 */
export function selectFairPlayableLocation(
  recentLocationIds: string[],
  countryCodeFilter?: string | null,
  seedCode?: string | null,
  cityNameFilter?: string | null
): LocationCoverageRecord {
  let eligible = getEligiblePlayableLocations(countryCodeFilter ?? null, cityNameFilter ?? null);
  if (eligible.length === 0) {
    if (countryCodeFilter && countryCodeFilter.trim().length > 0) {
      const q = countryCodeFilter.trim().toLowerCase();
      const match = ALL_WORLD_COUNTRIES.find(
        (c) => c.code.toLowerCase() === q || c.name.toLowerCase() === q
      );
      if (match) {
        eligible = [createLocationFromCountry(match)];
      }
    }
    if (eligible.length === 0 && cityNameFilter && cityNameFilter.trim().length > 0) {
      const q = cityNameFilter.trim().toLowerCase();
      const match = ALL_WORLD_COUNTRIES.find(
        (c) => c.cityName.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      );
      if (match) {
        eligible = [createLocationFromCountry(match)];
      }
    }
    if (eligible.length === 0) {
      eligible = getEligiblePlayableLocations(null, null);
    }
  }

  // Deterministic seed mode for competitive Duel Seed matching
  if (seedCode && seedCode.trim().length > 0) {
    let hash = 2166136261 >>> 0;
    const cleanSeed = seedCode.trim().toUpperCase();
    for (let i = 0; i < cleanSeed.length; i++) {
      hash ^= cleanSeed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return eligible[(hash >>> 0) % eligible.length];
  }

  const unvisitedTemplates = eligible.filter((loc) => !recentLocationIds.includes(loc.locationId));
  const basePool = unvisitedTemplates.length > 0 ? unvisitedTemplates : eligible;

  return generateMathematicalNonRepeatingPlace(basePool, countryCodeFilter, cityNameFilter);
}
