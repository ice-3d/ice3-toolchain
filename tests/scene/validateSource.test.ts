import { expect, test } from 'node-test';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import { validateSource } from '../../packages/toolchain-core/src/scene/validateSource.js';

test('accepts the minimal supported source', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  expect(validateSource(document).errors).toEqual([]);
});

test('reports animations and textures as unsupported', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  const json = document.json as Record<string, unknown>;
  json.animations = [{}];
  json.textures = [{}];

  const report = validateSource(document);
  expect(report.errors).toContain('ICE3_TOOL_UNSUPPORTED_ANIMATION');
  expect(report.errors).toContain('ICE3_TOOL_UNSUPPORTED_TEXTURE');
});

test('rejects a cyclic node graph', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  const json = document.json as Record<string, unknown>;
  json.nodes = [
    { children: [1] },
    { children: [0] },
  ];

  expect(validateSource(document).errors).toContain('ICE3_TOOL_SCENE_CYCLE');
});

test('rejects required extensions and sparse accessors', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  const json = document.json as Record<string, unknown>;
  json.extensionsRequired = ['EXT_example'];
  const accessors = json.accessors as Record<string, unknown>[];
  accessors[0] = { ...accessors[0], sparse: {} };

  const report = validateSource(document);
  expect(report.errors).toContain('ICE3_TOOL_UNSUPPORTED_EXTENSION');
  expect(report.errors).toContain('ICE3_TOOL_UNSUPPORTED_SPARSE_ACCESSOR');
});
