import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createUsdImporter,
} from '../../packages/usd-importer/src/index.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('imports ASCII and binary USD into standard source GLB', async () => {
  const importer = createUsdImporter();
  expect(importer.id).toBe('usd');
  expect(importer.extensions).toEqual(['.usda', '.usdc']);
  expect(importer.capabilities.instances).toBe(true);

  for (const fixture of [
    'tests/fixtures/usd/synthetic-plant.usda',
    'tests/fixtures/usd/synthetic-plant.usdc',
  ]) {
    const root = await mkdtemp(join(tmpdir(), 'ice3-usd-importer-'));
    try {
      const result = await importer.import({
        path: resolve(fixture),
      }, {
        temporaryDirectory: root,
        assetId: 'synthetic-usd',
      });
      expect(result.adapterId).toBe('usd');
      const source = await readSource(result.sourceGlbPath);
      const names = source.json.nodes?.map((node) => node.name) ?? [];
      expect(names).toEqual(expect.arrayContaining([
        'PrimaryPump',
        'PumpInstanceA',
        'BufferTank',
      ]));
      const pump = source.json.nodes?.find(
        (node) => node.name === 'PrimaryPump',
      ) as {
        extras?: {
          ice3?: {
            usd?: {
              customProperties?: Record<string, unknown>;
            };
          };
        };
      };
      expect(pump.extras?.ice3?.usd?.customProperties)
        .toMatchObject({ EquipmentTag: 'P-101' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
