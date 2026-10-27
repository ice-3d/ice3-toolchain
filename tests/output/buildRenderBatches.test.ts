import { expect, test } from 'node-test';
import { collectNodeWorldMatrices } from '../../packages/toolchain-core/src/scene/nodeMatrices.js';
import { buildRenderBatches } from '../../packages/toolchain-core/src/output/buildRenderBatches.js';
import { createPartitionSource } from '../partition/createPartitionSource.js';

const sourceWithIds = () => {
  const source = createPartitionSource();
  source.json.nodes = (source.json.nodes as Array<Record<string, unknown>>)
    .map((node, index) => ({
      ...node,
      extras: {
        ice3: {
          id: `fixture/node/${index}`,
          selectionId: `fixture/node/${index}`,
        },
      },
    }));
  return source;
};

test('merges selected world-space primitives with the same material', () => {
  const source = sourceWithIds();
  const result = buildRenderBatches(source, [0, 1], {
    mode: 'static',
    maxTrianglesPerBatch: 100,
    maxBytesPerBatch: 1_000_000,
  });

  expect(result.inputPrimitiveCount).toBe(2);
  expect(result.outputBatchCount).toBe(1);
  expect(result.batches[0]!.positions).toHaveLength(18);
  expect(result.batches[0]!.indices).toHaveLength(6);
  expect(result.batches[0]!.semanticIndices).toEqual(
    new Uint32Array([0, 0, 0, 1, 1, 1]),
  );
  expect(result.semanticNodeIds).toEqual([
    'fixture/node/0',
    'fixture/node/1',
  ]);
  expect(result.batches[0]!.bounds.min[0]).toBe(0);
  expect(result.batches[0]!.bounds.max[0]).toBe(11);
  expect(collectNodeWorldMatrices(source)).toHaveLength(4);
});

test('is byte-deterministic and splits by triangle budget', () => {
  const source = sourceWithIds();
  const options = {
    mode: 'static' as const,
    maxTrianglesPerBatch: 1,
    maxBytesPerBatch: 1_000_000,
  };
  const first = buildRenderBatches(source, [0, 1], options);
  const second = buildRenderBatches(source, [0, 1], options);

  expect(first.outputBatchCount).toBe(2);
  expect(first.batches.map((batch) => [...batch.indices])).toEqual(
    second.batches.map((batch) => [...batch.indices]),
  );
  expect(first.batches.map((batch) => [...batch.positions])).toEqual(
    second.batches.map((batch) => [...batch.positions]),
  );
});

test('uses geometry overrides instead of source primitive geometry', () => {
  const source = sourceWithIds();
  const result = buildRenderBatches(source, [0], {
    mode: 'static',
    maxTrianglesPerBatch: 100,
    maxBytesPerBatch: 1_000_000,
    geometryOverrides: new Map([[
      '0:0',
      {
        positions: new Float32Array([
          10, 20, 0,
          30, 20, 0,
          10, 40, 0,
        ]),
        indices: new Uint32Array([0, 1, 2]),
      },
    ]]),
  });

  expect(result.batches).toHaveLength(1);
  expect([...result.batches[0]!.positions]).toEqual([
    10, 20, 0,
    30, 20, 0,
    10, 40, 0,
  ]);
  expect(result.batches[0]!.bounds).toEqual({
    min: [10, 20, 0],
    max: [30, 40, 0],
  });
});

test('uses mesh overrides instead of source mesh geometry', () => {
  const source = sourceWithIds();
  const result = buildRenderBatches(source, [0], {
    mode: 'static',
    maxTrianglesPerBatch: 100,
    maxBytesPerBatch: 1_000_000,
    meshOverrides: new Map([[
      0,
      {
        positions: new Float32Array([
          50, 60, 0,
          70, 60, 0,
          50, 80, 0,
        ]),
        indices: new Uint32Array([0, 1, 2]),
        materialIndex: 0,
      },
    ]]),
  });

  expect(result.batches).toHaveLength(1);
  expect([...result.batches[0]!.positions]).toEqual([
    50, 60, 0,
    70, 60, 0,
    50, 80, 0,
  ]);
  expect(result.batches[0]!.sourceMaterialIndex).toBe(0);
  expect(result.batches[0]!.bounds).toEqual({
    min: [50, 60, 0],
    max: [70, 80, 0],
  });
});

test('groups distinct source materials with identical output states', () => {
  const source = sourceWithIds();
  const materials = source.json.materials as Array<Record<string, unknown>>;
  materials.push({
    name: 'steel-alias',
    pbrMetallicRoughness: {
      baseColorFactor: [0.2, 0.5, 0.9, 1],
    },
  });
  const meshes = source.json.meshes as Array<{
    primitives: Array<Record<string, unknown>>;
  }>;
  meshes[1]!.primitives[0]!.material = 1;

  const result = buildRenderBatches(source, [0, 1], {
    mode: 'static',
    maxTrianglesPerBatch: 100,
    maxBytesPerBatch: 1_000_000,
  });

  expect(result.outputBatchCount).toBe(1);
  expect(result.batches[0]!.sourceMaterialIndex).toBe(0);
});
