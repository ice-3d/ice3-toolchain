import { expect, test } from 'node-test';
import { createHash } from 'node:crypto';
import { partitionAsset } from '../../packages/toolchain-core/src/partition/partitionAsset.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createAdaptiveLodPartitionSource } from './createAdaptiveLodSource.js';
import { createLodPartitionSource } from './createLodPartitionSource.js';

const readDocument = (bytes: Uint8Array) => {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as {
    asset: {
      extras: {
        ice3: {
          stats: {
            triangleCount: number;
          };
        };
      };
    };
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

test('uses conservative collapse to reach a strict coarse target', async () => {
  const result = await partitionAsset(createLodPartitionSource(), {
    assetId: 'lod-demo',
    maxTriangles: 8,
    lod: {
      ratio: 0.15,
      maxTrianglesPerProxy: 16,
      minTrianglesPerUnit: 1,
    },
  });

  expect(result.stats.overBudgetCoarseNodes).toBe(0);
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

test('uses different simplification rates for heterogeneous units', async () => {
  const result = await partitionAsset(createAdaptiveLodPartitionSource(), {
    assetId: 'adaptive-demo',
    maxTriangles: 64,
    lod: {
      allocation: 'adaptive',
      curveSamples: 6,
      ratio: 0.15,
      maxTrianglesPerProxy: 48,
      minTrianglesPerUnit: 4,
    },
  });

  expect(result.stats.allocationMode).toBe('adaptive');
  expect(result.stats.adaptiveUnitCount).toBeGreaterThan(0);
  expect(result.stats.maximumErrorMeters).toBeGreaterThan(0);
  expect(result.stats.overBudgetCoarseNodes).toBe(0);
  expect(result.files
    .filter((file) => file.path.startsWith('coarse/'))
    .every((file) => validatePreparedGLB(file.bytes).errors.length === 0))
    .toBe(true);
  const root = result.files.find(
    (file) => file.path === 'coarse/group-root.glb',
  )!;
  const nodes = readDocument(root.bytes).nodes;
  expect(nodes.every((node) => (
    node.extras.ice3.selectionId?.startsWith('adaptive-demo/node/')
  ))).toBe(true);
});

test('keeps proportional lod output byte-for-byte stable', async () => {
  const proportional = await partitionAsset(createLodPartitionSource(), {
    assetId: 'lod-demo',
    maxTriangles: 16,
    lod: {
      allocation: 'proportional',
      ratio: 0.15,
      maxTrianglesPerProxy: 64,
      minTrianglesPerUnit: 8,
    },
  });

  expect(proportional.files.map((file) => [
    file.path,
    file.bytes.byteLength,
    createHash('sha256').update(file.bytes).digest('hex'),
  ])).toEqual([
    ['coarse/group-root.glb', 6104,
      '44e6ecdd495068d90fdf2fb2deac6c029f1a2dc8c3d192431840375285df04dc'],
    ['coarse/group-root-0.glb', 4176,
      '645a87d54d4337f74dd1ea0b102962b9cb30fbd17802809e2c257000e3daa578'],
    ['parts/part-000.glb', 3396,
      '617a8d835d4e343649357842bd23a5ef24ac812947785a832ec55f572ea892fb'],
    ['parts/part-001.glb', 3400,
      'e8287b5683d161e023ea21a79b914fe91d2ba59a439a02e92a20ed5ac4ece7b5'],
    ['coarse/group-root-1.glb', 4180,
      'bc08f9361c72f8fbadb25bed9d9c2c40e7abb139404503cdb78f975aedb676e5'],
    ['parts/part-002.glb', 3400,
      '40bc30309ff6e07522e0731b50e2a4151bf99e0d132f1de8bdae00c4f1c5450b'],
    ['parts/part-003.glb', 3400,
      '1e7bd06bb7e9796e2a0ecb39c93bb19f0d8c14f2df66075f011fbfe0028f4f9a'],
  ]);
});

test('uses the proportional node budget as the adaptive ceiling', async () => {
  const result = await partitionAsset(createAdaptiveLodPartitionSource(), {
    assetId: 'adaptive-budget-demo',
    maxTriangles: 64,
    lod: {
      allocation: 'adaptive',
      curveSamples: 6,
      ratio: 0.15,
      maxTrianglesPerProxy: 1000,
      minTrianglesPerUnit: 4,
    },
  });
  const root = result.files.find(
    (file) => file.path === 'coarse/group-root.glb',
  )!;
  const document = readDocument(root.bytes);

  expect(document.asset.extras.ice3.stats.triangleCount).toBeLessThanOrEqual(
    Math.floor(128 * 0.15) + Math.floor(128 * 0.15),
  );
});

test('allocates semantic proxy meshes in adaptive lod', async () => {
  const source = createAdaptiveLodPartitionSource();
  const binary = source.buffers[0]!;
  const bufferViews = source.json.bufferViews as Array<Record<string, unknown>>;
  const accessors = source.json.accessors as Array<Record<string, unknown>>;
  const positions = new Float32Array(
    binary.buffer,
    binary.byteOffset,
    Number(accessors[0]!.count) * 3,
  );
  const corners = [
    [-3, -1, -0.5],
    [3, -1, -0.5],
    [-3, 1, -0.5],
    [3, 1, -0.5],
    [-3, -1, 0.5],
    [3, -1, 0.5],
    [-3, 1, 0.5],
    [3, 1, 0.5],
  ] as const;
  for (let index = 0; index < positions.length / 3; index += 1) {
    positions.set(corners[index % 8]!, index * 3);
  }
  const indexOffset = Number(bufferViews[2]!.byteOffset);
  const indices = new Uint16Array(
    binary.buffer,
    binary.byteOffset + indexOffset,
    Number(accessors[2]!.count),
  );
  const boxIndices = new Uint16Array([
    0, 2, 1, 1, 2, 3,
    4, 5, 6, 5, 7, 6,
    0, 1, 4, 1, 5, 4,
    2, 6, 3, 3, 6, 7,
    0, 4, 2, 2, 4, 6,
    1, 3, 5, 3, 7, 5,
  ]);
  for (let triangle = 0; triangle < indices.length / 3; triangle += 1) {
    indices.set(
      boxIndices.subarray(triangle % 12 * 3, triangle % 12 * 3 + 3),
      triangle * 3,
    );
  }
  accessors[0]!.min = [-3, -1, -0.5];
  accessors[0]!.max = [3, 1, 0.5];

  const result = await partitionAsset(source, {
    assetId: 'semantic-proxy-demo',
    maxTriangles: 64,
    lod: {
      allocation: 'adaptive',
      semanticProxy: 'auto',
      curveSamples: 6,
      ratio: 0.8,
      maxTrianglesPerProxy: 1024,
      minTrianglesPerUnit: 4,
    },
  });
  expect(result.stats.semanticProxyAcceptedUnits).toBeGreaterThan(0);
  expect(result.stats.semanticProxySelectedContents).toBeGreaterThan(0);
  expect(result.stats.semanticProxyObbUnits).toBeGreaterThan(0);
  expect(result.stats.overBudgetCoarseNodes).toBe(0);
  const root = result.files.find(
    (file) => file.path === 'coarse/group-root.glb',
  )!;
  const nodes = readDocument(root.bytes).nodes;
  expect(nodes.every((node) => (
    node.extras.ice3.selectionId?.startsWith('semantic-proxy-demo/node/')
  ))).toBe(true);
});
