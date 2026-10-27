import { expect, test } from 'node-test';
import {
  ICE_ASSET_CONTRACT_VERSION,
  contractStats,
} from '../../packages/toolchain-core/src/output/assetContract';

test('exposes only the stable runtime stats subset', () => {
  expect(ICE_ASSET_CONTRACT_VERSION).toBe('1.0');
  expect(contractStats({
    encodedBytes: 400,
    jsonChunkBytes: 100,
    binChunkBytes: 300,
    nodeCount: 4,
    maxNodeDepth: 2,
    meshCount: 3,
    primitiveCount: 6,
    triangleCount: 12,
    edgeSegmentCount: 18,
    materialCount: 2,
    selectionGroupCount: 3,
  })).toEqual({
    nodeCount: 4,
    maxNodeDepth: 2,
    meshCount: 3,
    primitiveCount: 6,
    triangleCount: 12,
    edgeSegmentCount: 18,
    materialCount: 2,
    selectionGroupCount: 3,
  });
});
