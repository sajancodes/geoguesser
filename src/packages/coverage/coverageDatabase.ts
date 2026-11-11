import type {
  BuildingFootprintENU,
  ChunkLODLevel,
  CoverageEligibilityResult,
  CoverageLayerStatus,
  LocationCoverageRecord,
  RoadSegmentENU,
  StreetPropENU,
  StreetSignClue,
  WGS84Coordinate,
  WorldChunkDescriptor,
} from '../shared-types';
import {
  computeQuadtreeChunkBounds,
  latLonToH3Index,
} from '../geographic-index/coordinates';

const ALL_LAYERS_TRUE: CoverageLayerStatus = {
  geographic: true,
  terrain: true,
  road: true,
  building: true,
  photorealistic3D: true,
  collision: true,
};

const DRAFT_LAYERS: CoverageLayerStatus = {
  geographic: true,
  terrain: true,
  road: true,
  building: true,
  photorealistic3D: false,
  collision: false,
};

function makeLocation(
  partial: Omit<LocationCoverageRecord, 'h3Index'> & { h3Index?: string }
): LocationCoverageRecord {
  return {
    ...partial,
    h3Index: partial.h3Index ?? latLonToH3Index(partial.originWGS84.lat, partial.originWGS84.lon, 9),
  };
}

const kyotoBuildings: BuildingFootprintENU[] = [
  {
    id: 'bld-kyoto-w1',
    centerEast: -10.0,
    centerNorth: -12.0,
    widthEast: 9.0,
    depthNorth: 8.0,
    heightMeters: 12.0,
    roofStyle: 'gable_tile',
    wallColorHex: '#c9b89a',
    roofColorHex: '#8a4b3a',
    trimColorHex: '#3a2a1a',
    stories: 3,
  },
];

const kyotoRoads: RoadSegmentENU[] = [
  {
    id: 'road-kyoto-main',
    startEast: -25,
    startNorth: 0,
    endEast: 25,
    endNorth: 0,
    widthMeters: 8,
    surfaceType: 'asphalt',
    hasCenterLine: true,
    centerLineColorHex: '#facc15',
    drivingSide: 'left',
  },
];

const kyotoProps: StreetPropENU[] = [
  {
    id: 'prop-kyoto-lantern-1',
    kind: 'lantern',
    east: -3,
    north: -2,
    yawDeg: 0,
    scale: 1,
    colliderRadius: 0.3,
    colliderHeight: 2.5,
  },
];

const kyotoSigns: StreetSignClue[] = [
  {
    id: 'sign-kyoto-1',
    east: 4,
    north: 1,
    up: 2.2,
    yawDeg: 90,
    primaryText: 'Higashiyama',
    secondaryText: '東山',
    signStyle: 'street_blade',
    backgroundColorHex: '#1f2937',
    textColorHex: '#f9fafb',
    borderColorHex: '#0284c7',
  },
];

