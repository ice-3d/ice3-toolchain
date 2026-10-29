import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createJtImporter,
} from '../../packages/jt-importer/src/index.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('imports JT through an injected converter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-jt-importer-'));
  try {
    const importer = createJtImporter({
      converterBinary: resolve('tests/fixtures/jt/fake-converter.mjs'),
    });
    expect(importer.id).toBe('jt');
    expect(importer.extensions).toEqual(['.jt']);
    const result = await importer.import({
      path: resolve('tests/fixtures/jt/synthetic-contract.jt'),
    }, {
      temporaryDirectory: root,
      assetId: 'synthetic-jt',
    });
    expect(result.adapterId).toBe('jt');
    expect(result.sourceFormat).toBe('jt');
    const source = await readSource(result.sourceGlbPath);
    expect(source.json.nodes?.map((node) => node.name))
      .toEqual(expect.arrayContaining(['PrimaryPump', 'BufferTank']));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
