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
      expect(source.json.nodes?.map((node) => node.name))
        .toEqual(expect.arrayContaining([
          'Primary Pump',
          'Pump Instance A',
          'Buffer Tank',
        ]));
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
