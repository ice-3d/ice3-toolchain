import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';
import {
  validatePreparedGLB,
} from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';

const original = process.env.ICE3_JT_CONVERTER;
const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  if (original === undefined) delete process.env.ICE3_JT_CONVERTER;
  else process.env.ICE3_JT_CONVERTER = original;
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('import selects JT and publishes Prepared GLB', async () => {
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/fake-converter.mjs',
  );
  const root = await mkdtemp(join(tmpdir(), 'ice3-jt-cli-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'jt.glb');
  const report = join(root, 'jt.report.json');

  expect(await runCli([
    'import',
    'tests/fixtures/jt/synthetic-contract.jt',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-jt',
    '--json',
  ])).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
  expect(JSON.parse(await readFile(report, 'utf8')).adapter.id).toBe('jt');
});

test('import accepts an explicit JT adapter', async () => {
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/fake-converter.mjs',
  );
  const root = await mkdtemp(join(tmpdir(), 'ice3-jt-explicit-cli-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'jt.glb');

  expect(await runCli([
    'import',
    'tests/fixtures/jt/synthetic-contract.jt',
    '--output',
    output,
    '--asset-id',
    'synthetic-jt',
    '--adapter',
    'jt',
    '--json',
  ])).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
});
