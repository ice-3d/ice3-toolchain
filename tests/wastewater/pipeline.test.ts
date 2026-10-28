import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { inspectWastewaterArtifacts } from
  '../../tools/wastewater-plant/verify.js';

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
