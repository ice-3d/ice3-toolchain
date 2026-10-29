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

test('import selects USD by extension and publishes Prepared GLB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-cli-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'usd.glb');
  const report = join(root, 'usd.report.json');

  expect(await runCli([
    'import',
    'tests/fixtures/usd/synthetic-plant.usdc',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-usd',
    '--json',
  ])).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
  expect(JSON.parse(await readFile(report, 'utf8')).adapter.id).toBe('usd');
});

test('import accepts an explicit USD adapter for ASCII input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-ascii-cli-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'usd.glb');

  expect(await runCli([
    'import',
    'tests/fixtures/usd/synthetic-plant.usda',
    '--output',
    output,
    '--asset-id',
    'synthetic-usd',
    '--adapter',
    'usd',
    '--json',
  ])).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
});
