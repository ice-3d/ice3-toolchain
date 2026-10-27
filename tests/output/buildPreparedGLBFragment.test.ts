import { expect, test } from 'node-test';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createPartitionSource } from '../partition/createPartitionSource.js';

const readJson = (bytes: Uint8Array): Record<string, unknown> => {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as Record<string, unknown>;
};

test('builds one selected node with a baked world transform and stable ID', () => {
  const built = buildPreparedGLB(createPartitionSource(), {
    assetId: 'partition-demo',
    selection: {
      nodeIndices: [2],
      flattenWorldTransforms: true,
    },
  });
  const json = readJson(built.bytes);
  const nodes = json.nodes as Array<Record<string, unknown>>;
  const extras = nodes[0]!.extras as { ice3: { id: string } };

  expect(validatePreparedGLB(built.bytes).errors).toEqual([]);
  expect(built.stats.nodeCount).toBe(1);
  expect(built.stats.triangleCount).toBe(1);
  expect(extras.ice3.id).toBe('partition-demo/node/2');
  expect(nodes[0]!.matrix).toEqual([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    20, 0, 0, 1,
  ]);
  expect(json.scenes).toEqual([{ nodes: [0] }]);
});
