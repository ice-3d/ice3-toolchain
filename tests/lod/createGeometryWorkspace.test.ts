import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { createGeometryWorkspace } from '../../packages/toolchain-core/src/lod/createGeometryWorkspace.js';

test('reads a unit after spilling it outside the output directory', async () => {
  const workspace = await createGeometryWorkspace({
    maxMemoryBytes: 1,
  });
  const geometry = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };

  await workspace.write('unit-0', geometry);
  const loaded = await workspace.read('unit-0');

  expect([...loaded.positions]).toEqual([...geometry.positions]);
  expect([...loaded.indices]).toEqual([...geometry.indices]);
  expect(workspace.spilledBytes).toBeGreaterThan(0);
  await workspace.dispose();
});

test('removes the workspace root when disposed', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'ice3-lod-test-'));
  const root = join(parent, 'workspace');
  const workspace = await createGeometryWorkspace({
    maxMemoryBytes: 1024,
    temporaryRoot: root,
  });

  await workspace.write('unit-1', {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  });
  await workspace.dispose();

  expect(existsSync(root)).toBe(false);
  await rm(parent, { recursive: true, force: true });
});

for (const maxMemoryBytes of [1024, 1]) {
  test(`round-trips vertex colors with maxMemoryBytes=${maxMemoryBytes}`, async () => {
    const workspace = await createGeometryWorkspace({ maxMemoryBytes });
    const colors = new Float32Array([
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]);
    await workspace.write('color-unit', {
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2]),
      colors,
    });

    const loaded = await workspace.read('color-unit');

    expect([...loaded.colors!]).toEqual([...colors]);
    await workspace.dispose();
  });
}

test('keeps concurrent spilled writes isolated', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  const first = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const second = {
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
      2, 0, 0,
      2, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2, 3, 5, 2]),
  };

  await Promise.all([
    workspace.write('first', first),
    workspace.write('second', second),
  ]);

  expect([...(await workspace.read('first')).indices])
    .toEqual([...first.indices]);
  expect([...(await workspace.read('second')).indices])
    .toEqual([...second.indices]);
  await workspace.dispose();
});
