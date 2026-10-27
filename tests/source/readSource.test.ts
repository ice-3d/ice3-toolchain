import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'node-test';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reads an external-buffer glTF document', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  expect(source.buffers).toHaveLength(1);
  expect(source.buffers[0]!.byteLength).toBe(42);
});

test('reads a GLB document with an embedded BIN chunk', async () => {
  const source = await readSource('tests/fixtures/minimal.glb');
  expect(source.buffers).toHaveLength(1);
  expect(source.buffers[0]!.byteLength).toBe(42);
});

test('rejects a truncated GLB JSON chunk', async () => {
  await expect(readSource('tests/fixtures/truncated.glb')).rejects.toThrow(
    /ICE3_TOOL_INVALID_SOURCE/,
  );
});

test('rejects an absolute external resource URI', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-source-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'unsafe.gltf');
  writeFileSync(path, JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: '/tmp/outside.bin', byteLength: 1 }],
  }));

  await expect(readSource(path)).rejects.toThrow(/ICE3_TOOL_INVALID_SOURCE/);
});

test('rejects a parent-traversing external resource URI', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-source-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'unsafe.gltf');
  writeFileSync(path, JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: '../outside.bin', byteLength: 1 }],
  }));

  await expect(readSource(path)).rejects.toThrow(/ICE3_TOOL_INVALID_SOURCE/);
});
