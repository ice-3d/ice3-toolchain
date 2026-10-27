import { expect, test } from 'node-test';
import { createGeometryWorkspace } from '../../../packages/toolchain-core/src/lod/createGeometryWorkspace.js';
import { createSemanticProxy } from '../../../packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.js';

const box = (scale = 2, triangles = 128) => {
  const halfX = scale * 5;
  const halfY = scale / 2;
  const halfZ = scale / 4;
  const positions = new Float32Array([
    -halfX, -halfY, -halfZ,
    halfX, -halfY, -halfZ,
    -halfX, halfY, -halfZ,
    halfX, halfY, -halfZ,
    -halfX, -halfY, halfZ,
    halfX, -halfY, halfZ,
    -halfX, halfY, halfZ,
    halfX, halfY, halfZ,
  ]);
  const boxTriangles = new Uint32Array([
    0, 2, 1, 1, 2, 3,
    4, 5, 6, 5, 7, 6,
    0, 1, 4, 1, 5, 4,
    2, 6, 3, 3, 6, 7,
    0, 4, 2, 2, 4, 6,
    1, 3, 5, 3, 7, 5,
  ]);
  const indices = new Uint32Array(triangles * 3);
  for (let index = 0; index < triangles; index += 1) {
    indices.set(
      boxTriangles.subarray(index % 12 * 3, index % 12 * 3 + 3),
      index * 3,
    );
  }
  return { positions, indices };
};

const symmetricBox = (scale = 1, cells = 3) => {
  const half = [scale * 2, scale, scale / 2] as const;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [-1, 1]) {
      const start = positions.length / 3;
      const first = (axis + 1) % 3;
      const second = (axis + 2) % 3;
      const point = (a: number, b: number) => {
        const value: [number, number, number] = [0, 0, 0];
        value[axis] = half[axis]! * side;
        value[first] = -half[first]! + 2 * half[first]! * a / cells;
        value[second] = -half[second]! + 2 * half[second]! * b / cells;
        positions.push(...value);
      };
      for (let b = 0; b <= cells; b += 1) {
        for (let a = 0; a <= cells; a += 1) point(a, b);
      }
      const stride = cells + 1;
      for (let b = 0; b < cells; b += 1) {
        for (let a = 0; a < cells; a += 1) {
          const p = start + b * stride + a;
          const q = p + 1;
          const r = p + stride;
          const s = r + 1;
          indices.push(p, q, r, q, s, r);
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    triangleCount: indices.length / 3,
    vertexCount: positions.length / 3,
  };
};

test('accepts a compact high-reduction proxy', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  const source = symmetricBox();
  await workspace.write('0:0', source);
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: source.triangleCount,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: source.triangleCount,
      materialIndex: 3,
    }],
    workspace,
    worldScale: 2,
  });
  expect(result.proxy).toMatchObject({
    kind: expect.stringMatching(/obb|cylinder/),
    materialIndex: 3,
    errorMeters: expect.any(Number),
  });
  expect(result.proxy!.triangleCount).toBeLessThanOrEqual(16);
  await workspace.dispose();
});

test('falls back when triangle savings are insufficient', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  await workspace.write('0:0', box());
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 64,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 64,
    }],
    workspace,
    worldScale: 1,
  });

  expect(result.proxy).toBeUndefined();
  expect(result.rejectionReason).toBeDefined();
  await workspace.dispose();
});

test('scales proxy error by the maximum node world scale', async () => {
  const create = async (worldScale: number) => {
    const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
    const source = symmetricBox();
    await workspace.write('0:0', source);
    const result = await createSemanticProxy({
      meshIndex: 0,
      sourceTriangles: source.triangleCount,
      primitives: [{
        sourceKey: '0:0',
        workspaceKey: '0:0',
        triangleCount: source.triangleCount,
      }],
      workspace,
      worldScale,
    });
    await workspace.dispose();
    return result.proxy!;
  };
  const single = await create(1);
  const scaled = await create(4);

  expect(scaled.errorMeters).toBeCloseTo(single.errorMeters * 4, 8);
});

test('falls back to the smallest material when colors are incomplete', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  const first = symmetricBox();
  const second = symmetricBox();
  const colored = {
    ...first,
    colors: new Float32Array(Array.from({ length: first.vertexCount * 4 }, (_value, index) => (
      index % 4 === 3 ? 1 : 0.5
    ))),
  };
  await workspace.write('0:0', colored);
  await workspace.write('0:1', second);
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: first.triangleCount + second.triangleCount,
    primitives: [
      {
        sourceKey: '0:0',
        workspaceKey: '0:0',
        triangleCount: first.triangleCount,
        materialIndex: 2,
      },
      {
        sourceKey: '0:1',
        workspaceKey: '0:1',
        triangleCount: second.triangleCount,
        materialIndex: 1,
      },
    ],
    workspace,
    worldScale: 1,
  });

  expect(result.proxy?.colors).toBeUndefined();
  expect(result.proxy?.materialIndex).toBe(1);
  await workspace.dispose();
});

test('rejects zero-volume fit bounds without producing NaN', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1024 });
  const indices = new Uint32Array(96 * 3);
  for (let triangle = 0; triangle < 96; triangle += 1) {
    indices.set([0, 1, 2], triangle * 3);
  }
  await workspace.write('0:0', {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices,
  });
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 96,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 96,
    }],
    workspace,
    worldScale: 1,
  });

  expect(result.proxy).toBeUndefined();
  expect(result.rejectionReason).toMatch(/volume|degenerate|covariance|shape/);
  await workspace.dispose();
});

test('rejects devices below the proxy triangle floor', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1024 });
  await workspace.write('0:0', box(2, 63));
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 63,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 63,
    }],
    workspace,
    worldScale: 1,
  });

  expect(result).toEqual({ rejectionReason: 'too_few_triangles' });
  await workspace.dispose();
});

test('retains an averaged color when every primitive has vertex colors', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1024 });
  const source = symmetricBox();
  await workspace.write('0:0', {
    ...source,
    colors: new Float32Array(Array.from({ length: source.vertexCount * 4 }, (_value, index) => (
      index % 4 === 0 ? 0.25 : index % 4 === 3 ? 1 : 0.5
    ))),
  });
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: source.triangleCount,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: source.triangleCount,
      materialIndex: 0,
    }],
    workspace,
    worldScale: 1,
  });

  const stored = await workspace.read(result.proxy!.geometryKey);
  expect(result.proxy?.colors?.length).toBe(stored.positions.length);
  expect([...(result.proxy?.colors?.slice(0, 3) ?? [])])
    .toEqual([0.25, 0.5, 0.5]);
  await workspace.dispose();
});

test('weights proxy colors by triangle surface area', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1024 });
  const source = symmetricBox();
  const colors = new Float32Array(source.vertexCount * 3);
  for (let vertex = 0; vertex < source.vertexCount; vertex += 1) {
    colors[vertex * 3] = vertex * 7 % 13 / 13;
    colors[vertex * 3 + 1] = vertex * 11 % 17 / 17;
    colors[vertex * 3 + 2] = vertex * 5 % 19 / 19;
  }
  await workspace.write('0:0', { ...source, colors });
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: source.triangleCount,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: source.triangleCount,
      materialIndex: 0,
    }],
    workspace,
    worldScale: 1,
  });

  expect([...(result.proxy?.colors?.slice(0, 3) ?? [])].map(
    (value) => Number(value.toFixed(4)),
  )).toEqual([0.4642, 0.4849, 0.4701]);
  await workspace.dispose();
});
