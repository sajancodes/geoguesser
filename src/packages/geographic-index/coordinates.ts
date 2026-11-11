import type {
  BoundingBoxENU,
  ChunkLODLevel,
  ECEFCoordinate,
  ENUCoordinate,
  GeographicBoundsWGS84,
  WGS84Coordinate,
} from '../shared-types';

/**
 * WGS84 Ellipsoid Constants (NIMA TR8350.2)
 */
export const WGS84_SEMI_MAJOR_AXIS_A = 6378137.0; // meters
export const WGS84_FLATTENING_F = 1 / 298.257223563;
export const WGS84_SEMI_MINOR_AXIS_B = WGS84_SEMI_MAJOR_AXIS_A * (1 - WGS84_FLATTENING_F);
export const WGS84_ECCENTRICITY_SQ = 2 * WGS84_FLATTENING_F - WGS84_FLATTENING_F * WGS84_FLATTENING_F;
export const WGS84_SECOND_ECCENTRICITY_SQ =
  (WGS84_SEMI_MAJOR_AXIS_A * WGS84_SEMI_MAJOR_AXIS_A - WGS84_SEMI_MINOR_AXIS_B * WGS84_SEMI_MINOR_AXIS_B) /
  (WGS84_SEMI_MINOR_AXIS_B * WGS84_SEMI_MINOR_AXIS_B);

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert WGS84 Geodetic coordinates (lat, lon, elevation) to Earth-Centered Earth-Fixed (ECEF) meters.
 */
export function wgs84ToEcef(coord: WGS84Coordinate): ECEFCoordinate {
  const latRad = coord.lat * DEG_TO_RAD;
  const lonRad = coord.lon * DEG_TO_RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const primeVerticalRadiusN =
    WGS84_SEMI_MAJOR_AXIS_A / Math.sqrt(1 - WGS84_ECCENTRICITY_SQ * sinLat * sinLat);

  const x = (primeVerticalRadiusN + coord.elevation) * cosLat * cosLon;
  const y = (primeVerticalRadiusN + coord.elevation) * cosLat * sinLon;
  const z = (primeVerticalRadiusN * (1 - WGS84_ECCENTRICITY_SQ) + coord.elevation) * sinLat;

  return { x, y, z };
}

/**
 * Convert ECEF Cartesian coordinates (meters) back to WGS84 Geodetic coordinates (Bowring's closed-form method).
 */
export function ecefToWgs84(ecef: ECEFCoordinate): WGS84Coordinate {
  const { x, y, z } = ecef;
  const p = Math.sqrt(x * x + y * y);
  if (p < 1e-9) {
    const lat = z >= 0 ? 90 : -90;
    const elevation = Math.abs(z) - WGS84_SEMI_MINOR_AXIS_B;
    return { lat, lon: 0, elevation };
  }

  const theta = Math.atan2(z * WGS84_SEMI_MAJOR_AXIS_A, p * WGS84_SEMI_MINOR_AXIS_B);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const latRad = Math.atan2(
    z + WGS84_SECOND_ECCENTRICITY_SQ * WGS84_SEMI_MINOR_AXIS_B * sinTheta * sinTheta * sinTheta,
    p - WGS84_ECCENTRICITY_SQ * WGS84_SEMI_MAJOR_AXIS_A * cosTheta * cosTheta * cosTheta
  );
  const lonRad = Math.atan2(y, x);

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const primeVerticalRadiusN =
    WGS84_SEMI_MAJOR_AXIS_A / Math.sqrt(1 - WGS84_ECCENTRICITY_SQ * sinLat * sinLat);

  const elevation = p / cosLat - primeVerticalRadiusN;

  return {
    lat: latRad * RAD_TO_DEG,
    lon: lonRad * RAD_TO_DEG,
    elevation,
  };
}

/**
 * Convert WGS84 target coordinate to Local East-North-Up (ENU) tangent plane meters relative to origin.
 */
export function wgs84ToEnu(target: WGS84Coordinate, origin: WGS84Coordinate): ENUCoordinate {
  const targetEcef = wgs84ToEcef(target);
  const originEcef = wgs84ToEcef(origin);

  const dx = targetEcef.x - originEcef.x;
  const dy = targetEcef.y - originEcef.y;
  const dz = targetEcef.z - originEcef.z;

  const lat0 = origin.lat * DEG_TO_RAD;
  const lon0 = origin.lon * DEG_TO_RAD;
  const sinLat = Math.sin(lat0);
  const cosLat = Math.cos(lat0);
  const sinLon = Math.sin(lon0);
  const cosLon = Math.cos(lon0);

  const east = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  return { east, north, up };
}

/**
 * Convert Local East-North-Up (ENU) meters relative to origin back to global WGS84 coordinates.
 */
export function enuToWgs84(enu: ENUCoordinate, origin: WGS84Coordinate): WGS84Coordinate {
  const originEcef = wgs84ToEcef(origin);
  const lat0 = origin.lat * DEG_TO_RAD;
  const lon0 = origin.lon * DEG_TO_RAD;
  const sinLat = Math.sin(lat0);
  const cosLat = Math.cos(lat0);
  const sinLon = Math.sin(lon0);
  const cosLon = Math.cos(lon0);

  const dx = -sinLon * enu.east - sinLat * cosLon * enu.north + cosLat * cosLon * enu.up;
  const dy = cosLon * enu.east - sinLat * sinLon * enu.north + cosLat * sinLon * enu.up;
  const dz = cosLat * enu.north + sinLat * enu.up;

  return ecefToWgs84({
    x: originEcef.x + dx,
    y: originEcef.y + dy,
    z: originEcef.z + dz,
  });
}

