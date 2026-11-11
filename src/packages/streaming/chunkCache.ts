import type {
  ChunkLODLevel,
  ChunkPriority,
  ENUCoordinate,
  WorldChunkDescriptor,
} from '../shared-types';

const PRIORITY_WEIGHT: Record<ChunkPriority, number> = {
  P0: 100,
  P1: 80,
  P2: 60,
  P3: 40,
  P4: 20,
};

export interface CachedChunkEntry<TResource> {
  key: string; // `${chunkId}@${assetVersion}`
  chunkId: string;
  assetVersion: string;
  byteLength: number;
  priority: ChunkPriority;
  lastAccessedMs: number;
  resource: TResource;
  dispose: () => void;
}

/**
 * Memory-aware LRU + Priority cache for streamed 3D world chunks.
 * Enforces a strict byte budget and invokes GPU resource disposal on eviction.
 */
export class BoundedChunkCache<TResource> {
  private entries: Record<string, CachedChunkEntry<TResource>> = {};
  private budgetBytes: number;
  private usedBytes = 0;
  private evictedCount = 0;

  constructor(budgetBytes: number) {
    this.budgetBytes = Math.max(1024 * 1024, budgetBytes);
  }

  public setBudgetBytes(newBudgetBytes: number, protectedChunkIds: Set<string>): void {
    this.budgetBytes = Math.max(1024 * 1024, newBudgetBytes);
    this.evictToFit(0, protectedChunkIds);
  }

  public getUsedBytes(): number {
    return this.usedBytes;
  }

  public getBudgetBytes(): number {
    return this.budgetBytes;
  }

  public getEvictedCount(): number {
    return this.evictedCount;
  }

  public getEntryCount(): number {
    return Object.keys(this.entries).length;
  }

  public makeKey(chunkId: string, assetVersion: string): string {
    return `${chunkId}@${assetVersion}`;
  }

  public get(chunkId: string, assetVersion: string, nowMs: number = Date.now()): TResource | null {
    const key = this.makeKey(chunkId, assetVersion);
    const entry = this.entries[key];
    if (!entry) return null;
    entry.lastAccessedMs = nowMs;
    return entry.resource;
  }

  public has(chunkId: string, assetVersion: string): boolean {
    return Boolean(this.entries[this.makeKey(chunkId, assetVersion)]);
  }

  public put(
    entry: Omit<CachedChunkEntry<TResource>, 'key' | 'lastAccessedMs'>,
    protectedChunkIds: Set<string>,
    nowMs: number = Date.now()
  ): void {
    const key = this.makeKey(entry.chunkId, entry.assetVersion);
    const existing = this.entries[key];
    if (existing) {
      this.usedBytes -= existing.byteLength;
      existing.dispose();
      delete this.entries[key];
    }

    this.evictToFit(entry.byteLength, protectedChunkIds);

    this.entries[key] = {
      ...entry,
      key,
      lastAccessedMs: nowMs,
    };
    this.usedBytes += entry.byteLength;
  }

  public clearAll(): void {
    for (const key of Object.keys(this.entries)) {
      const entry = this.entries[key];
      entry.dispose();
      delete this.entries[key];
    }
    this.usedBytes = 0;
  }

  private evictToFit(incomingBytes: number, protectedChunkIds: Set<string>): void {
    if (this.usedBytes + incomingBytes <= this.budgetBytes) return;

    const candidates = Object.values(this.entries).filter(
      (e) => !protectedChunkIds.has(e.chunkId)
    );

    // Sort by lowest priority first, then oldest access timestamp (LRU)
    candidates.sort((a, b) => {
      const pwDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (pwDiff !== 0) return pwDiff;
      return a.lastAccessedMs - b.lastAccessedMs;
    });

    for (const candidate of candidates) {
      if (this.usedBytes + incomingBytes <= this.budgetBytes) break;
      candidate.dispose();
      this.usedBytes = Math.max(0, this.usedBytes - candidate.byteLength);
      delete this.entries[candidate.key];
      this.evictedCount++;
    }
  }
}

