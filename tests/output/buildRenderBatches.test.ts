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
