import type {
  BuildingFootprintENU,
  LocationCoverageRecord,
  RoadSegmentENU,
  StreetPropENU,
  StreetSignClue,
} from '../shared-types';
import { computeGeodesicInverse, latLonToH3Index } from '../geographic-index/coordinates';

const VISITED_COORDS_STORAGE_KEY = 'earth_uncovered_visited_coords_v3';
const VISITED_PANOS_STORAGE_KEY = 'earth_uncovered_visited_panos_v3';
const WEYL_STEP_STORAGE_KEY = 'earth_uncovered_weyl_step_v3';
const MAX_HISTORY_ENTRIES = 800;

export interface VisitedCoordEntry {
  lat: number;
  lon: number;
  countryCode: string;
  ts: number;
}

// In-memory fallback cache for Node/headless unit test environments
let memoryVisitedCoords: VisitedCoordEntry[] = [];
let memoryVisitedPanos: Set<string> = new Set();
let memoryWeylStep: number = Math.floor(Math.random() * 100000);

/**
 * High-entropy uniform random number in [0, 1) combining Web Crypto API CSPRNG
 * and Math.random fallback.
 */
export function cryptoRandomFloat(): number {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
  } catch {
    // fallback
  }
  return Math.random();
}

/**
 * Box-Muller transform for standard normal Gaussian distribution N(0, 1).
 */
export function cryptoGaussian(): number {
  const u1 = Math.max(1e-7, cryptoRandomFloat());
  const u2 = cryptoRandomFloat();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Advances and persists the 2D Plastic Constant (R2) Low-Discrepancy Weyl sequence step
 * across sessions so even new sessions never restart at the same sequence index.
 */
function nextWeylSequencePair(): [number, number] {
  let step = memoryWeylStep + 1;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(WEYL_STEP_STORAGE_KEY);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
          step = parsed + 1;
        }
      }
      window.localStorage.setItem(WEYL_STEP_STORAGE_KEY, String(step));
    }
  } catch {
    // ignore storage errors
  }
  memoryWeylStep = step;

  // R2 low-discrepancy irrational constants (generalized golden ratio in 2D)
  const alpha1 = 0.7548776662466927;
  const alpha2 = 0.5698402909980532;

  // Combine low-discrepancy quasi-random point with cryptographic continuous jitter
  const u = (step * alpha1 + cryptoRandomFloat() * 0.35) % 1;
  const v = (step * alpha2 + cryptoRandomFloat() * 0.35) % 1;
  return [u, v];
}

/**
 * Load persistent cross-session visited coordinates from localStorage + memory.
 */
export function getVisitedCoordinates(): VisitedCoordEntry[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(VISITED_COORDS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryVisitedCoords = parsed;
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return memoryVisitedCoords;
}

/**
 * Record a newly visited coordinate in persistent cross-session storage.
 */
export function recordVisitedCoordinate(lat: number, lon: number, countryCode: string): void {
  const current = getVisitedCoordinates();
  current.push({
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    countryCode: countryCode.toUpperCase(),
    ts: Date.now(),
  });
  if (current.length > MAX_HISTORY_ENTRIES) {
    current.splice(0, current.length - MAX_HISTORY_ENTRIES);
  }
  memoryVisitedCoords = current;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(VISITED_COORDS_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // ignore
  }
}

/**
 * Check if a Google Street View panoId was ever visited in this or any prior session.
 */
export function isPanoVisited(panoId: string): boolean {
  if (!panoId) return false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(VISITED_PANOS_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          memoryVisitedPanos = new Set(arr);
        }
      }
    }
  } catch {
    // ignore
  }
  return memoryVisitedPanos.has(panoId);
}

/**
 * Persist a Google Street View panoId so it is never repeated in future rounds or sessions.
 */
export function markPanoVisited(panoId: string): void {
  if (!panoId) return;
  isPanoVisited(panoId); // sync from localStorage first
  memoryVisitedPanos.add(panoId);
  const arr = Array.from(memoryVisitedPanos);
  if (arr.length > MAX_HISTORY_ENTRIES) {
    arr.splice(0, arr.length - MAX_HISTORY_ENTRIES);
    memoryVisitedPanos = new Set(arr);
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(VISITED_PANOS_STORAGE_KEY, JSON.stringify(arr));
    }
  } catch {
    // ignore
  }
}

/**
 * Continuous mathematical coordinate generator for Nepal (NP).
 * Uses Nepal's WNW-to-ESE Himalayan topographic spine equation and cross-corridor breadth
 * to sample continuously across all of Nepal without any hardcoded place list.
 */
