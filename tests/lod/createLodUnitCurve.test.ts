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
  const geometry = await workspace.read(
    curve.samples.at(-1)!.primitives[0]!.geometryKey,
  );
  expect(geometry.colors?.length).toBe(16);
  for (const sample of curve.samples) {
    for (const primitive of sample.primitives) {
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
