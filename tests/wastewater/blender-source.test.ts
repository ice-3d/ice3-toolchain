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

test('places every selectable equipment root inside the site ground', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const nodes = document.getRoot().listNodes();
  const ground = nodes.find((node) => node.getName() === 'Ground.Slab');
  expect(ground).toBeDefined();
  const groundMatrix = ground!.getWorldMatrix();
  const groundPrimitive = ground!.getMesh()!.listPrimitives()[0]!;
  const groundMin = groundPrimitive.getAttribute('POSITION')!.getMin([]);
  const groundMax = groundPrimitive.getAttribute('POSITION')!.getMax([]);
  const corners = [groundMin, groundMax].flatMap((minimum, index) => {
    const maximum = index === 0 ? groundMax : groundMin;
    return [0, 1, 2, 3, 4, 5, 6, 7].map((corner) => [
      (corner & 1) === 0 ? minimum[0]! : maximum[0]!,
      (corner & 2) === 0 ? minimum[1]! : maximum[1]!,
      (corner & 4) === 0 ? minimum[2]! : maximum[2]!,
      1,
    ]).map((point) => [
      groundMatrix[0]! * point[0]! + groundMatrix[4]! * point[1]!
        + groundMatrix[8]! * point[2]! + groundMatrix[12]!,
      groundMatrix[1]! * point[0]! + groundMatrix[5]! * point[1]!
        + groundMatrix[9]! * point[2]! + groundMatrix[13]!,
      groundMatrix[2]! * point[0]! + groundMatrix[6]! * point[1]!
        + groundMatrix[10]! * point[2]! + groundMatrix[14]!,
    ]);
  });
  const min = [0, 1, 2].map((axis) => (
    Math.min(...corners.map((point) => point[axis]!))
  ));
  const max = [0, 1, 2].map((axis) => (
    Math.max(...corners.map((point) => point[axis]!))
  ));

  expect(min[0]).toBeLessThanOrEqual(-24);
  expect(max[0]).toBeGreaterThanOrEqual(294);
  expect(min[2]).toBeLessThanOrEqual(-68);
  expect(max[2]).toBeGreaterThanOrEqual(112);
  const outside = nodes.filter((node) => {
    const profile = node.getExtras().ice3 as
      | { equipmentTag?: string }
      | undefined;
    if (!profile?.equipmentTag) return false;
    const matrix = node.getWorldMatrix();
    const x = matrix[12]!;
    const z = matrix[14]!;
    return x < min[0]! || x > max[0]! || z < min[2]! || z > max[2]!;
  }).map((node) => node.getName());
  expect(outside).toEqual([]);
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

test('models advanced and sludge equipment with recognizable assemblies', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const nodes = new Map(
    document.getRoot().listNodes().map((node) => [node.getName(), node]),
  );
  for (const name of [
    'DIG-101',
    'DIG-102',
    'FLARE-101',
    'UV-101',
    'DWG-101',
    'FL-101',
    'OZ-101',
  ]) {
    expect(nodes.has(name)).toBe(true);
  }
  const triangleCount = (name: string) => nodes.get(name)?.getMesh()
    ?.listPrimitives().reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0) ?? 0;
  expect(triangleCount('DIG-101')).toBeGreaterThan(1200);
  expect(triangleCount('DWG-101')).toBeGreaterThan(800);
  expect(triangleCount('UV-101')).toBeGreaterThan(700);
  expect(triangleCount('FL-101')).toBeGreaterThan(600);
  expect(triangleCount('OZ-101')).toBeGreaterThan(500);
  const total = document.getRoot().listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0);
  expect(total).toBeGreaterThanOrEqual(1_300_000);
  expect(total).toBeLessThanOrEqual(2_000_000);
});

test('exports connected pipe runs with semantic process metadata', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const pipes = document.getRoot().listNodes().flatMap((node) => {
    const profile = node.getExtras().ice3 as
      | {
          role?: string;
          connectionId?: string;
          from?: string;
          to?: string;
          medium?: string;
        }
      | undefined;
    return profile?.role === 'process-pipe' ? [{ node, profile }] : [];
  });
  expect(pipes.length).toBeGreaterThanOrEqual(70);
  expect(new Set(pipes.map(({ profile }) => profile.connectionId)).size)
    .toBe(pipes.length);
  for (const { node, profile } of pipes) {
    expect(node.getMesh()).toBeDefined();
    expect(profile.from).toMatch(/^[^:]+:[a-z-]+$/);
    expect(profile.to).toMatch(/^[^:]+:[a-z-]+$/);
    expect(String(profile.medium).length).toBeGreaterThan(0);
  }
});

test('exports equipment business context and connected port names', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const equipment = document.getRoot().listNodes().flatMap((node) => {
    const profile = node.getExtras().ice3 as
      | {
          equipmentTag?: string;
          area?: string;
          ports?: string[];
          connections?: string[];
        }
      | undefined;
    return profile?.equipmentTag ? [{ node, profile }] : [];
  });
  expect(equipment).toHaveLength(65);
  for (const { node, profile } of equipment) {
    expect(node.getName()).toBe(profile.equipmentTag);
    expect(profile.area?.length).toBeGreaterThan(0);
    expect(profile.ports?.length).toBeGreaterThan(0);
    expect(profile.connections?.length).toBeGreaterThan(0);
  }
});