/**
 * Calculate Screen-Space Error (SSE) in pixels for a chunk at a given distance.
 */
export function computeChunkScreenSpaceError(
  lodLevel: ChunkLODLevel,
  distanceMeters: number,
  viewportHeightPx: number = 900,
  fovDeg: number = 70
): number {
  const safeDist = Math.max(1.0, distanceMeters);
  // Geometric error in meters scales by 2^lodLevel
  const geometricErrorMeters = 0.25 * Math.pow(2.5, lodLevel);
  const fovRad = (fovDeg * Math.PI) / 180;
  const projectionScale = viewportHeightPx / (2 * Math.tan(fovRad * 0.5));
  return (geometricErrorMeters * projectionScale) / safeDist;
}

/**
 * Determine desired LOD level based on distance and streaming radius.
 */
export function selectDesiredLODForDistance(
  distanceMeters: number,
  streamingRadiusMeters: number
): ChunkLODLevel | null {
  if (distanceMeters > streamingRadiusMeters) return null;
  if (distanceMeters <= 46) return 0;
  if (distanceMeters <= 95) return 1;
  return 2;
}

/**
 * Classify chunk asset priority (P0..P4) based on player position, camera forward direction,
 * and movement velocity vector (Section 5).
 */
export function classifyChunkPriority(
  chunk: WorldChunkDescriptor,
  playerENU: ENUCoordinate,
  cameraForwardENU: { east: number; north: number },
  velocityENU: { east: number; north: number }
): { priority: ChunkPriority; distanceMeters: number; isVisibleInCone: boolean } {
  const centerEast = (chunk.boundingBoxENU.minEast + chunk.boundingBoxENU.maxEast) * 0.5;
  const centerNorth = (chunk.boundingBoxENU.minNorth + chunk.boundingBoxENU.maxNorth) * 0.5;

  const dEast = centerEast - playerENU.east;
  const dNorth = centerNorth - playerENU.north;
  const distanceMeters = Math.hypot(dEast, dNorth);

  // Check if player is inside or immediately touching this chunk at LOD 0
  const insideBounds =
    playerENU.east >= chunk.boundingBoxENU.minEast - 6 &&
    playerENU.east <= chunk.boundingBoxENU.maxEast + 6 &&
    playerENU.north >= chunk.boundingBoxENU.minNorth - 6 &&
    playerENU.north <= chunk.boundingBoxENU.maxNorth + 6;

  if (insideBounds && chunk.lodLevel === 0) {
    return { priority: 'P0', distanceMeters, isVisibleInCone: true };
  }

  const invDist = distanceMeters > 0.001 ? 1 / distanceMeters : 0;
  const dirEast = dEast * invDist;
  const dirNorth = dNorth * invDist;

  const camDot = dirEast * cameraForwardENU.east + dirNorth * cameraForwardENU.north;
  const isVisibleInCone = distanceMeters < 22 || camDot >= -0.25;

  const speed = Math.hypot(velocityENU.east, velocityENU.north);
  const velDot =
    speed > 0.1
      ? (dirEast * velocityENU.east + dirNorth * velocityENU.north) / speed
      : 0;

  if (chunk.lodLevel === 0 && distanceMeters <= 48 && isVisibleInCone) {
    return { priority: 'P1', distanceMeters, isVisibleInCone };
  }

  if (velDot > 0.35 && distanceMeters <= 85) {
    return { priority: 'P2', distanceMeters, isVisibleInCone };
  }

  if (isVisibleInCone) {
    return { priority: 'P3', distanceMeters, isVisibleInCone };
  }

  return { priority: 'P4', distanceMeters, isVisibleInCone: false };
}

export function compareChunkPriority(a: ChunkPriority, b: ChunkPriority): number {
  return PRIORITY_WEIGHT[b] - PRIORITY_WEIGHT[a];
}
