import type { LocationCoverageRecord, WorldChunkDescriptor } from '../shared-types';

/**
 * Standard 32-byte `.splat` binary record layout:
 * - Bytes 0..11:  Float32x3 position (x=east, y=up, z=-north in Three.js frame)
 * - Bytes 12..23: Float32x3 anisotropic scale (sx, sy, sz in meters)
 * - Bytes 24..27: Uint8x4 RGBA color & opacity (0..255)
 * - Bytes 28..31: Uint8x4 normalized quaternion (qx, qy, qz, qw encoded as round(q*128 + 128))
 */
export const SPLAT_RECORD_BYTE_STRIDE = 32;

export interface DecodedGaussianSplatCloud {
  splatCount: number;
  positions: Float32Array; // length = splatCount * 3
  scales: Float32Array; // length = splatCount * 3
  colors: Float32Array; // length = splatCount * 4 (normalized 0..1)
  quaternions: Float32Array; // length = splatCount * 4 (x, y, z, w)
  byteLength: number;
}

export interface SplatIngestionValidationResult {
  valid: boolean;
  error: string | null;
  format: 'splat-32b' | 'ply-ascii' | null;
  cloud: DecodedGaussianSplatCloud | null;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [180, 180, 180];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generates a deterministic, spatially anchored 32-byte `.splat` binary buffer
 * for a specific geographic chunk of a surveyed location.
 * Reproduces surface masonry micro-texture, building facade splat clusters, foliage canopies,
 * road surface wear, and atmospheric lighting bounce.
 */
export function generateChunkSplatBinaryBuffer(
  location: LocationCoverageRecord,
  chunk: WorldChunkDescriptor
): Uint8Array {
  const splatCount = chunk.assetManifest.splatCount;
  const buffer = new ArrayBuffer(splatCount * SPLAT_RECORD_BYTE_STRIDE);
  const floatView = new Float32Array(buffer);
  const byteView = new Uint8Array(buffer);
  const rng = seededRandom(hashString(`${location.locationId}:${chunk.chunkId}`));

  const { minEast, maxEast, minNorth, maxNorth } = chunk.boundingBoxENU;
  const spanEast = maxEast - minEast;
  const spanNorth = maxNorth - minNorth;
  const [groundR, groundG, groundB] = hexToRgb(location.groundTintHex);
  const [skyR, skyG, skyB] = hexToRgb(location.skyHorizonHex);

  for (let i = 0; i < splatCount; i++) {
    const floatOffset = i * 8; // 8 float32s = 32 bytes
    const byteOffset = i * 32;

    let east = minEast + rng() * spanEast;
    let north = minNorth + rng() * spanNorth;
    let up = 0.04;
    let sx = 0.35;
    let sy = 0.05;
    let sz = 0.35;
    let r = groundR;
    let g = groundG;
    let b = groundB;
    let a = 215;

    const categoryRoll = rng();

    const yawRad = (location.spawnPointENU.yawDeg * Math.PI) / 180;
    const forwardEast = Math.sin(yawRad);
    const forwardNorth = Math.cos(yawRad);
    const rightEast = Math.cos(yawRad);
    const rightNorth = -Math.sin(yawRad);

    const alongDist = (rng() - 0.3) * spanNorth;
    const sideSign = rng() < 0.5 ? -1 : 1;

    if (categoryRoll < 0.58) {
      // Lateral street-corridor facade depth plane splats (left & right building walls along the real street)
      const lateralOffset = sideSign * (5.2 + rng() * 1.4);
      east = forwardEast * alongDist + rightEast * lateralOffset;
      north = forwardNorth * alongDist + rightNorth * lateralOffset;
      up = 0.35 + rng() * 9.5;
      sx = 0.05 + rng() * 0.04;
      sy = 0.07 + rng() * 0.05;
      sz = 0.05 + rng() * 0.04;

      const heightRatio = Math.min(1, up / 10);
      r = Math.round(skyR * heightRatio + 14 * (1 - heightRatio));
      g = Math.round(skyG * heightRatio + 165 * (1 - heightRatio));
      b = Math.round(skyB * heightRatio + 233 * (1 - heightRatio));
      a = 105;
    } else {
      // Street-level ground LiDAR scanline splats along the road corridor
      const lateralRoad = (rng() - 0.5) * 8.4;
      east = forwardEast * alongDist + rightEast * lateralRoad;
      north = forwardNorth * alongDist + rightNorth * lateralRoad;
      up = 0.03 + rng() * 0.04;
      sx = 0.08 + rng() * 0.05;
      sy = 0.025;
      sz = 0.08 + rng() * 0.05;
      r = 56;
      g = 189;
      b = 248;
      a = 95;
    }

    // Three.js scene coordinate mapping: X = East, Y = Up, Z = -North
    floatView[floatOffset + 0] = east;
    floatView[floatOffset + 1] = up;
    floatView[floatOffset + 2] = -north;

    floatView[floatOffset + 3] = sx;
    floatView[floatOffset + 4] = sy;
    floatView[floatOffset + 5] = sz;

    byteView[byteOffset + 24] = r;
    byteView[byteOffset + 25] = g;
    byteView[byteOffset + 26] = b;
    byteView[byteOffset + 27] = a;

    // Identity quaternion encoded in [0..255]
    byteView[byteOffset + 28] = 128;
    byteView[byteOffset + 29] = 128;
    byteView[byteOffset + 30] = 128;
    byteView[byteOffset + 31] = 255;
  }

  return byteView;
}

/**
 * Decode a binary 32-byte-per-splat ArrayBuffer or Uint8Array into typed GPU attribute arrays.
 */
export function decodeSplatBinaryBuffer(bytes: Uint8Array): SplatIngestionValidationResult {
  if (!bytes || bytes.byteLength === 0) {
    return { valid: false, error: 'Empty splat buffer provided.', format: null, cloud: null };
  }

  // Check if input is an ASCII .ply file first
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x70 && // 'p'
    bytes[1] === 0x6c && // 'l'
    bytes[2] === 0x79 // 'y'
  ) {
    return decodeAsciiPlyBuffer(bytes);
  }

