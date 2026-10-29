import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';
import {
  validatePreparedGLB,
} from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';

const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('import publishes a validated Prepared GLB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-import-command-'));
  directories.push(root);
  const output = join(root, 'prepared.glb');
  const report = join(root, 'prepared.report.json');
  const logs: string[] = [];
  mockApi.spyOn(console, 'log').mockImplementation((value) => {
    logs.push(String(value));
  });

  const code = await runCli([
    'import',
    'tests/fixtures/step/synthetic-skid.step',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-skid',
    '--json',
  ]);

  expect(code).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
  const assetReport = JSON.parse(await readFile(report, 'utf8')) as {
    adapter: {
      id: string;
      sourceFormat: string;
      capabilities: Record<string, boolean>;
    };
  };
  expect(assetReport.adapter.id).toBe('step');
  expect(assetReport.adapter.sourceFormat).toBe('step-ap242');
  expect(assetReport.adapter.capabilities.materialColors).toBe(true);
  expect(JSON.parse(logs.at(-1)!).command).toBe('import');
});

test('import does not publish output when an adapter fails', async () => {
  mockApi.spyOn(console, 'error').mockImplementation(() => {});
  const root = await mkdtemp(join(tmpdir(), 'ice3-import-failure-'));
  directories.push(root);
  const output = join(root, 'missing.glb');

  const code = await runCli([
    'import',
    'tests/fixtures/step/truncated.step',
    '--output',
    output,
    '--asset-id',
    'broken',
  ]);

  expect(code).toBe(1);
  await expect(readFile(output)).rejects.toThrow();
});