export const COVERAGE_DATABASE: LocationCoverageRecord[] = [
  makeLocation({
    locationId: 'kyoto-higashiyama',
    title: 'Kyoto Higashiyama Historic District',
    countryCode: 'JP',
    countryName: 'Japan',
    regionName: 'Kyoto Prefecture',
    originWGS84: { lat: 34.998582, lon: 135.780895, elevation: 68 },
    coverageLayers: ALL_LAYERS_TRUE,
    captureDate: '2026-04-18',
    assetVersion: '1.2.0',
    dataSource: 'OpenStreetMap ODbL / Copernicus DEM / Surveyed Splat',
    license: 'CC-BY-4.0 / ODbL Surveyed Hybrid',
    visualQualityScore: 94,
    navigationQualityScore: 96,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 108 },
    sunAzimuthDeg: 142,
    sunElevationDeg: 48,
    skyHorizonHex: '#9ec9e8',
    skyZenithHex: '#3b82f6',
    groundTintHex: '#7c8a6b',
    architecturalNotes: [
      'Traditional machiya wooden facades with lattice windows.',
      'Stone-paved lanes and temple gate sightlines.',
    ],
    buildings: kyotoBuildings,
    roads: kyotoRoads,
    signs: kyotoSigns,
    props: kyotoProps,
  }),
  makeLocation({
    locationId: 'reykjavik-hallgrimskirkja',
    title: 'Reykjavik Hallgrimskirkja Approach',
    countryCode: 'IS',
    countryName: 'Iceland',
    regionName: 'Capital Region',
    originWGS84: { lat: 64.142665, lon: -21.928412, elevation: 32 },
    coverageLayers: ALL_LAYERS_TRUE,
    captureDate: '2026-04-20',
    assetVersion: '1.1.0',
    dataSource: 'OpenStreetMap ODbL / Copernicus DEM / Surveyed Splat',
    license: 'CC-BY-4.0 / ODbL Surveyed Hybrid',
    visualQualityScore: 88,
    navigationQualityScore: 90,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 30 },
    sunAzimuthDeg: 180,
    sunElevationDeg: 25,
    skyHorizonHex: '#b7d4e8',
    skyZenithHex: '#6aa7d6',
    groundTintHex: '#8a9099',
    architecturalNotes: ['Concrete church spire landmark.', 'Low-rise Nordic rooftops.'],
    buildings: [],
    roads: [],
    signs: [],
    props: [],
  }),
  makeLocation({
    locationId: 'valparaiso-cerro-alegre',
    title: 'Valparaiso Cerro Alegre Hillside',
    countryCode: 'CL',
    countryName: 'Chile',
    regionName: 'Valparaiso Region',
    originWGS84: { lat: -33.041635, lon: -71.627345, elevation: 45 },
    coverageLayers: ALL_LAYERS_TRUE,
    captureDate: '2026-04-22',
    assetVersion: '1.0.5',
    dataSource: 'OpenStreetMap ODbL / Copernicus DEM / Surveyed Splat',
    license: 'CC-BY-4.0 / ODbL Surveyed Hybrid',
    visualQualityScore: 86,
    navigationQualityScore: 88,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 200 },
    sunAzimuthDeg: 210,
    sunElevationDeg: 52,
    skyHorizonHex: '#a8c8e0',
    skyZenithHex: '#4a90d9',
    groundTintHex: '#9a8a7a',
    architecturalNotes: ['Colorful hillside houses.', 'Funicular and steep streets.'],
    buildings: [],
    roads: [],
    signs: [],
    props: [],
  }),
  makeLocation({
    locationId: 'marrakech-jemaa-el-fna',
    title: 'Marrakech Jemaa el-Fna Square',
    countryCode: 'MA',
    countryName: 'Morocco',
    regionName: 'Marrakesh-Safi',
    originWGS84: { lat: 31.62482, lon: -7.99218, elevation: 466 },
    coverageLayers: ALL_LAYERS_TRUE,
    captureDate: '2026-04-15',
    assetVersion: '1.0.3',
    dataSource: 'OpenStreetMap ODbL / Copernicus DEM / Surveyed Splat',
    license: 'CC-BY-4.0 / ODbL Surveyed Hybrid',
    visualQualityScore: 90,
    navigationQualityScore: 92,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 60 },
    sunAzimuthDeg: 120,
    sunElevationDeg: 60,
    skyHorizonHex: '#d4b896',
    skyZenithHex: '#87ceeb',
    groundTintHex: '#c9a87a',
    architecturalNotes: ['Souk alleys and riad facades.', 'Minaret sightlines.'],
    buildings: [],
    roads: [],
    signs: [],
    props: [],
  }),
  makeLocation({
    locationId: 'paris-champ-de-mars',
    title: 'Paris Champ de Mars',
    countryCode: 'FR',
    countryName: 'France',
    regionName: 'Paris 7e',
    originWGS84: { lat: 48.85942, lon: 2.29978, elevation: 35 },
    coverageLayers: ALL_LAYERS_TRUE,
    captureDate: '2026-04-12',
    assetVersion: '1.0.8',
    dataSource: 'OpenStreetMap ODbL / Copernicus DEM / Surveyed Splat',
    license: 'CC-BY-4.0 / ODbL Surveyed Hybrid',
    visualQualityScore: 92,
    navigationQualityScore: 94,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 225 },
    sunAzimuthDeg: 200,
    sunElevationDeg: 40,
    skyHorizonHex: '#a0b8d0',
    skyZenithHex: '#5a9bd5',
    groundTintHex: '#7a8a6a',
    architecturalNotes: ['Iron lattice tower landmark.', 'Formal garden paths.'],
    buildings: [],
    roads: [],
    signs: [],
    props: [],
  }),
  makeLocation({
    locationId: 'new-york-dumbo',
    title: 'New York DUMBO Waterfront',
    countryCode: 'US',
    countryName: 'United States',
    regionName: 'New York',
    originWGS84: { lat: 40.70328, lon: -73.98962, elevation: 12 },
    coverageLayers: ALL_LAYERS_TRUE,
    captureDate: '2026-04-25',
    assetVersion: '1.0.2',
    dataSource: 'OpenStreetMap ODbL / Copernicus DEM / Surveyed Splat',
    license: 'CC-BY-4.0 / ODbL Surveyed Hybrid',
    visualQualityScore: 89,
    navigationQualityScore: 91,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 150 },
    sunAzimuthDeg: 160,
    sunElevationDeg: 55,
    skyHorizonHex: '#9bb8d0',
    skyZenithHex: '#4a8ec9',
    groundTintHex: '#6a7a8a',
    architecturalNotes: ['Brick warehouse facades.', 'Bridge and waterfront views.'],
    buildings: [],
    roads: [],
    signs: [],
    props: [],
  }),
  // Draft (ineligible) locations
  makeLocation({
    locationId: 'cairo-al-muizz-draft',
    title: 'Cairo Al-Muizz Street Draft',
    countryCode: 'EG',
    countryName: 'Egypt',
    regionName: 'Cairo',
    originWGS84: { lat: 30.0444, lon: 31.262, elevation: 25 },
    coverageLayers: DRAFT_LAYERS,
    captureDate: '2026-03-01',
    assetVersion: '0.9.0-draft',
    dataSource: 'OpenStreetMap ODbL / Draft',
    license: 'CC-BY-4.0',
    visualQualityScore: 60,
    navigationQualityScore: 50,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 0 },
    sunAzimuthDeg: 100,
    sunElevationDeg: 70,
    skyHorizonHex: '#d4c8a0',
    skyZenithHex: '#87ceeb',
    groundTintHex: '#b0a080',
    architecturalNotes: ['Draft capture incomplete.'],
    buildings: [],
    roads: [],
    signs: [],
    props: [],
  }),
  makeLocation({
    locationId: 'anchorage-turnagain-draft',
    title: 'Anchorage Turnagain Arm Draft',
    countryCode: 'US',
    countryName: 'United States',
    regionName: 'Alaska',
    originWGS84: { lat: 61.2181, lon: -149.9003, elevation: 10 },
    coverageLayers: DRAFT_LAYERS,
    captureDate: '2026-03-05',
    assetVersion: '0.9.1-draft',
    dataSource: 'OpenStreetMap ODbL / Draft',
    license: 'CC-BY-4.0',
    visualQualityScore: 55,
    navigationQualityScore: 60,
    spawnPointENU: { east: 0, north: 0, up: 0, yawDeg: 0 },
    sunAzimuthDeg: 180,
    sunElevationDeg: 20,
    skyHorizonHex: '#c8d8e8',
    skyZenithHex: '#7ab0d8',
    groundTintHex: '#8a9a7a',
    architecturalNotes: ['Draft capture incomplete.'],
    buildings: [],
    roads: [],
    signs: [],
    props: [],
  }),
];

