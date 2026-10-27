import { expect, test } from 'node-test';
import { simplifyGeometry } from '../../packages/toolchain-core/src/lod/simplifyGeometry.js';

const grid = (cells = 8) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= cells; y += 1) {
    for (let x = 0; x <= cells; x += 1) {
      positions.push(x / cells, y / cells, 0);
    }
  }
  const stride = cells + 1;
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
};

test('reduces triangles and returns a deterministic finite error', async () => {
  const input = grid();
  const first = await simplifyGeometry(
    input.positions,
    input.indices,
    { targetTriangles: 32, minimumTriangles: 8 },
  );
  const second = await simplifyGeometry(
    input.positions,
    input.indices,
    { targetTriangles: 32, minimumTriangles: 8 },
  );

  expect(first.triangleCount).toBeLessThan(first.sourceTriangles);
  expect(first.triangleCount).toBeGreaterThanOrEqual(8);
  expect(first.indices.length % 3).toBe(0);
  expect(Number.isFinite(first.errorMeters)).toBe(true);
  expect(first.errorMeters).toBeGreaterThanOrEqual(0);
  expect([...second.indices]).toEqual([...first.indices]);
  expect(second.errorMeters).toBe(first.errorMeters);
});

test('preserves already-minimal geometry', async () => {
  const result = await simplifyGeometry(
    new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]),
    new Uint32Array([0, 1, 2]),
    { targetTriangles: 8, minimumTriangles: 8 },
  );

  expect(result.preservedSource).toBe(true);
  expect(result.triangleCount).toBe(1);
});
