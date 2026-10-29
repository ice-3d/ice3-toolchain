import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  resolveBlenderBinary,
} from '../../packages/fbx-importer/src/blenderRuntime.js';

test('bridge writes a stable report for an import failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-bridge-script-'));
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
      resolve('tests/fixtures/fbx/truncated.fbx'),
      '--output',
      outputPath,
      '--report',
      reportPath,
    ], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.status).not.toBe(0);
    expect(JSON.parse(await readFile(reportPath, 'utf8'))).toEqual({
      success: false,
      code: 'ICE3_TOOL_FBX_IMPORT_FAILED',
    });
    await expect(readFile(outputPath)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
