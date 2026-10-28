import { test } from 'node:test';
import { expect } from '#test-expect';
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

test('welds duplicated vertices before simplification', async () => {
  const source = grid();
  const positions: number[] = [];
  const indices: number[] = [];
  for (let triangle = 0; triangle < source.indices.length; triangle += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const sourceIndex = source.indices[triangle + corner]!;
      positions.push(
        source.positions[sourceIndex * 3]!,
        source.positions[sourceIndex * 3 + 1]!,
        source.positions[sourceIndex * 3 + 2]!,
      );
      indices.push(indices.length);
    }
  }

  const result = await simplifyGeometry(
    new Float32Array(positions),
    new Uint32Array(indices),
    { targetTriangles: 32, minimumTriangles: 8 },
  );

  expect(result.sourceTriangles).toBe(128);
  expect(result.triangleCount).toBeLessThan(128);
  expect(result.triangleCount).toBeGreaterThanOrEqual(8);
});

test('simplifies colored triangle soup while preserving vertex colors', async () => {
  const source = grid();
  const positions: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  for (let triangle = 0; triangle < source.indices.length; triangle += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const sourceIndex = source.indices[triangle + corner]!;
      positions.push(
        source.positions[sourceIndex * 3]!,
        source.positions[sourceIndex * 3 + 1]!,
        source.positions[sourceIndex * 3 + 2]!,
      );
      colors.push(
        source.positions[sourceIndex * 3]!,
        0.5,
        source.positions[sourceIndex * 3 + 1]!,
      );
      indices.push(indices.length);
    }
  }

  const result = await simplifyGeometry(
    new Float32Array(positions),
    new Uint32Array(indices),
    {
      targetTriangles: 32,
      minimumTriangles: 8,
      vertexColors: new Float32Array(colors),
    },
  );

  expect(result.triangleCount).toBeLessThan(128);
  expect(result.colors).toHaveLength(result.positions.length);
  expect(result.colors?.every((value) => Number.isFinite(value))).toBe(true);
});
