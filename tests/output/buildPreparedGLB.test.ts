import { expect, test } from 'node-test';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';

test('builds byte-identical prepared GLB output', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const first = buildPreparedGLB(source, { assetId: 'sample' });
  const second = buildPreparedGLB(source, { assetId: 'sample' });

  expect(first.bytes).toEqual(second.bytes);
  expect(first.stats).toEqual({
    nodeCount: 1,
    meshCount: 1,
    triangleCount: 1,
    edgeSegmentCount: 3,
  });
});

test('writes an ICE3 profile header and one BIN chunk', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const glb = buildPreparedGLB(source, { assetId: 'sample' }).bytes;

  expect(Buffer.from(glb).readUInt32LE(0)).toBe(0x46546c67);
  expect(Buffer.from(glb).readUInt32LE(4)).toBe(2);
  expect(Buffer.from(glb).readUInt32LE(8)).toBe(glb.byteLength);
  expect(Buffer.from(glb).toString('utf8')).toContain('ice3-prepared');
  expect(Buffer.from(glb).toString('utf8')).toContain('sample');
});

test('rejects unsupported source features before packing', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  (source.json as Record<string, unknown>).animations = [{}];

  expect(() => buildPreparedGLB(source, { assetId: 'sample' })).toThrow(
    /ICE3_TOOL_SOURCE_UNSUPPORTED/,
  );
});

test('can omit generated edges for large-model preview', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const built = buildPreparedGLB(source, {
    assetId: 'sample',
    edges: false,
  });

  expect(built.stats.edgeSegmentCount).toBe(0);
  const bytes = Buffer.from(built.bytes);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd(),
  ) as { meshes: { primitives: unknown[] }[] };
  expect(json.meshes[0]!.primitives).toHaveLength(1);
});
