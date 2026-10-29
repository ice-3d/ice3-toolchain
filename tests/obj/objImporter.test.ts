import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createObjImporter,
} from '../../packages/obj-importer/src/index.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('imports OBJ with safe MTL into standard source GLB', async () => {
  const importer = createObjImporter();
  expect(importer.id).toBe('obj');
  expect(importer.extensions).toEqual(['.obj']);
  expect(importer.capabilities).toEqual({
    hierarchy: true,
    vertexColors: false,
    materialColors: true,
    instances: false,
    semanticMetadata: false,
  });
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-importer-'));
  try {
    const result = await importer.import({
      path: resolve('tests/fixtures/obj/synthetic-plant.obj'),
    }, {
      temporaryDirectory: root,
      assetId: 'synthetic-obj',
    });
    expect(result.adapterId).toBe('obj');
    expect(result.sourceFormat).toBe('obj');
    expect(result.warnings).toContain(
      'ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS',
    );
    const source = await readSource(result.sourceGlbPath);
    const names = source.json.nodes?.map((node) => node.name) ?? [];
    expect(names).toEqual(expect.arrayContaining([
      'PrimaryPump',
      'BufferTank',
    ]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
