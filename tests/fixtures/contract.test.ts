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

test('fixture report matches the frozen GLB contract', () => {
  const bytes = readFileSync('fixtures/prepared-cube.glb');
  const report = JSON.parse(
    readFileSync('fixtures/prepared-cube.report.json', 'utf8'),
  ) as {
    asset: { contentDigest: string };
    metrics: Record<string, number>;
  };
  const profile = readProfile(bytes);
  expect(report.asset.contentDigest).toBe(
    `sha256:${String(profile.contentDigest?.value)}`,
  );
  expect(report.metrics).toMatchObject(profile.stats as Record<string, number>);
  expect(report.metrics.encodedBytes).toBe(bytes.byteLength);
});

function readProfile(bytes: Uint8Array): {
  contentDigest: { value: string };
  stats: Record<string, unknown>;
} {
  const buffer = Buffer.from(bytes);
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + length).toString('utf8').trimEnd(),
  ) as {
    asset: { extras: { ice3: {
      contentDigest: { value: string };
      stats: Record<string, unknown>;
    } } };
  };
  return json.asset.extras.ice3;
}
