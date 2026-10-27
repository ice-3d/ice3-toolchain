import { readFileSync } from 'node:fs';
import { expect, test } from 'node-test';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('checked-in contract fixture remains valid and deterministic', async () => {
  const bytes = readFileSync('fixtures/prepared-cube.glb');
  expect(validatePreparedGLB(bytes).errors).toEqual([]);

  const rebuilt = buildPreparedGLB(
    await readSource('tests/fixtures/cube.gltf'),
    { assetId: 'prepared-cube' },
  ).bytes;
  expect(rebuilt).toEqual(bytes);
});
