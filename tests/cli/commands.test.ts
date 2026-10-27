import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'node-test';
import { runCli } from '../../packages/cli/src/commands.js';

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('build writes a prepared GLB atomically', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const output = join(directory, 'prepared.glb');

  const code = await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--asset-id',
    'sample',
  ]);

  expect(code).toBe(0);
  expect(existsSync(output)).toBe(true);
  expect(readFileSync(output).subarray(0, 4).toString('ascii')).toBe('glTF');
});

test('build returns non-zero for unsupported input without leaving output', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const unsupported = join(directory, 'unsupported.gltf');
  writeFileSync(
    join(directory, 'minimal.bin'),
    readFileSync('tests/fixtures/minimal.bin'),
  );
  const document = JSON.parse(
    readFileSync('tests/fixtures/minimal.gltf', 'utf8'),
  ) as Record<string, unknown>;
  document.animations = [{}];
  writeFileSync(unsupported, JSON.stringify(document));
  const output = join(directory, 'prepared.glb');

  expect(await runCli(['build', unsupported, '--output', output])).toBe(1);
  expect(existsSync(output)).toBe(false);
});

test('inspect emits machine-readable source statistics', async () => {
  const output: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value));
  });

  const code = await runCli([
    'inspect',
    resolve('tests/fixtures/minimal.gltf'),
    '--json',
  ]);
  const report = JSON.parse(output.at(-1)!) as {
    errors: string[];
    stats: { triangleCount: number };
  };

  expect(code).toBe(0);
  expect(report.errors).toEqual([]);
  expect(report.stats.triangleCount).toBe(1);
});

test('validate accepts a generated profile', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const output = join(directory, 'prepared.glb');
  await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--asset-id',
    'sample',
  ]);

  expect(await runCli(['validate', output])).toBe(0);
});

test('inspect reports a prepared ICE3 profile', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const output = join(directory, 'prepared.glb');
  await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--asset-id',
    'sample',
  ]);
  const messages: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    messages.push(String(value));
  });

  expect(await runCli(['inspect', output, '--json'])).toBe(0);
  const report = JSON.parse(messages.at(-1)!) as {
    errors: string[];
    stats: { triangleCount: number };
  };
  expect(report.errors).toEqual([]);
  expect(report.stats.triangleCount).toBe(1);
});