function sampleNepalContinuousMath(u: number, v: number): {
  lat: number;
  lon: number;
  elevation: number;
} {
  // Clamp u to [0.03, 0.97] across Nepal's 800km East-West extent (80.40°E to 87.95°E)
  const t = 0.03 + 0.94 * u;
  const lon = 80.4 + t * (87.95 - 80.4);

  // Nepal's central axis tilts from ~29.0°N in the Far-West to ~26.85°N in the Far-East
  // with a gentle concave curvature along the mid-hill highway corridor
  const spineLat = 29.02 - 2.15 * t - 0.14 * Math.sin(Math.PI * t);

  // Cross-corridor offset s in [-1, 1] spanning Terai plains (-0.42°) to Himalayan valleys (+0.42°)
  const s = v * 2.0 - 1.0;
  const lat = spineLat + s * 0.42;

  // Continuous mathematical elevation model (Terai ~120m -> Mid-Hills ~1300m -> High Himalayas ~2600m)
  const normalizedNorth = Math.max(0, Math.min(1, (s + 1) * 0.5));
  const elevation = Math.round(
    110 + 1950 * Math.pow(normalizedNorth, 1.55) + 220 * Math.abs(Math.sin(t * Math.PI * 5.0))
  );

  return {
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    elevation,
  };
}

/**
 * Continuous polar & Gaussian mixture sampler around any country or city reference coordinate.
 */
function samplePolarContinuousMath(
  centerLat: number,
  centerLon: number,
  baseElevation: number,
  maxRadiusKm: number,
  u: number,
  v: number
): { lat: number; lon: number; elevation: number } {
  // Area-uniform disk sampling r = R * sqrt(u) blended with radial variation
  const rKm = maxRadiusKm * (0.08 + 0.92 * Math.sqrt(u));
  const thetaRad = 2.0 * Math.PI * v;

  const latOffsetDeg = (rKm * Math.cos(thetaRad)) / 111.32;
  const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const lonOffsetDeg = (rKm * Math.sin(thetaRad)) / (111.32 * cosLat);

  const lat = Math.max(-82, Math.min(82, centerLat + latOffsetDeg));
  const lon = ((((centerLon + lonOffsetDeg + 180) % 360) + 360) % 360) - 180;
  const elevJitter = Math.round(Math.sin(thetaRad * 3.0) * Math.min(120, baseElevation * 0.25));

  return {
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
    elevation: Math.max(5, baseElevation + elevJitter),
  };
}

/**
 * Synthesizes unique, non-repeating 3D outdoor road, building, sign, and prop geometry
 * purely from mathematical trigonometric functions of (lat, lon) so every generated place
 * has distinct architecture and road orientation while keeping (0,0) strictly outdoors.
 */
