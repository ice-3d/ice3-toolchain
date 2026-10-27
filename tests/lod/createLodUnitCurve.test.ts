import { expect, test } from 'node-test';
import { createGeometryWorkspace } from '../../packages/toolchain-core/src/lod/createGeometryWorkspace.js';
import { createLodUnitCurve } from '../../packages/toolchain-core/src/lod/createLodUnitCurve.js';

test('creates monotonic samples and retains sampled vertex colors', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  await workspace.write('0:0', {
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    colors: new Float32Array([
      1, 0, 0, 1,
      0, 1, 0, 1,
      0, 0, 1, 1,
      1, 1, 1, 1,
    ]),
  });

  const curve = await createLodUnitCurve({
    unitId: 'unit-0',
    sourceTriangles: 2,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 2,
    }],
    workspace,
    minimumTriangles: 1,
    sampleCount: 4,
    worldScale: 1,
  });

  expect(curve.samples.map((sample) => sample.actualTriangles))
    .toEqual([...curve.samples]
      .map((sample) => sample.actualTriangles)
      .sort((left, right) => left - right));
  expect(curve.samples.at(-1)!.actualTriangles).toBe(2);
  const last = curve.samples.at(-1)!.replacement;
  expect(last.kind).toBe('primitives');
  const geometry = await workspace.read(
    last.kind === 'primitives' ? last.primitives[0]!.geometryKey : '',
  );
  expect(geometry.colors?.length).toBe(16);
  for (const sample of curve.samples) {
    if (sample.replacement.kind !== 'primitives') continue;
    for (const primitive of sample.replacement.primitives) {
      const sampled = await workspace.read(primitive.geometryKey);
      if (!sampled.colors) continue;
      expect([3, 4]).toContain(
        sampled.colors.length / (sampled.positions.length / 3),
      );
      expect(sampled.colors.every(Number.isFinite)).toBe(true);
    }
  }
  await workspace.dispose();
});
