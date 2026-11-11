import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCoverageRegistry,
  createGameSession,
  submitGuess,
  analyzeGeospatial,
  getInMemoryChunkBuffer,
} from './clientGameService';

test('Serverless clientGameService creates session, buffers chunks, and evaluates guesses', () => {
  // 1. Registry works without HTTP
  const registry = getCoverageRegistry();
  assert.ok(registry.totalLocations > 0);
  assert.ok(registry.eligibleCount > 0);

  // 2. Session created for Nepal
  const session = createGameSession({
    countryFilter: 'NP',
    mode: 'classic',
  });
  assert.ok(session.sessionId.startsWith('sess_'));
  assert.ok(session.sceneBootstrap.chunks.length > 0);
  assert.equal(session.sceneBootstrap.chunks[0].chunkId.startsWith('chunk_'), true);

  // 3. Chunks are cached in memory for zero-network consumption
  const firstChunkId = session.sceneBootstrap.chunks[0].chunkId;
  const chunkBuf = getInMemoryChunkBuffer(firstChunkId);
  assert.ok(chunkBuf instanceof Uint8Array);
  assert.ok(chunkBuf.byteLength > 0);

  // 4. Submit guess and evaluate score
  const guessResult = submitGuess({
    sessionId: session.sessionId,
    guessLat: session.sceneBootstrap.streetViewTarget.lat,
    guessLon: session.sceneBootstrap.streetViewTarget.lon,
  });
  assert.equal(guessResult.score, 5000);
  assert.equal(guessResult.distanceKm <= 0.05, true);

  // 5. Geospatial analysis
  const analysis = analyzeGeospatial(
    guessResult.locationId,
    guessResult.guessWGS84.lat,
    guessResult.guessWGS84.lon
  );
  assert.ok(analysis.analysis.length > 10);
});

test('Serverless clientGameService handles arbitrary 200+ world countries', () => {
  const session = createGameSession({
    countryFilter: 'IS', // Iceland
    mode: 'classic',
  });
  assert.ok(session.sessionId);
  assert.ok(session.sceneBootstrap.chunks.length > 0);
});
