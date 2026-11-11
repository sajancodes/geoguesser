/**
 * Shared strict TypeScript definitions for Earth Uncovered.
 * Zero `any` types permitted across the entire codebase.
 */

export interface WGS84Coordinate {
  lat: number; // degrees [-90, 90]
  lon: number; // degrees [-180, 180]
  elevation: number; // meters above WGS84 ellipsoid
}

export interface ECEFCoordinate {
  x: number; // meters
  y: number; // meters
  z: number; // meters
}

export interface ENUCoordinate {
  east: number; // meters (+X in scene)
  north: number; // meters (-Z in scene)
  up: number; // meters (+Y in scene)
}

export interface BoundingBoxENU {
  minEast: number;
  maxEast: number;
  minNorth: number;
  maxNorth: number;
  minUp: number;
  maxUp: number;
}

export interface GeographicBoundsWGS84 {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export type ChunkPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export type ChunkLODLevel = 0 | 1 | 2;

export interface ChunkQualityMetadata {
  visualCompleteness: number; // 0..100
  navigationCompleteness: number; // 0..100
  captureDate: string;
  license: string;
}

export interface ChunkAssetManifest {
  splatUrl: string;
  byteLength: number;
  splatCount: number;
  compression: 'splat-32b' | 'sog-quantized';
  assetVersion: string;
}

export interface WorldChunkDescriptor {
  chunkId: string;
  locationId: string;
  parentId: string | null;
  childIds: string[];
  qx: number;
  qz: number;
  lodLevel: ChunkLODLevel;
  h3Index: string;
  boundsWGS84: GeographicBoundsWGS84;
  boundingBoxENU: BoundingBoxENU;
  assetManifest: ChunkAssetManifest;
  qualityMetadata: ChunkQualityMetadata;
}

export interface StreetSignClue {
  id: string;
  east: number;
  north: number;
  up: number;
  yawDeg: number;
  primaryText: string;
  secondaryText: string;
  signStyle: 'street_blade' | 'route_shield' | 'shop_fascia' | 'milestone' | 'warning_plate';
  backgroundColorHex: string;
  textColorHex: string;
  borderColorHex: string;
}

export interface BuildingFootprintENU {
  id: string;
  centerEast: number;
  centerNorth: number;
  widthEast: number;
  depthNorth: number;
  heightMeters: number;
  roofStyle: 'gable_tile' | 'flat_parapet' | 'pitched_corrugated' | 'stepped_terrace';
  wallColorHex: string;
  roofColorHex: string;
  trimColorHex: string;
  stories: number;
}

export interface RoadSegmentENU {
  id: string;
  startEast: number;
  startNorth: number;
  endEast: number;
  endNorth: number;
  widthMeters: number;
  surfaceType: 'asphalt' | 'cobblestone' | 'flagstone' | 'gravel';
  hasCenterLine: boolean;
  centerLineColorHex: string;
  drivingSide: 'left' | 'right';
}

export interface StreetPropENU {
  id: string;
  kind: 'tree' | 'lantern' | 'bollard' | 'utility_pole' | 'bench' | 'vehicle';
  east: number;
  north: number;
  yawDeg: number;
  scale: number;
  colliderRadius: number;
  colliderHeight: number;
}

export interface CoverageLayerStatus {
  geographic: boolean;
  terrain: boolean;
  road: boolean;
  building: boolean;
  photorealistic3D: boolean;
  collision: boolean;
}

export interface LocationCoverageRecord {
  locationId: string;
  title: string;
  cityName: string;
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
  visualQualityScore: number; // 0..100
  navigationQualityScore: number; // 0..100
  spawnPointENU: { east: number; north: number; up: number; yawDeg: number };
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  skyHorizonHex: string;
  skyZenithHex: string;
  groundTintHex: string;
  architecturalNotes: string[];
  buildings: BuildingFootprintENU[];
  roads: RoadSegmentENU[];
  signs: StreetSignClue[];
  props: StreetPropENU[];
}

export interface CoverageEligibilityResult {
  locationId: string;
  eligible: boolean;
  reasons: string[];
  compositeScore: number;
}

export type PerformanceProfileId = 'PERFORMANCE' | 'BALANCED' | 'QUALITY';

export interface PerformanceProfileConfig {
  id: PerformanceProfileId;
  label: string;
  streamingRadiusMeters: number;
  maxPixelRatio: number;
  maxActiveSplats: number;
  memoryBudgetBytes: number;
  enableShadows: boolean;
  enableAmbientSimulation: boolean;
}

export type RenderingBackendType = 'webgpu' | 'webgl2' | 'software-webgl' | 'unsupported';

export interface GraphicsCapabilityReport {
  backend: RenderingBackendType;
  rendererString: string;
  isSoftwareRenderer: boolean;
  maxTextureSize: number;
  maxAnisotropy: number;
  supportsWebGPU: boolean;
  supportsOffscreenCanvas: boolean;
  deviceMemoryGB: number | null;
}

export type StreetView3DMode =
  | 'streetview_3d_hybrid'
  | 'streetview_3d_relief'
  | 'google_photorealistic_3d';

export interface RuntimeTelemetrySnapshot {
  fps: number;
  frameTimeP50Ms: number;
  frameTimeP95Ms: number;
  frameTimeP99Ms: number;
  activeProfile: PerformanceProfileId;
  autoDowngraded: boolean;
  backend: RenderingBackendType;
  loadedChunksCount: number;
  visibleChunksCount: number;
  inFlightRequests: number;
  cancelledRequests: number;
  failedRequests: number;
  evictedChunksCount: number;
  cacheUsedBytes: number;
  cacheBudgetBytes: number;
  activeSplatCount: number;
  initialLoadTimeMs: number;
  lastChunkLoadTimeMs: number;
  playerENU: ENUCoordinate;
  playerWGS84: WGS84Coordinate | null; // null during unrevealed competitive rounds
  currentH3Index: string;
  cameraYawDeg: number;
  cameraPitchDeg: number;
  active3DMode?: StreetView3DMode;
  streetViewPanoId?: string | null;
  linkedPanosCount?: number;
  streetViewLinks?: Array<{ pano: string; heading: number; description: string }>;
  depthReliefStrength?: number;
}

export type GameModeId = 'classic' | 'explorer' | 'no_movement' | 'country_challenge' | 'duel_seed';

export interface GameRoundPublicState {
  sessionId: string;
  roundNumber: number;
  totalRounds: number;
  mode: GameModeId;
  countryFilter: string | null;
  seedCode: string;
  timeLimitSeconds: number | null;
  startedAtIso: string;
  allowMovement: boolean;
  // Local ENU + Street View 3D bootstrap data
  sceneBootstrap: {
    sessionLocationToken: string;
    streetViewTarget: {
      lat: number;
      lon: number;
      elevation: number;
      headingDeg: number;
      pitchDeg: number;
    };
    spawnPointENU: { east: number; north: number; up: number; yawDeg: number };
    sunAzimuthDeg: number;
    sunElevationDeg: number;
    skyHorizonHex: string;
    skyZenithHex: string;
    groundTintHex: string;
    buildings: BuildingFootprintENU[];
    roads: RoadSegmentENU[];
    signs: StreetSignClue[];
    props: StreetPropENU[];
    chunks: WorldChunkDescriptor[];
    // Revealed immediately ONLY in explorer mode:
    explorerMetadata: {
      locationId: string;
      title: string;
      countryName: string;
      regionName: string;
      originWGS84: WGS84Coordinate;
      h3Index: string;
    } | null;
  };
}

export interface GuessSubmissionRequest {
  sessionId: string;
  guessLat: number;
  guessLon: number;
  elapsedSeconds: number;
}

export interface GuessEvaluationResult {
  sessionId: string;
  roundNumber: number;
  guessWGS84: { lat: number; lon: number };
  actualWGS84: WGS84Coordinate;
  locationId: string;
  locationTitle: string;
  countryName: string;
  regionName: string;
  distanceKm: number;
  distanceMeters: number;
  initialBearingDeg: number;
  score: number;
  maxScore: number;
  difficultyConstantK: number;
  architecturalNotes: string[];
  dataSource: string;
  license: string;
  captureDate: string;
}
