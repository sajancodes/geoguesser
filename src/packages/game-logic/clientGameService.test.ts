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

test('Serverless clientGameService handles arbitrary 200+ world countries and stays in Nepal on Next Place', () => {
  const session = createGameSession({
    countryFilter: 'IS', // Iceland
    mode: 'classic',
  });
  assert.ok(session.sessionId);
  assert.ok(session.sceneBootstrap.chunks.length > 0);

  // Verify multiple consecutive Next Place sessions in Nepal stay inside Nepal
  const recentIds: string[] = [];
  for (let place = 1; place <= 6; place++) {
    const nepalSession = createGameSession({
      countryFilter: 'NP',
      mode: 'classic',
      roundNumber: place,
      totalRounds: Math.max(5, place),
      recentLocationIds: recentIds,
    });
    const res = submitGuess({
      sessionId: nepalSession.sessionId,
      guessLat: 28.21,
      guessLon: 83.95,
    });
    assert.equal(res.countryName, 'Nepal');
    assert.equal(recentIds.includes(res.locationId), false);
    recentIds.push(res.locationId);
  }

  // Verify consecutive brand-new sessions (recentLocationIds: []) have 0% repeat rate
  const coordSet = new Set<string>();
  let repeats = 0;
  const totalSamples = 15;
  for (let s = 0; s < totalSamples; s++) {
    const newSession = createGameSession({
      countryFilter: 'NP',
      mode: 'classic',
      roundNumber: 1,
      recentLocationIds: [], // Simulate a brand-new session every time!
    });
    const target = newSession.sceneBootstrap.streetViewTarget;
    const key = `${target.lat.toFixed(4)},${target.lon.toFixed(4)}`;
    if (coordSet.has(key)) {
      repeats++;
    }
    coordSet.add(key);
  }
  assert.equal(repeats, 0);
});
