import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'node-test';
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
