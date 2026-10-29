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

test('import selects OBJ by extension and publishes Prepared GLB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-cli-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'obj.glb');
  const report = join(root, 'obj.report.json');

  expect(await runCli([
    'import',
    'tests/fixtures/obj/synthetic-plant.obj',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-obj',
    '--json',
  ])).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
  const reportDocument = JSON.parse(await readFile(report, 'utf8'));
  expect(reportDocument.adapter.id).toBe('obj');
  expect(reportDocument.adapter.warnings).toContain(
    'ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS',
  );
});

test('import accepts an explicit OBJ adapter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-explicit-cli-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const output = join(root, 'obj.glb');

  expect(await runCli([
    'import',
    'tests/fixtures/obj/synthetic-plant.obj',
    '--output',
    output,
    '--asset-id',
    'synthetic-obj',
    '--adapter',
    'obj',
    '--json',
  ])).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
});
