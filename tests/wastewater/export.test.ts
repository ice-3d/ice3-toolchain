import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { generateWastewaterPlant } from
  '../../tools/wastewater-plant/generate.js';

test('exports deterministic source GLB bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-'));
  try {
    const first = join(root, 'first.glb');
    const second = join(root, 'second.glb');
    const firstResult = await generateWastewaterPlant({ outputPath: first });
    const secondResult = await generateWastewaterPlant({ outputPath: second });

    expect(firstResult.sha256).toBe(secondResult.sha256);
    expect(await readFile(first)).toEqual(await readFile(second));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
