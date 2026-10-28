import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { NodeIO } from '@gltf-transform/core';
import { expect } from '#test-expect';

let sourceRoot = '';
let sourceGlb = '';

before(async () => {
  sourceRoot = await mkdtemp(join(tmpdir(), 'ice3-wwtp-blender-'));
  sourceGlb = join(sourceRoot, 'source.glb');
  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    'tools/wastewater-plant/build-blender-source.ts',
    '--output',
    sourceGlb,
  ], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
});

after(async () => {
  await rm(sourceRoot, { recursive: true, force: true });
});

function buildSourceForTest(): string {
  return sourceGlb;
}

test('exports a valid source GLB with stable equipment roots', async () => {
  const source = await readFile(buildSourceForTest());
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(
    source.subarray(20, 20 + jsonLength).toString('utf8'),
  ) as { asset: { generator?: string } };
  expect(json.asset.generator).toBe('ICE3 authored wastewater pipeline');
  const document = await new NodeIO().read(buildSourceForTest());
  const ids = document.getRoot().listNodes().flatMap((node) => {
    const value = node.getExtras().ice3 as
      | { selectionId?: string }
      | undefined;
    return value?.selectionId ? [value.selectionId] : [];
  });
  expect(new Set(ids).size).toBe(65);
});

test('creates the complete site envelope and process infrastructure', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const names = document.getRoot().listNodes().map((node) => node.getName());
  expect(names).toEqual(expect.arrayContaining([
    'Site',
    'RoadNetwork',
    'Buildings',
    'ProcessPipes',
    'Perimeter',
  ]));
  const primitives = document.getRoot().listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
  expect(primitives.length).toBeGreaterThan(100);
});

test('models distinct process equipment with presentation-grade detail', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const nodes = new Map(
    document.getRoot().listNodes().map((node) => [node.getName(), node]),
  );
  const triangleCount = (name: string) => nodes.get(name)?.getMesh()
    ?.listPrimitives().reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0) ?? 0;
  expect(triangleCount('SC-101')).toBeGreaterThan(1200);
  expect(triangleCount('AE-101')).toBeGreaterThan(900);
  expect(triangleCount('GR-102')).toBeGreaterThan(500);
  expect(triangleCount('BLW-101')).toBeGreaterThan(400);
});
