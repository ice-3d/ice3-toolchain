import { expect, test } from 'node-test';
import { partitionAsset } from '../../packages/toolchain-core/src/partition/partitionAsset.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createLodPartitionSource } from './createLodPartitionSource.js';

const readDocument = (bytes: Uint8Array) => {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as {
    nodes: Array<{
      extras: {
        ice3: {
          id: string;
          selectionId?: string;
        };
      };
    }>;
  };
};

test('generates coarse and fine content in one hierarchical result', async () => {
  const result = await partitionAsset(createLodPartitionSource(), {
    assetId: 'lod-demo',
    maxTriangles: 16,
    lod: {
      ratio: 0.15,
      maxTrianglesPerProxy: 64,
      minTrianglesPerUnit: 8,
    },
  });
  const coarse = result.files.filter((file) => file.path.startsWith('coarse/'));

  expect(coarse.length).toBeGreaterThan(0);
  expect(result.stats.coarseTriangleCount).toBeGreaterThan(0);
  expect(result.stats.maxCoarseBytes).toBeGreaterThan(0);
  expect(result.tileset.root).toMatchObject({
    content: { uri: expect.stringMatching(/^coarse\//) },
    geometricError: expect.any(Number),
    children: expect.any(Array),
  });
  expect(coarse.every((file) => (
    validatePreparedGLB(file.bytes).errors.length === 0
  ))).toBe(true);
  const rootCoarse = coarse.find((file) => (
    file.path === 'coarse/group-root.glb'
  ))!;
  const nodes = readDocument(rootCoarse.bytes).nodes;
  expect(nodes.length).toBe(4);
  expect(nodes.every((node) => (
    node.extras.ice3.selectionId?.startsWith('lod-demo/node/')
  ))).toBe(true);
  expect(nodes.every((node) => (
    node.extras.ice3.id.startsWith('lod-demo:lod:group-root/node/')
  ))).toBe(true);
});

test('reports a coarse proxy that exceeds its target after simplification', async () => {
  const result = await partitionAsset(createLodPartitionSource(), {
    assetId: 'lod-demo',
    maxTriangles: 8,
    lod: {
      ratio: 0.15,
      maxTrianglesPerProxy: 16,
      minTrianglesPerUnit: 1,
    },
  });

  expect(result.stats.overBudgetCoarseNodes).toBeGreaterThan(0);
});

test('splits oversized internal content into standard chunks', async () => {
  const result = await partitionAsset(createLodPartitionSource(), {
    assetId: 'lod-demo',
    maxTriangles: 8,
    lod: {
      ratio: 0.15,
      maxTrianglesPerProxy: 64,
      minTrianglesPerUnit: 1,
      coarseChunkMaxBytes: 5000,
    },
  });
  const root = result.tileset.root as {
    contents?: Array<{ uri: string }>;
    content?: unknown;
  };

  expect(root.content).toBeUndefined();
  expect(root.contents?.length).toBeGreaterThan(1);
  expect(result.stats.coarseContentCount).toBeGreaterThan(1);
  expect(result.stats.maxCoarseChunkBytes).toBeLessThanOrEqual(5000);
});