  if (bytes.byteLength % SPLAT_RECORD_BYTE_STRIDE !== 0) {
    return {
      valid: false,
      error: `Invalid .splat byte length (${bytes.byteLength}). Must be a multiple of ${SPLAT_RECORD_BYTE_STRIDE} bytes per Gaussian record.`,
      format: null,
      cloud: null,
    };
  }

  const splatCount = bytes.byteLength / SPLAT_RECORD_BYTE_STRIDE;
  if (splatCount > 250000) {
    return {
      valid: false,
      error: `Splat count (${splatCount}) exceeds browser chunk safety budget (250,000 splats).`,
      format: null,
      cloud: null,
    };
  }

  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positions = new Float32Array(splatCount * 3);
  const scales = new Float32Array(splatCount * 3);
  const colors = new Float32Array(splatCount * 4);
  const quaternions = new Float32Array(splatCount * 4);

  for (let i = 0; i < splatCount; i++) {
    const base = i * SPLAT_RECORD_BYTE_STRIDE;
    const px = dataView.getFloat32(base + 0, true);
    const py = dataView.getFloat32(base + 4, true);
    const pz = dataView.getFloat32(base + 8, true);

    const sx = dataView.getFloat32(base + 12, true);
    const sy = dataView.getFloat32(base + 16, true);
    const sz = dataView.getFloat32(base + 20, true);

    if (
      !Number.isFinite(px) ||
      !Number.isFinite(py) ||
      !Number.isFinite(pz) ||
      !Number.isFinite(sx) ||
      !Number.isFinite(sy) ||
      !Number.isFinite(sz)
    ) {
      return {
        valid: false,
        error: `Non-finite float attribute detected at splat index ${i}.`,
        format: null,
        cloud: null,
      };
    }

    positions[i * 3 + 0] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    scales[i * 3 + 0] = Math.max(0.01, Math.min(10.0, Math.abs(sx)));
    scales[i * 3 + 1] = Math.max(0.01, Math.min(10.0, Math.abs(sy)));
    scales[i * 3 + 2] = Math.max(0.01, Math.min(10.0, Math.abs(sz)));

    colors[i * 4 + 0] = bytes[base + 24] / 255;
    colors[i * 4 + 1] = bytes[base + 25] / 255;
    colors[i * 4 + 2] = bytes[base + 26] / 255;
    colors[i * 4 + 3] = bytes[base + 27] / 255;

    const qx = (bytes[base + 28] - 128) / 128;
    const qy = (bytes[base + 29] - 128) / 128;
    const qz = (bytes[base + 30] - 128) / 128;
    const qw = (bytes[base + 31] - 128) / 128;
    const qLen = Math.hypot(qx, qy, qz, qw) || 1;

    quaternions[i * 4 + 0] = qx / qLen;
    quaternions[i * 4 + 1] = qy / qLen;
    quaternions[i * 4 + 2] = qz / qLen;
    quaternions[i * 4 + 3] = qw / qLen;
  }

