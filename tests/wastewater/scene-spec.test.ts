import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createWastewaterSceneSpec,
  writeWastewaterSceneSpec,
} from '../../tools/wastewater-plant/scene-spec.js';

test('exports deterministic equipment and process topology', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-spec-'));
  const output = join(root, 'scene.json');
  try {
    const spec = createWastewaterSceneSpec();
    expect(spec.schemaVersion).toBe(1);
    expect(spec.assetId).toBe('ice3-virtual-wwtp');
    expect(spec.units).toBe('meters');
    expect(spec.equipment).toHaveLength(65);
    expect(new Set(spec.equipment.map((item) => item.tag)).size).toBe(65);
    expect(spec.mainFlowTags).toContain('UV-101');
    await writeWastewaterSceneSpec(output);
    const text = await readFile(output, 'utf8');
    expect(JSON.parse(text)).toEqual(spec);
    expect(text.endsWith('\n')).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
