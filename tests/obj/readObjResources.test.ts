import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import {
  readObjResources,
} from '../../packages/obj-importer/src/readObjResources.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('reads safe relative MTL sidecars in deterministic order', async () => {
  const root = await temporaryDirectory();
  await mkdir(join(root, 'materials'));
  await writeFile(join(root, 'materials', 'paint.mtl'), 'newmtl Blue\n');
  await writeFile(
    join(root, 'model.obj'),
    [
      'mtllib materials/paint.mtl',
      'mtllib materials/paint.mtl',
      'o Pump',
      '',
    ].join('\n'),
  );

  const result = await readObjResources(join(root, 'model.obj'));

  expect(result.sidecars.map((sidecar) => sidecar.name))
    .toEqual(['materials/paint.mtl']);
  expect(result.warnings).toEqual([]);
});

test('ignores absolute, URL and parent-traversing MTL paths', async () => {
  const root = await temporaryDirectory();
  await writeFile(
    join(root, 'model.obj'),
    [
      'mtllib /tmp/private.mtl',
      'mtllib https://example.invalid/private.mtl',
      'mtllib ../outside.mtl',
      'o Pump',
      '',
    ].join('\n'),
  );

  const result = await readObjResources(join(root, 'model.obj'));

  expect(result.sidecars).toEqual([]);
  expect(result.warnings).toEqual([
    'ICE3_TOOL_OBJ_RESOURCE_IGNORED',
  ]);
});

test('reports missing and symlink-escaping MTL without reading outside', async () => {
  const root = await temporaryDirectory();
  const outside = await temporaryDirectory();
  await writeFile(join(outside, 'private.mtl'), 'private');
  await symlink(join(outside, 'private.mtl'), join(root, 'linked.mtl'));
  await writeFile(
    join(root, 'model.obj'),
    [
      'mtllib missing.mtl',
      'mtllib linked.mtl',
      'o Pump',
      '',
    ].join('\n'),
  );

  const result = await readObjResources(join(root, 'model.obj'));

  expect(result.sidecars).toEqual([]);
  expect(result.warnings).toEqual([
    'ICE3_TOOL_OBJ_MATERIAL_UNAVAILABLE',
    'ICE3_TOOL_OBJ_RESOURCE_IGNORED',
  ]);
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ice3-obj-resource-'));
  directories.push(directory);
  return directory;
}
