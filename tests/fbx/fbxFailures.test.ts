import {
  access,
  chmod,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';

const directories: string[] = [];
const originalBlender = process.env.BLENDER_BIN;
const originalTimeout = process.env.ICE3_FBX_TIMEOUT_MS;

afterEach(async () => {
  mockApi.restoreAllMocks();
  restoreEnvironment('BLENDER_BIN', originalBlender);
  restoreEnvironment('ICE3_FBX_TIMEOUT_MS', originalTimeout);
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('reports unavailable Blender without publishing output', async () => {
  process.env.BLENDER_BIN = '/tmp/ice3-missing-blender';
  const error = await runFailure('synthetic-binary.fbx');
  expect(error).toContain('ICE3_TOOL_FBX_BLENDER_UNAVAILABLE');
});

test('reports a Blender version mismatch without fallback', async () => {
  const root = await temporaryDirectory();
  const binary = join(root, 'blender');
  await writeFile(binary, '#!/bin/sh\nprintf "Blender 5.2.2\\n"\n');
  await chmod(binary, 0o755);
  process.env.BLENDER_BIN = binary;

  const error = await runFailure('synthetic-binary.fbx');
  expect(error).toContain('ICE3_TOOL_FBX_BLENDER_VERSION_INVALID');
});

test('reports bridge timeout without publishing output', async () => {
  process.env.ICE3_FBX_TIMEOUT_MS = '1';
  const error = await runFailure('synthetic-binary.fbx');
  expect(error).toContain('ICE3_TOOL_FBX_TIMEOUT');
});

test('reports truncated and empty FBX with stable codes', async () => {
  const truncated = await runFailure('truncated.fbx');
  expect(truncated).toContain('ICE3_TOOL_FBX_IMPORT_FAILED');
  const empty = await runFailure('empty.fbx');
  expect(empty).toContain('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
});

async function runFailure(fixture: string): Promise<string> {
  const root = await temporaryDirectory();
  const output = join(root, 'failed.glb');
  const errors: string[] = [];
  mockApi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });
  expect(await runCli([
    'import',
    join('tests/fixtures/fbx', fixture),
    '--output',
    output,
    '--asset-id',
    'failed-fbx',
    '--adapter',
    'fbx',
  ])).toBe(1);
  await expect(access(output)).rejects.toThrow();
  mockApi.restoreAllMocks();
  return errors.join('\n');
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ice3-fbx-failure-'));
  directories.push(directory);
  return directory;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
