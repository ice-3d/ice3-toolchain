import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  resolveBlenderBinary,
} from '../../packages/fbx-importer/src/blenderRuntime.js';

test('fixtures contain binary and ASCII FBX', async () => {
  const binary = await readFile('tests/fixtures/fbx/synthetic-binary.fbx');
  const ascii = await readFile('tests/fixtures/fbx/synthetic-ascii.fbx', 'utf8');

  expect(binary.subarray(0, 18).toString('ascii'))
    .toContain('Kaydara FBX Binary');
  expect(ascii).toContain('FBXHeaderExtension');
  expect(`${binary.toString('latin1')}${ascii}`).not.toContain('customer');
});

test('binary fixture can cross the Blender bridge', async () => {
  for (const fixture of ['tests/fixtures/fbx/synthetic-binary.fbx']) {
    const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-fixture-'));
    try {
      const reportPath = join(root, 'report.json');
      const outputPath = join(root, 'raw.glb');
      const result = spawnSync(resolveBlenderBinary(), [
        '--background',
        '--factory-startup',
        '--python-exit-code',
        '1',
        '--python',
        resolve('packages/fbx-importer/scripts/fbx-to-glb.py'),
        '--',
        '--input',
        resolve(fixture),
        '--output',
        outputPath,
        '--report',
        reportPath,
      ], {
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(await readFile(reportPath, 'utf8')).success).toBe(true);
      expect((await readFile(outputPath)).subarray(0, 4).toString('ascii'))
        .toBe('glTF');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
