import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';

const originalConverter = process.env.ICE3_JT_CONVERTER;
const originalTimeout = process.env.ICE3_JT_TIMEOUT_MS;
const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  restore('ICE3_JT_CONVERTER', originalConverter);
  restore('ICE3_JT_TIMEOUT_MS', originalTimeout);
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('reports JT converter unavailable without publishing output', async () => {
  delete process.env.ICE3_JT_CONVERTER;
  const error = await runFailure('synthetic-contract.jt');
  expect(error).toContain('ICE3_TOOL_JT_CONVERTER_UNAVAILABLE');
});

test('reports JT timeout without publishing output', async () => {
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/slow-converter.sh',
  );
  process.env.ICE3_JT_TIMEOUT_MS = '1';
  const error = await runFailure('synthetic-contract.jt');
  expect(error).toContain('ICE3_TOOL_JT_TIMEOUT');
});

test('maps converter failure and invalid output to stable codes', async () => {
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/failing-converter.sh',
  );
  expect(await runFailure('synthetic-contract.jt'))
    .toContain('ICE3_TOOL_JT_CONVERT_FAILED');
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/invalid-converter.sh',
  );
  expect(await runFailure('synthetic-contract.jt'))
    .toContain('ICE3_TOOL_JT_EXPORT_INVALID');
});

test('rejects converter output without triangle Geometry', async () => {
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/fake-converter.mjs',
  );
  const error = await runFailure('empty.jt');
  expect(error).toContain('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
});

async function runFailure(fixture: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ice3-jt-failure-'));
  directories.push(root);
  const output = join(root, 'failed.glb');
  const errors: string[] = [];
  mockApi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });
  expect(await runCli([
    'import',
    join('tests/fixtures/jt', fixture),
    '--output',
    output,
    '--asset-id',
    'failed-jt',
    '--adapter',
    'jt',
  ])).toBe(1);
  await expect(access(output)).rejects.toThrow();
  mockApi.restoreAllMocks();
  return errors.join('\n');
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