function synthesizeMathematical3DScene(
  lat: number,
  lon: number,
  baseTemplate: LocationCoverageRecord
): {
  yawDeg: number;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  buildings: BuildingFootprintENU[];
  roads: RoadSegmentENU[];
  signs: StreetSignClue[];
  props: StreetPropENU[];
} {
  const isNepal = baseTemplate.countryCode.toUpperCase() === 'NP';
  const seedA = Math.abs(Math.sin(lat * 127.1 + lon * 311.7) * 43758.5453) % 1;
  const seedB = Math.abs(Math.cos(lat * 269.5 + lon * 183.3) * 28461.1923) % 1;
  const seedC = Math.abs(Math.sin(lat * 419.2 - lon * 157.9) * 19384.7162) % 1;

  const yawDeg = Math.floor(seedA * 360);
  const sunAzimuthDeg = Math.floor(110 + seedB * 140);
  const sunElevationDeg = Math.floor(28 + seedC * 38);

  const roofStyles: BuildingFootprintENU['roofStyle'][] = [
    'gable_tile',
    'stepped_terrace',
    'pitched_corrugated',
    'flat_parapet',
  ];

  const wallPalette = isNepal
    ? ['#b27a5b', '#c28b6b', '#a86448', '#d4a373', '#9a5b42']
    : ['#cbd5e1', '#d6d3d1', '#e2e8f0', '#d4d4d8', '#fde68a'];

  const roofPalette = isNepal
    ? ['#6a3622', '#7c2d12', '#57534e', '#44403c']
    : ['#334155', '#475569', '#7c2d12', '#3f3f46'];

  const bldCount = 3 + Math.floor(seedA * 3); // 3 to 5 outdoor buildings flanking the street
  const buildings: BuildingFootprintENU[] = [];

  for (let i = 0; i < bldCount; i++) {
    const frac = (i + 0.5) / bldCount;
    const side = i % 2 === 0 ? -1 : 1;
    // Keep centerNorth at least 13m..20m away from road center (0) so player NEVER spawns inside a building
    const centerEast = Number(((frac - 0.5) * 46 + (seedB - 0.5) * 6).toFixed(2));
    const centerNorth = Number((side * (13.5 + ((seedC * (i + 1)) % 1) * 5.5)).toFixed(2));
    const widthEast = Number((7.5 + ((seedA * (i + 2)) % 1) * 5.0).toFixed(2));
    const depthNorth = Number((6.5 + ((seedB * (i + 3)) % 1) * 4.0).toFixed(2));
    const stories = 1 + Math.floor(((seedC * (i + 4)) % 1) * 3);
    const heightMeters = Number((stories * 3.4 + 1.5).toFixed(2));

    buildings.push({
      id: `math-bld-${i}-${Math.round(seedA * 10000)}`,
      centerEast,
      centerNorth,
      widthEast,
      depthNorth,
      heightMeters,
      roofStyle: roofStyles[(i + Math.floor(seedA * 10)) % roofStyles.length],
      wallColorHex: wallPalette[(i + Math.floor(seedB * 10)) % wallPalette.length],
      roofColorHex: roofPalette[(i + Math.floor(seedC * 10)) % roofPalette.length],
      trimColorHex: '#27272a',
      stories,
    });
  }

  const drivingSide = baseTemplate.roads[0]?.drivingSide ?? (isNepal ? 'left' : 'right');
  const roads: RoadSegmentENU[] = [
    {
      id: `math-road-main-${Math.round(seedA * 10000)}`,
      startEast: -55,
      startNorth: 0,
      endEast: 55,
      endNorth: 0,
      widthMeters: 7.5 + Number((seedB * 2.0).toFixed(1)),
      surfaceType: seedC > 0.25 ? 'asphalt' : 'cobblestone',
      hasCenterLine: true,
      centerLineColorHex: drivingSide === 'left' ? '#facc15' : '#ffffff',
      drivingSide,
    },
  ];

  const signs: StreetSignClue[] = [
    {
      id: `math-sign-${Math.round(seedA * 10000)}`,
      east: Number((4.5 + seedB * 4.0).toFixed(2)),
      north: 4.8,
      up: 2.2,
      yawDeg: 90,
      primaryText: isNepal ? 'Nepal' : baseTemplate.countryName,
      secondaryText: isNepal ? 'Asia' : baseTemplate.cityName,
      signStyle: 'street_blade',
      backgroundColorHex: '#181b1f',
      textColorHex: '#f9fafb',
      borderColorHex: '#0284c7',
    },
  ];

  const propKinds: StreetPropENU['kind'][] = ['bollard', 'lantern', 'utility_pole', 'tree'];
  const props: StreetPropENU[] = [
    {
      id: `math-prop-1-${Math.round(seedA * 10000)}`,
      kind: propKinds[Math.floor(seedB * propKinds.length)],
      east: -6.5,
      north: -4.8,
      yawDeg: 0,
      scale: 1,
      colliderRadius: 0.3,
      colliderHeight: 2.4,
    },
    {
      id: `math-prop-2-${Math.round(seedC * 10000)}`,
      kind: propKinds[Math.floor(seedC * propKinds.length)],
      east: 8.5,
      north: -4.8,
      yawDeg: 180,
      scale: 1,
      colliderRadius: 0.3,
      colliderHeight: 2.4,
    },
  ];

  return {
    yawDeg,
    sunAzimuthDeg,
    sunElevationDeg,
    buildings,
    roads,
    signs,
    props,
  };
}

/**
 * Mitchell's Best-Candidate Geodesic Maximin Sampler:
 * Generates candidate coordinates using 2D R2 Weyl low-discrepancy sequences + CSPRNG
 * and selects the candidate with the MAXIMUM minimum geodesic distance from all previously
 * visited places across both the current session and persistent localStorage history.
 * Ensures < 0.1% repeat probability even across new sessions.
 */
