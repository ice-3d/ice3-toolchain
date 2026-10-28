import { test } from 'node:test';
import { expect } from '#test-expect';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import { readAccessor } from '../../packages/toolchain-core/src/source/readAccessor.js';

test('decodes a non-interleaved float position accessor', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  const data = readAccessor(document, 0);

  expect(data.kind).toBe('float32');
  expect(data.components).toBe(3);
  expect([...data.values]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
});

test('decodes an unsigned short index accessor', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  const data = readAccessor(document, 1);

  expect(data.kind).toBe('uint16');
  expect([...data.values]).toEqual([0, 1, 2]);
});

test('rejects an accessor that exceeds its buffer view', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  const accessors = document.json.accessors as Record<string, unknown>[];
  accessors[0] = { ...accessors[0], count: 100 };

  expect(() => readAccessor(document, 0)).toThrow(
    /ICE3_TOOL_ACCESSOR_OUT_OF_RANGE/,
  );
});

test('rejects an unsupported accessor component type', async () => {
  const document = await readSource('tests/fixtures/minimal.gltf');
  const accessors = document.json.accessors as Record<string, unknown>[];
  accessors[0] = { ...accessors[0], componentType: 5121 };

  expect(() => readAccessor(document, 0)).toThrow(
    /ICE3_TOOL_ACCESSOR_UNSUPPORTED/,
  );
});
