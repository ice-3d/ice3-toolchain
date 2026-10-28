import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
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
