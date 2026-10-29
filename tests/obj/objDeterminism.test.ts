import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';

const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('repeated OBJ imports produce byte-identical output and report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-determinism-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const first = await runImport(root, 'first');
  const second = await runImport(root, 'second');

  expect(await readFile(first.output)).toEqual(await readFile(second.output));
  expect(JSON.parse(await readFile(first.report, 'utf8')))
    .toEqual(JSON.parse(await readFile(second.report, 'utf8')));
});

async function runImport(root: string, name: string) {
  const output = join(root, `${name}.glb`);
  const report = join(root, `${name}.report.json`);
  expect(await runCli([
    'import',
    'tests/fixtures/obj/synthetic-plant.obj',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-obj',
    '--adapter',
    'obj',
    '--json',
  ])).toBe(0);
  return { output, report };
}
