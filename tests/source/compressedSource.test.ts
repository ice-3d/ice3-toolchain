import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import { validateSource } from '../../packages/toolchain-core/src/scene/validateSource.js';
import { createCompressedFixture } from '../fixtures/createCompressedFixture.js';

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

test('decodes required mesh compression and removes unused image resources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ice3-compressed-'));
  directories.push(directory);
  const path = join(directory, 'compressed.glb');
  await createCompressedFixture(path);

  const source = await readSource(path);
  expect(validateSource(source).errors).toEqual([]);
  expect(source.json.textures).toBeUndefined();
  expect(source.json.images).toBeUndefined();
  expect(source.json.samplers).toBeUndefined();
});
