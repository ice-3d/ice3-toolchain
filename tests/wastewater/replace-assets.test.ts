import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { replaceAssetDirectory } from
  '../../tools/wastewater-plant/replace-asset-directory.js';

test('restores the previous asset root when publishing a new build fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-replace-'));
  const destination = join(root, 'wastewater-plant');
  const previous = join(destination, 'tileset.json');
  const missing = join(root, 'missing-staging');
  try {
    await mkdir(destination);
    await writeFile(previous, 'previous');

    await expect(replaceAssetDirectory(missing, destination))
      .rejects.toThrow();

    expect(await readFile(previous, 'utf8')).toBe('previous');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
