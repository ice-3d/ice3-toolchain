import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { NodeIO } from '@gltf-transform/core';
import { expect } from '#test-expect';
import { AUTHORED_GENERATOR } from
  '../../tools/wastewater-plant/finalize-source-glb.js';
import { inspectWastewaterArtifacts } from
  '../../tools/wastewater-plant/verify.js';

test('checked-in source is produced by the pinned authored generator', async () => {
  const source = await readFile(
    '../ice3-engine/examples/m1/assets/wastewater-plant/'
      + 'source/wastewater-plant.glb',
  );
  const headerLength = source.readUInt32LE(12);
  const json = JSON.parse(
    source.subarray(20, 20 + headerLength).toString('utf8'),
  ) as { asset: { generator?: string } };
  expect(json.asset.generator).toBe(AUTHORED_GENERATOR);
});

test('produces split fine content and split coarse proxies', async () => {
  const summary = await inspectWastewaterArtifacts(
    '../ice3-engine/examples/m1/assets/wastewater-plant',
  );

  expect(summary.fineParts).toBeGreaterThan(1);
  expect(summary.coarseParts).toBeGreaterThan(1);
  expect(summary.selectionIds.length).toBeGreaterThanOrEqual(60);
  expect(new Set(summary.selectionIds).size)
    .toBe(summary.selectionIds.length);
});

test('writes a valid local Tileset with no external roots', async () => {
  const document = JSON.parse(await readFile(
    '../ice3-engine/examples/m1/assets/wastewater-plant/tiled/tileset.json',
    'utf8',
  )) as Record<string, unknown>;

  expect(document.asset).toMatchObject({ version: '1.1' });
  expect(document.extensionsRequired).toBeUndefined();
  expect(JSON.stringify(document)).not.toContain('http://');
  expect(JSON.stringify(document)).not.toContain('https://');
});

test('uses geometry contrast instead of universal generated edge outlines', async () => {
  const source = await readFile(
    '../ice3-engine/examples/m1/assets/wastewater-plant/'
      + 'prepared/wastewater-plant.glb',
  );
  const headerLength = source.readUInt32LE(12);
  const json = JSON.parse(
    source.subarray(20, 20 + headerLength).toString('utf8'),
  ) as {
    asset: {
      extras?: {
        ice3?: {
          preparation?: { options?: { edges?: boolean } };
        };
      };
    };
  };
  expect(json.asset.extras?.ice3?.preparation?.options?.edges).toBe(false);
});

test('separates the industrial color hierarchy by perceptual distance', async () => {
  const document = await new NodeIO().read(
    '../ice3-engine/examples/m1/assets/wastewater-plant/'
      + 'source/wastewater-plant.glb',
  );
  const colors = new Map(document.getRoot().listMaterials().map((material) => (
    [material.getName(), material.getBaseColorFactor()] as const
  )));
  const lab = (color: readonly number[]): readonly [number, number, number] => {
    const [red = 0, green = 0, blue = 0] = color;
    const x = (0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047;
    const y = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const z = (0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883;
    const convert = (value: number): number => (
      value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116
    );
    return [
      116 * convert(y) - 16,
      500 * (convert(x) - convert(y)),
      200 * (convert(y) - convert(z)),
    ];
  };
  const distance = (left: string, right: string): number => {
    const a = lab(colors.get(left)!);
    const b = lab(colors.get(right)!);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };

  for (const pad of [
    'Site.concreteWarm',
    'Site.concreteCool',
    'Site.concreteBlue',
    'Site.concrete',
    'Site.concreteLight',
  ]) {
    expect(distance('Site.soil', pad)).toBeGreaterThanOrEqual(28);
  }
  expect(distance('Site.concreteWarm', 'Site.concreteCool'))
    .toBeGreaterThanOrEqual(30);
  expect(distance('Site.concreteCool', 'Site.concreteBlue'))
    .toBeGreaterThanOrEqual(30);
  expect(distance('Site.concreteLight', 'Site.roof'))
    .toBeGreaterThanOrEqual(30);
  expect(distance('Site.concrete', 'Equipment.stage:biological'))
    .toBeGreaterThanOrEqual(30);
  expect(distance('Equipment.stage:biological', 'Equipment.equipmentLight'))
    .toBeGreaterThanOrEqual(25);

  const pipeMaterials = [
    'Site.waterPipe',
    'Site.mixedLiquorPipe',
    'Site.sludgePipe',
    'Site.airPipe',
    'Site.chemicalPipe',
    'Site.biogasPipe',
    'Site.backwashPipe',
    'Site.filtratePipe',
    'Site.treatedPipe',
  ];
  const pipeDistances = pipeMaterials.flatMap((left, leftIndex) => (
    pipeMaterials.slice(leftIndex + 1).map((right) => distance(left, right))
  ));
  expect(Math.min(...pipeDistances)).toBeGreaterThanOrEqual(20);
});

test('uses realistic process heights and presentation-grade geometry', async () => {
  const document = await new NodeIO().read(
    '../ice3-engine/examples/m1/assets/wastewater-plant/'
      + 'source/wastewater-plant.glb',
  );
  const nodes = document.getRoot().listNodes();
  const height = (tag: string): number => {
    const node = nodes.find((candidate) => candidate.getName() === tag);
    if (!node?.getMesh()) throw new Error(`missing equipment: ${tag}`);
    const matrix = node.getWorldMatrix();
    const points = node.getMesh().listPrimitives().flatMap((primitive) => {
      const minimum = primitive.getAttribute('POSITION')!.getMin([]);
      const maximum = primitive.getAttribute('POSITION')!.getMax([]);
      return [0, 1, 2, 3, 4, 5, 6, 7].map((corner) => {
        const point = [
          corner & 1 ? maximum[0]! : minimum[0]!,
          corner & 2 ? maximum[1]! : minimum[1]!,
          corner & 4 ? maximum[2]! : minimum[2]!,
        ];
        return (
          matrix[1]! * point[0]!
          + matrix[5]! * point[1]!
          + matrix[9]! * point[2]!
          + matrix[13]!
        );
      });
    });
    return Math.max(...points) - Math.min(...points);
  };
  expect(height('AE-101')).toBeGreaterThanOrEqual(5.5);
  expect(height('PC-101')).toBeGreaterThanOrEqual(5.2);
  expect(height('SC-101')).toBeGreaterThanOrEqual(5.4);
  expect(height('BLW-101')).toBeGreaterThanOrEqual(3.3);
  const triangleCount = document.getRoot().listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0);
  expect(triangleCount).toBeGreaterThanOrEqual(2_000_000);
});

test('models a richer process and utility pipe network', async () => {
  const document = await new NodeIO().read(
    '../ice3-engine/examples/m1/assets/wastewater-plant/'
      + 'source/wastewater-plant.glb',
  );
  const pipes = document.getRoot().listNodes().flatMap((node) => {
    const profile = node.getExtras().ice3 as
      | { role?: string; medium?: string }
      | undefined;
    return profile?.role === 'process-pipe' ? [profile] : [];
  });
  expect(pipes.length).toBeGreaterThanOrEqual(90);
  expect([...new Set(pipes.map(({ medium }) => medium))])
    .toEqual(expect.arrayContaining([
      'returnActivatedSludge',
      'filtrate',
      'utilityWater',
    ]));
});
