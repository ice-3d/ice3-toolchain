import { expect, test } from 'node-test';
import { partitionAsset } from '../../packages/toolchain-core/src/partition/partitionAsset.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createPartitionSource } from './createPartitionSource.js';

test('writes independent GLBs and a tileset that conserve source triangles', () => {
  const result = partitionAsset(createPartitionSource(), {
    assetId: 'partition-demo',
    maxTriangles: 1,
  });
  const glbs = result.files.filter((file) => file.path.endsWith('.glb'));

  expect(result.partitionCount).toBe(4);
  expect(glbs).toHaveLength(4);
  expect(result.stats.triangleCount).toBe(4);
  expect(glbs.every((file) => validatePreparedGLB(file.bytes).errors.length === 0))
    .toBe(true);
});

test('reports an indivisible node that exceeds the byte limit', () => {
  expect(() => partitionAsset(createPartitionSource(), {
    assetId: 'partition-demo',
    maxBytes: 1,
  })).toThrow(/ICE3_TOOL_PARTITION_UNSPLITTABLE/);
});

test('does not split nodes that share one mesh', () => {
  const result = partitionAsset(createPartitionSource(true), {
    assetId: 'partition-demo',
    maxTriangles: 1,
  });

  expect(result.partitionCount).toBe(1);
  expect(result.stats.triangleCount).toBe(1);
});

test('produces byte-identical files and Tileset for identical inputs', () => {
  const source = createPartitionSource();
  const first = partitionAsset(source, {
    assetId: 'partition-demo',
    maxTriangles: 2,
  });
  const second = partitionAsset(source, {
    assetId: 'partition-demo',
    maxTriangles: 2,
  });

  expect(second.files.map((file) => [file.path, [...file.bytes]])).toEqual(
    first.files.map((file) => [file.path, [...file.bytes]]),
  );
  expect(second.tileset).toEqual(first.tileset);
});