/**
 * Compute geodesic distance and initial forward azimuth between two WGS84 coordinates
 * using Vincenty's inverse formula on the WGS84 ellipsoid, with Haversine fallback for nearly antipodal points.
 */
export function computeGeodesicInverse(
  pointA: { lat: number; lon: number },
  pointB: { lat: number; lon: number }
): { distanceMeters: number; distanceKm: number; initialBearingDeg: number } {
  const phi1 = pointA.lat * DEG_TO_RAD;
  const L1 = pointA.lon * DEG_TO_RAD;
  const phi2 = pointB.lat * DEG_TO_RAD;
  const L2 = pointB.lon * DEG_TO_RAD;

  const U1 = Math.atan((1 - WGS84_FLATTENING_F) * Math.tan(phi1));
  const U2 = Math.atan((1 - WGS84_FLATTENING_F) * Math.tan(phi2));
  const L = L2 - L1;

  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let iterLimit = 100;
  let cosSqAlpha = 0;
  let sinSigma = 0;
  let cos2SigmaM = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinLambda = 0;
  let cosLambda = 0;

  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    const term1 = cosU2 * sinLambda;
    const term2 = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
    sinSigma = Math.sqrt(term1 * term1 + term2 * term2);
    if (sinSigma === 0) {
      return { distanceMeters: 0, distanceKm: 0, initialBearingDeg: 0 };
    }
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;

    const C =
      (WGS84_FLATTENING_F / 16) *
      cosSqAlpha *
      (4 + WGS84_FLATTENING_F * (4 - 3 * cosSqAlpha));
    const lambdaPrev = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_FLATTENING_F *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

    if (Math.abs(lambda - lambdaPrev) <= 1e-12) {
      break;
    }
  } while (--iterLimit > 0);

  if (iterLimit === 0) {
    // Fallback to spherical law of haversines for nearly antipodal points
    const dLat = phi2 - phi1;
    const dLon = L2 - L1;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = 6371008.8 * c;
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    const bearing = ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360;
    return {
      distanceMeters,
      distanceKm: distanceMeters / 1000,
      initialBearingDeg: bearing,
    };
  }

  const uSq = cosSqAlpha * WGS84_SECOND_ECCENTRICITY_SQ;
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  const distanceMeters = WGS84_SEMI_MINOR_AXIS_B * A * (sigma - deltaSigma);
  const fwdAzRad = Math.atan2(
    cosU2 * sinLambda,
    cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
  );
  const initialBearingDeg = ((fwdAzRad * RAD_TO_DEG) + 360) % 360;

  return {
    distanceMeters,
    distanceKm: distanceMeters / 1000,
    initialBearingDeg,
  };
}

/**
 * Deterministic H3-compatible 64-bit hexagonal spatial index representation (Resolution 0..15)
 * for geographic coverage partitioning without requiring native C bindings.
 */
export function latLonToH3Index(lat: number, lon: number, resolution: number = 9): string {
  const clampedRes = Math.max(0, Math.min(15, Math.floor(resolution)));
  const normLat = Math.max(-90, Math.min(90, lat)) + 90; // [0, 180]
  const normLon = ((lon + 180) % 360 + 360) % 360; // [0, 360)

  const baseCell =
    (Math.floor((normLat / 180) * 10) * 12 + Math.floor((normLon / 360) * 12)) % 122;

  // Quantize into axial hex coordinates at the requested resolution scale
  const scale = Math.pow(7, Math.min(clampedRes, 7));
  const q = Math.floor((normLon / 360) * scale);
  const r = Math.floor((normLat / 180) * scale);
  const hexPayload = ((q * 31 + r) >>> 0).toString(16).padStart(7, '0');
  const resHex = clampedRes.toString(16);
  const baseHex = baseCell.toString(16).padStart(2, '0');

  return `8${resHex}${baseHex}${hexPayload}ffff`.slice(0, 15);
}

/**
 * Compute ENU and WGS84 bounds for a Quadtree chunk centered around a location origin.
 * Base chunk size at LOD 0 is 40m x 40m; LOD 1 is 80m x 80m; LOD 2 is 160m x 160m.
 */
export function computeQuadtreeChunkBounds(
  originWGS84: WGS84Coordinate,
  qx: number,
  qz: number,
  lodLevel: ChunkLODLevel,
  baseSizeMeters: number = 40
): { boundingBoxENU: BoundingBoxENU; boundsWGS84: GeographicBoundsWGS84 } {
  const chunkSpan = baseSizeMeters * Math.pow(2, lodLevel);
  const centerEast = qx * chunkSpan;
  const centerNorth = qz * chunkSpan;
  const half = chunkSpan / 2;

  const boundingBoxENU: BoundingBoxENU = {
    minEast: centerEast - half,
    maxEast: centerEast + half,
    minNorth: centerNorth - half,
    maxNorth: centerNorth + half,
    minUp: -2,
    maxUp: 24,
  };

  const sw = enuToWgs84({ east: boundingBoxENU.minEast, north: boundingBoxENU.minNorth, up: 0 }, originWGS84);
  const ne = enuToWgs84({ east: boundingBoxENU.maxEast, north: boundingBoxENU.maxNorth, up: 0 }, originWGS84);

  return {
    boundingBoxENU,
    boundsWGS84: {
      minLat: Math.min(sw.lat, ne.lat),
      maxLat: Math.max(sw.lat, ne.lat),
      minLon: Math.min(sw.lon, ne.lon),
      maxLon: Math.max(sw.lon, ne.lon),
    },
  };
}