export function evaluateLocationEligibility(rec: LocationCoverageRecord): CoverageEligibilityResult {
  const reasons: string[] = [];
  const layers = rec.coverageLayers;

  if (!layers.geographic) reasons.push('Missing geographic coverage layer');
  if (!layers.terrain) reasons.push('Missing terrain coverage layer');
  if (!layers.road) reasons.push('Missing road coverage layer');
  if (!layers.building) reasons.push('Missing building coverage layer');
  if (!layers.photorealistic3D) reasons.push('Missing photorealistic 3D splat coverage layer');
  if (!layers.collision) reasons.push('Missing collision proxy coverage layer');

  if (rec.visualQualityScore < 80) {
    reasons.push(`Visual quality score ${rec.visualQualityScore} below threshold 80`);
  }
  if (rec.navigationQualityScore < 85) {
    reasons.push(`Navigation quality score ${rec.navigationQualityScore} below threshold 85`);
  }
  if (!rec.spawnPointENU) {
    reasons.push('Missing verified spawn point');
  }
  if (!rec.buildings || rec.buildings.length === 0) {
    // collision proxies tracked via collision layer; drafts may lack buildings
  }

  const eligible = reasons.length === 0;
  const compositeScore = Math.round((rec.visualQualityScore + rec.navigationQualityScore) / 2);

  return {
    locationId: rec.locationId,
    eligible,
    reasons,
    compositeScore,
  };
}

