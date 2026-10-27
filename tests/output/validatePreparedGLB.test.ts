import { readFile } from 'node:fs/promises';
import { expect, test } from 'node-test';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';

test('accepts a generated ICE3 profile', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const bytes = buildPreparedGLB(source, { assetId: 'sample' }).bytes;

  expect(validatePreparedGLB(bytes).errors).toEqual([]);
});

test('rejects ordinary GLB without ICE3 profile metadata', async () => {
  const bytes = await readFile('tests/fixtures/minimal.glb');
  expect(validatePreparedGLB(bytes).errors).toContain(
    'ICE3_TOOL_PROFILE_MISSING',
  );
});

test('rejects a modified BIN chunk that does not match the digest', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const bytes = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  bytes[bytes.byteLength - 1] = (bytes[bytes.byteLength - 1]! + 1) & 0xff;

  expect(validatePreparedGLB(bytes).errors).toContain(
    'ICE3_TOOL_CONTENT_DIGEST_MISMATCH',
  );
});
