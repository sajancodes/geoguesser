import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeSplatBinaryBuffer,
  generateChunkSplatBinaryBuffer,
  SPLAT_RECORD_BYTE_STRIDE,
} from './splatBinary';
import { COVERAGE_DATABASE, buildQuadtreeChunksForLocation } from '../coverage/coverageDatabase';

test('generateChunkSplatBinaryBuffer produces valid 32-byte Gaussian Splat records', () => {
  const kyoto = COVERAGE_DATABASE[0];
  const chunks = buildQuadtreeChunksForLocation(kyoto);
  const lod0Chunk = chunks.find((c) => c.lodLevel === 0)!;

  const bytes = generateChunkSplatBinaryBuffer(kyoto, lod0Chunk);
  assert.equal(bytes.byteLength, lod0Chunk.assetManifest.splatCount * SPLAT_RECORD_BYTE_STRIDE);

  const decoded = decodeSplatBinaryBuffer(bytes);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.format, 'splat-32b');
  assert.ok(decoded.cloud);
  assert.equal(decoded.cloud.splatCount, lod0Chunk.assetManifest.splatCount);
});

test('decodeSplatBinaryBuffer rejects malformed byte lengths and parses valid ASCII PLY', () => {
  const badBytes = new Uint8Array(17);
  const badRes = decodeSplatBinaryBuffer(badBytes);
  assert.equal(badRes.valid, false);
  assert.ok(badRes.error?.includes('multiple of 32'));

  const samplePly = [
    'ply',
    'format ascii 1.0',
    'element vertex 2',
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '1.5 2.0 -3.5 200 150 100',
    '-2.0 0.5 4.0 120 180 210',
  ].join('\n');

  const plyBytes = new TextEncoder().encode(samplePly);
  const plyRes = decodeSplatBinaryBuffer(plyBytes);
  assert.equal(plyRes.valid, true);
  assert.equal(plyRes.format, 'ply-ascii');
  assert.equal(plyRes.cloud?.splatCount, 2);
});
