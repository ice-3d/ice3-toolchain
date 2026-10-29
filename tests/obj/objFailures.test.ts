import {
  access,
  mkdtemp,
  rm,
} from 'node:fs/promises';
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

test('reports empty and malformed OBJ without publishing output', async () => {
  const empty = await runFailure('empty.obj', []);
  expect(empty).toContain('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
  const truncated = await runFailure('truncated.obj', []);
  expect(truncated).toContain('ICE3_TOOL_OBJ_IMPORT_FAILED');
});

test('warnings-as-errors blocks OBJ unit assumption', async () => {
  const error = await runFailure('synthetic-plant.obj', [
    '--warnings-as-errors',
  ]);
  expect(error).toContain('ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS');
});

async function runFailure(
  fixture: string,
  extra: readonly string[],
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-failure-'));
  directories.push(root);
  const output = join(root, 'failed.glb');
  const errors: string[] = [];
  mockApi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });
  expect(await runCli([
    'import',
    join('tests/fixtures/obj', fixture),
    '--output',
    output,
    '--asset-id',
    'failed-obj',
    '--adapter',
    'obj',
    ...extra,
  ])).toBe(1);
  await expect(access(output)).rejects.toThrow();
  mockApi.restoreAllMocks();
  return errors.join('\n');
}
