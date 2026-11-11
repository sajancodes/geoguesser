import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wgs84ToEcef,
  ecefToWgs84,
  wgs84ToEnu,
  enuToWgs84,
  computeGeodesicInverse,
  latLonToH3Index,
  computeQuadtreeChunkBounds,
} from './coordinates';

test('WGS84 <-> ECEF round-trip preserves geodetic coordinates within 1mm', () => {
  const kyoto = { lat: 34.9985, lon: 135.7811, elevation: 68.4 };
  const ecef = wgs84ToEcef(kyoto);
  const roundTrip = ecefToWgs84(ecef);

  assert.ok(Math.abs(roundTrip.lat - kyoto.lat) < 1e-8);
  assert.ok(Math.abs(roundTrip.lon - kyoto.lon) < 1e-8);
  assert.ok(Math.abs(roundTrip.elevation - kyoto.elevation) < 1e-3);
});

test('WGS84 <-> Local ENU round-trip preserves local street offsets accurately', () => {
  const origin = { lat: 64.1466, lon: -21.9426, elevation: 14.0 };
  const localTarget = { east: 42.5, north: -18.75, up: 3.2 };

  const targetWgs = enuToWgs84(localTarget, origin);
  const recoveredEnu = wgs84ToEnu(targetWgs, origin);

  assert.ok(Math.abs(recoveredEnu.east - localTarget.east) < 1e-3);
  assert.ok(Math.abs(recoveredEnu.north - localTarget.north) < 1e-3);
  assert.ok(Math.abs(recoveredEnu.up - localTarget.up) < 1e-3);
});

test('Vincenty geodesic inverse matches reference ellipsoid distances', () => {
  // London (51.5007, -0.1246) to Paris (48.8584, 2.2945) ~ 340.55 km
  const res = computeGeodesicInverse(
    { lat: 51.5007, lon: -0.1246 },
    { lat: 48.8584, lon: 2.2945 }
  );
  assert.ok(res.distanceKm > 338 && res.distanceKm < 344);
  assert.ok(res.initialBearingDeg > 140 && res.initialBearingDeg < 155);

  // Zero distance check
  const same = computeGeodesicInverse(
    { lat: 34.9985, lon: 135.7811 },
    { lat: 34.9985, lon: 135.7811 }
  );
  assert.equal(same.distanceMeters, 0);
});

test('H3 index and Quadtree chunk bounds produce deterministic spatial descriptors', () => {
  const h3A = latLonToH3Index(34.9985, 135.7811, 9);
  const h3B = latLonToH3Index(34.9985, 135.7811, 9);
  assert.equal(h3A, h3B);
  assert.equal(h3A.length, 15);

  const bounds = computeQuadtreeChunkBounds(
    { lat: 34.9985, lon: 135.7811, elevation: 68 },
    0,
    0,
    0,
    40
  );
  assert.equal(bounds.boundingBoxENU.minEast, -20);
  assert.equal(bounds.boundingBoxENU.maxEast, 20);
  assert.ok(bounds.boundsWGS84.maxLat > bounds.boundsWGS84.minLat);
});
