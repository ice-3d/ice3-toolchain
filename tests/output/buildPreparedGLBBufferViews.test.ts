import { expect, test } from 'node-test';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('writes the standard buffer index on every embedded buffer view', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const built = buildPreparedGLB(source, { assetId: 'buffer-views' });
  const bytes = Buffer.from(built.bytes);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as { bufferViews: Array<{ buffer?: number }> };

  expect(json.bufferViews.length).toBeGreaterThan(0);
  expect(json.bufferViews.every((view) => view.buffer === 0)).toBe(true);
});
