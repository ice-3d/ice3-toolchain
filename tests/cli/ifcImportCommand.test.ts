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

test('import selects IFC by extension and publishes Prepared GLB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-ifc-cli-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'ifc.glb');
  const report = join(root, 'ifc.report.json');

  const code = await runCli([
    'import',
    'tests/fixtures/ifc/synthetic-plant.ifc',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-ifc',
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
  expect(assetReport.adapter.id).toBe('ifc');
  expect(assetReport.adapter.sourceFormat).toBe('ifc-4x3');
  expect(assetReport.adapter.capabilities.semanticMetadata).toBe(true);
});

test('import accepts an explicit IFC adapter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-ifc-explicit-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'ifc.glb');

  expect(await runCli([
    'import',
    'tests/fixtures/ifc/synthetic-plant.ifc',
    '--output',
    output,
    '--asset-id',
    'synthetic-ifc',
    '--adapter',
    'ifc',
    '--json',
  ])).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
});