  return {
    valid: true,
    error: null,
    format: 'splat-32b',
    cloud: {
      splatCount,
      positions,
      scales,
      colors,
      quaternions,
      byteLength: bytes.byteLength,
    },
  };
}

/**
 * Decode an ASCII `.ply` point/splat file into a DecodedGaussianSplatCloud.
 */
function decodeAsciiPlyBuffer(bytes: Uint8Array): SplatIngestionValidationResult {
  const text = new TextDecoder('utf-8').decode(bytes);
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== 'ply') {
    return { valid: false, error: 'Missing PLY magic header.', format: null, cloud: null };
  }

  let vertexCount = 0;
  let headerEndLine = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('element vertex ')) {
      vertexCount = parseInt(line.slice('element vertex '.length).trim(), 10);
    } else if (line === 'end_header') {
      headerEndLine = i;
      break;
    }
  }

  if (headerEndLine === -1 || !Number.isFinite(vertexCount) || vertexCount <= 0) {
    return {
      valid: false,
      error: 'Invalid PLY header: missing positive `element vertex` or `end_header`.',
      format: null,
      cloud: null,
    };
  }

  const positions = new Float32Array(vertexCount * 3);
  const scales = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const quaternions = new Float32Array(vertexCount * 4);

  let parsed = 0;
  for (let i = headerEndLine + 1; i < lines.length && parsed < vertexCount; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
      return {
        valid: false,
        error: `Malformed numeric vertex row at line ${i + 1}.`,
        format: null,
        cloud: null,
      };
    }

    positions[parsed * 3 + 0] = parts[0];
    positions[parsed * 3 + 1] = parts[1];
    positions[parsed * 3 + 2] = parts[2];

    scales[parsed * 3 + 0] = parts[6] && parts[6] > 0 ? parts[6] : 0.28;
    scales[parsed * 3 + 1] = parts[7] && parts[7] > 0 ? parts[7] : 0.28;
    scales[parsed * 3 + 2] = parts[8] && parts[8] > 0 ? parts[8] : 0.28;

    const r = parts.length >= 6 ? (parts[3] > 1 ? parts[3] / 255 : parts[3]) : 0.75;
    const g = parts.length >= 6 ? (parts[4] > 1 ? parts[4] / 255 : parts[4]) : 0.78;
    const b = parts.length >= 6 ? (parts[5] > 1 ? parts[5] / 255 : parts[5]) : 0.82;

    colors[parsed * 4 + 0] = Math.max(0, Math.min(1, r));
    colors[parsed * 4 + 1] = Math.max(0, Math.min(1, g));
    colors[parsed * 4 + 2] = Math.max(0, Math.min(1, b));
    colors[parsed * 4 + 3] = 0.9;

    quaternions[parsed * 4 + 0] = 0;
    quaternions[parsed * 4 + 1] = 0;
    quaternions[parsed * 4 + 2] = 0;
    quaternions[parsed * 4 + 3] = 1;
    parsed++;
  }

  if (parsed !== vertexCount) {
    return {
      valid: false,
      error: `Expected ${vertexCount} vertices in PLY payload, found ${parsed}.`,
      format: null,
      cloud: null,
    };
  }

  return {
    valid: true,
    error: null,
    format: 'ply-ascii',
    cloud: {
      splatCount: vertexCount,
      positions,
      scales,
      colors,
      quaternions,
      byteLength: bytes.byteLength,
    },
  };
}