export function getEligiblePlayableLocations(countryCodeFilter: string | null): LocationCoverageRecord[] {
  return COVERAGE_DATABASE.filter((rec) => {
    if (!evaluateLocationEligibility(rec).eligible) return false;
    if (countryCodeFilter && rec.countryCode !== countryCodeFilter) return false;
    return true;
  });
}

export function buildQuadtreeChunksForLocation(location: LocationCoverageRecord): WorldChunkDescriptor[] {
  const chunks: WorldChunkDescriptor[] = [];

  const lodRanges: Record<ChunkLODLevel, number[]> = {
    0: [-2, -1, 0, 1, 2],
    1: [-1, 0, 1],
    2: [0],
  };

  const splatCounts: Record<ChunkLODLevel, number> = {
    0: 2400,
    1: 1200,
    2: 600,
  };

  // Build chunks per LOD
  for (const lod of [2, 1, 0] as ChunkLODLevel[]) {
    for (const qx of lodRanges[lod]) {
      for (const qz of lodRanges[lod]) {
        const { boundingBoxENU, boundsWGS84 } = computeQuadtreeChunkBounds(
          location.originWGS84,
          qx,
          qz,
          lod
        );

        const chunkId = `${location.locationId}:L${lod}:X${qx}:Z${qz}`;

        // Parent determination
        let parentId: string | null = null;
        if (lod === 1) {
          parentId = `${location.locationId}:L2:X0:Z0`;
        } else if (lod === 0) {
          const parentQx = Math.trunc(qx / 2);
          const parentQz = Math.trunc(qz / 2);
          const clampedParentQx = Math.max(-1, Math.min(1, parentQx));
          const clampedParentQz = Math.max(-1, Math.min(1, parentQz));
          parentId = `${location.locationId}:L1:X${clampedParentQx}:Z${clampedParentQz}`;
        }

        chunks.push({
          chunkId,
          locationId: location.locationId,
          parentId,
          childIds: [],
          qx,
          qz,
          lodLevel: lod,
          h3Index: location.h3Index,
          boundsWGS84,
          boundingBoxENU,
          assetManifest: {
            splatUrl: `/api/world/chunks/${location.locationId}/${chunkId}.splat`,
            byteLength: splatCounts[lod] * 32,
            splatCount: splatCounts[lod],
            compression: 'splat-32b',
            assetVersion: location.assetVersion,
          },
          qualityMetadata: {
            visualCompleteness: location.visualQualityScore,
            navigationCompleteness: location.navigationQualityScore,
            captureDate: location.captureDate,
            license: location.license,
          },
        });
      }
    }
  }

  // Assign childIds
  const byId = new Map(chunks.map((c) => [c.chunkId, c]));
  for (const chunk of chunks) {
    if (chunk.lodLevel === 2) {
      chunk.childIds = chunks
        .filter((c) => c.lodLevel === 1)
        .map((c) => c.chunkId);
    } else if (chunk.lodLevel === 1) {
      chunk.childIds = chunks
        .filter((c) => {
          if (c.lodLevel !== 0) return false;
          const parentQx = Math.max(-1, Math.min(1, Math.trunc(c.qx / 2)));
          const parentQz = Math.max(-1, Math.min(1, Math.trunc(c.qz / 2)));
          return (
            `${location.locationId}:L1:X${parentQx}:Z${parentQz}` === chunk.chunkId
          );
        })
        .map((c) => c.chunkId);
    } else {
      chunk.childIds = [];
    }
  }

  return chunks;
}