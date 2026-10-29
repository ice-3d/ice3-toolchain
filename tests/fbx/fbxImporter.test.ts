import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createFbxImporter,
} from '../../packages/fbx-importer/src/index.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('imports Binary and ASCII FBX into standard source GLB', async () => {
  for (const fixture of [
    'tests/fixtures/fbx/synthetic-binary.fbx',
    'tests/fixtures/fbx/synthetic-ascii.fbx',
  ]) {
    const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-importer-'));
    try {
      const result = await createFbxImporter().import({
        path: resolve(fixture),
      }, {
        temporaryDirectory: root,
        assetId: 'synthetic-fbx',
      });
      expect(result.adapterId).toBe('fbx');
      const source = await readSource(result.sourceGlbPath);
      const names = source.json.nodes?.map((node) => node.name) ?? [];
      expect(names)
        .toEqual(expect.arrayContaining([
          'Primary Pump',
          'Pump Instance A',
          'Buffer Tank',
        ]));
      if (fixture.includes('ascii')) {
        expect(names).not.toContain('RootNode');
        expect(names).toContain('FBX Root');
      }
      const pump = source.json.nodes?.find(
        (node) => node.name === 'Primary Pump',
      ) as {
        extras?: {
          ice3?: {
            fbx?: {
              customProperties?: Record<string, unknown>;
            };
          };
        };
      };
      expect(pump.extras?.ice3?.fbx?.customProperties)
        .toMatchObject({ EquipmentTag: 'P-101' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('uses one local origin for georeferenced FBX', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-origin-'));
  try {
    const result = await createFbxImporter().import({
      path: resolve('tests/fixtures/fbx/large-origin.fbx'),
    }, {
      temporaryDirectory: root,
      assetId: 'large-fbx',
    });
    const source = await readSource(result.sourceGlbPath);
    const ice3 = source.json.asset?.extras?.ice3 as {
      fbx?: {
        sourceOrigin?: number[];
      };
    };
    expect(ice3.fbx?.sourceOrigin?.[0]).toBeGreaterThan(1_000_000);

    const positions: number[] = [];
    for (const mesh of source.json.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        const accessor = source.json.accessors?.[
          primitive.attributes?.POSITION ?? -1
        ];
        if (accessor?.min && accessor.max) {
          positions.push(...accessor.min, ...accessor.max);
        }
      }
    }
    expect(positions.length).toBeGreaterThan(0);
    expect(Math.max(...positions.map(Math.abs))).toBeLessThan(20);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