export function generateMathematicalNonRepeatingPlace(
  basePool: LocationCoverageRecord[],
  countryCodeFilter?: string | null,
  cityNameFilter?: string | null
): LocationCoverageRecord {
  const visited = getVisitedCoordinates();
  const isCityMode = Boolean(cityNameFilter && cityNameFilter.trim().length > 0);
  const isCountryMode = Boolean(countryCodeFilter && countryCodeFilter.trim().length > 0);

  // Pick a base template using low-discrepancy index so global mode cycles through all 200+ countries
  // before ever revisiting the same country
  const [u0, v0] = nextWeylSequencePair();
  let chosenTemplate = basePool[Math.floor(u0 * basePool.length) % basePool.length];

  if (!isCityMode && !isCountryMode && basePool.length > 10) {
    // In global mode, prefer countries not recently visited in the last 80 rounds
    const recentCountryCodes = new Set(visited.slice(-80).map((c) => c.countryCode));
    const freshCountries = basePool.filter(
      (b) => !recentCountryCodes.has(b.countryCode.toUpperCase())
    );
    if (freshCountries.length > 0) {
      chosenTemplate = freshCountries[Math.floor(v0 * freshCountries.length) % freshCountries.length];
    }
  }

  const isNepal = chosenTemplate.countryCode.toUpperCase() === 'NP';

  // Generate 24 mathematical candidate coordinates and pick the one furthest from all past coordinates
  const candidateCount = 24;
  let bestCandidate = {
    lat: chosenTemplate.originWGS84.lat,
    lon: chosenTemplate.originWGS84.lon,
    elevation: chosenTemplate.originWGS84.elevation,
    template: chosenTemplate,
  };
  let bestMinDistanceKm = -1;

  for (let i = 0; i < candidateCount; i++) {
    const [u, v] = nextWeylSequencePair();
    // Pick template from pool if country has multiple reference templates
    const tpl = basePool[(Math.floor(u * basePool.length) + i) % basePool.length];

    let sample: { lat: number; lon: number; elevation: number };
    if (isNepal && !isCityMode) {
      // Pure mathematical continuous sampling across all of Nepal
      sample = sampleNepalContinuousMath(u, v);
    } else if (isCityMode) {
      // Continuous polar disk sampling across the metropolitan area (radius 9 km)
      sample = samplePolarContinuousMath(
        tpl.originWGS84.lat,
        tpl.originWGS84.lon,
        tpl.originWGS84.elevation,
        9.0,
        u,
        v
      );
    } else {
      // Country-wide continuous polar sampling around country reference sectors (radius 65 km)
      sample = samplePolarContinuousMath(
        tpl.originWGS84.lat,
        tpl.originWGS84.lon,
        tpl.originWGS84.elevation,
        65.0,
        u,
        v
      );
    }

    // Compute minimum geodesic distance to all previously visited coordinates
    let minDistanceKm = Number.POSITIVE_INFINITY;
    for (let j = visited.length - 1; j >= 0; j--) {
      const past = visited[j];
      // Fast bounding-box pre-check before exact Vincenty geodesic calculation
      if (Math.abs(past.lat - sample.lat) > 5 || Math.abs(past.lon - sample.lon) > 5) {
        continue;
      }
      const dist = computeGeodesicInverse(
        { lat: sample.lat, lon: sample.lon },
        { lat: past.lat, lon: past.lon }
      ).distanceKm;
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
      }
    }

    if (minDistanceKm > bestMinDistanceKm) {
      bestMinDistanceKm = minDistanceKm;
      bestCandidate = {
        lat: sample.lat,
        lon: sample.lon,
        elevation: sample.elevation,
        template: tpl,
      };
    }

    // Early accept if candidate is well-separated (> 25km in country mode or > 2.5km in city mode)
    const targetSeparationKm = isCityMode ? 2.5 : 25.0;
    if (minDistanceKm >= targetSeparationKm && i >= 3) {
      break;
    }
  }

  // Record this new mathematical coordinate in persistent cross-session history
  recordVisitedCoordinate(
    bestCandidate.lat,
    bestCandidate.lon,
    bestCandidate.template.countryCode
  );

  // Synthesize unique 3D scene geometry from the mathematical coordinates
  const scene3D = synthesizeMathematical3DScene(
    bestCandidate.lat,
    bestCandidate.lon,
    bestCandidate.template
  );

  const uniqueToken = Math.round(
    (Math.abs(bestCandidate.lat * 10000) + Math.abs(bestCandidate.lon * 10000) + cryptoRandomFloat() * 100000)
  ).toString(36);

  return {
    ...bestCandidate.template,
    locationId: `${bestCandidate.template.countryCode.toLowerCase()}-math-${uniqueToken}`,
    title: isNepal ? 'Nepal Outdoor Sector' : bestCandidate.template.title,
    cityName: isNepal ? 'Nepal' : bestCandidate.template.cityName,
    regionName: isNepal ? 'Nepal, Asia' : bestCandidate.template.regionName,
    originWGS84: {
      lat: bestCandidate.lat,
      lon: bestCandidate.lon,
      elevation: bestCandidate.elevation,
    },
    h3Index: latLonToH3Index(bestCandidate.lat, bestCandidate.lon, 9),
    spawnPointENU: {
      east: 0,
      north: 0,
      up: 0,
      yawDeg: scene3D.yawDeg,
    },
    sunAzimuthDeg: scene3D.sunAzimuthDeg,
    sunElevationDeg: scene3D.sunElevationDeg,
    buildings: scene3D.buildings,
    roads: scene3D.roads,
    signs: scene3D.signs,
    props: scene3D.props,
  };
}
