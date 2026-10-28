import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { NodeIO } from '@gltf-transform/core';
import { expect } from '#test-expect';

test('exports a valid source GLB with stable equipment roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-blender-'));
  const output = join(root, 'source.glb');
  try {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/wastewater-plant/build-blender-source.ts',
      '--output',
      output,
    ], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const source = await readFile(output);
    const jsonLength = source.readUInt32LE(12);
    const json = JSON.parse(
      source.subarray(20, 20 + jsonLength).toString('utf8'),
    ) as { asset: { generator?: string } };
    expect(json.asset.generator).toBe('ICE3 authored wastewater pipeline');
    const document = await new NodeIO().read(output);
    const ids = document.getRoot().listNodes().flatMap((node) => {
      const value = node.getExtras().ice3 as
        | { selectionId?: string }
        | undefined;
      return value?.selectionId ? [value.selectionId] : [];
    });
    expect(new Set(ids).size).toBe(65);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
