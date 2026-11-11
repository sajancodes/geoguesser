import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BoundedChunkCache,
  classifyChunkPriority,
  computeChunkScreenSpaceError,
  selectDesiredLODForDistance,
} from './chunkCache';
import { COVERAGE_DATABASE, buildQuadtreeChunksForLocation } from '../coverage/coverageDatabase';

test('BoundedChunkCache evicts lower-priority LRU entries when budget is exceeded and calls dispose', () => {
  const disposedIds: string[] = [];
  const cache = new BoundedChunkCache<{ id: string }>(2 * 1024 * 1024); // 2 MB budget

  cache.put(
    {
      chunkId: 'chunk-p3',
      assetVersion: '1.0',
      byteLength: 900 * 1024,
      priority: 'P3',
      resource: { id: 'chunk-p3' },
      dispose: () => disposedIds.push('chunk-p3'),
    },
    new Set(),
    1000
  );

  cache.put(
    {
      chunkId: 'chunk-p0',
      assetVersion: '1.0',
      byteLength: 900 * 1024,
      priority: 'P0',
      resource: { id: 'chunk-p0' },
      dispose: () => disposedIds.push('chunk-p0'),
    },
    new Set(['chunk-p0']),
    1005
  );

  // Adding a third 900 KB chunk exceeds 2 MB -> should evict 'chunk-p3' (P3 < P0)
  cache.put(
    {
      chunkId: 'chunk-p1',
      assetVersion: '1.0',
      byteLength: 900 * 1024,
      priority: 'P1',
      resource: { id: 'chunk-p1' },
      dispose: () => disposedIds.push('chunk-p1'),
    },
    new Set(['chunk-p0']),
    1010
  );

  assert.equal(cache.has('chunk-p3', '1.0'), false);
  assert.equal(cache.has('chunk-p0', '1.0'), true);
  assert.equal(cache.has('chunk-p1', '1.0'), true);
  assert.deepEqual(disposedIds, ['chunk-p3']);
  assert.equal(cache.getEvictedCount(), 1);
});

test('classifyChunkPriority assigns P0 to player chunk and P2 to movement-direction chunks', () => {
  const kyoto = COVERAGE_DATABASE[0];
  const chunks = buildQuadtreeChunksForLocation(kyoto);
  const centerLod0 = chunks.find((c) => c.lodLevel === 0 && c.qx === 0 && c.qz === 0)!;
  const northLod0 = chunks.find((c) => c.lodLevel === 0 && c.qx === 0 && c.qz === 1)!;

  const p0Class = classifyChunkPriority(
    centerLod0,
    { east: 0, north: 0, up: 0 },
    { east: 0, north: 1 },
    { east: 0, north: 4 }
  );
  assert.equal(p0Class.priority, 'P0');

  const northClass = classifyChunkPriority(
    northLod0,
    { east: 0, north: -15, up: 0 },
    { east: 1, north: 0 }, // looking East, moving North
    { east: 0, north: 5 }
  );
  assert.equal(northClass.priority, 'P2');

  const sseNear = computeChunkScreenSpaceError(0, 10, 900, 70);
  const sseFar = computeChunkScreenSpaceError(0, 100, 900, 70);
  assert.ok(sseNear > sseFar);
  assert.equal(selectDesiredLODForDistance(20, 120), 0);
  assert.equal(selectDesiredLODForDistance(70, 120), 1);
  assert.equal(selectDesiredLODForDistance(110, 120), 2);
  assert.equal(selectDesiredLODForDistance(150, 120), null);
});
