import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  assertBlenderVersion,
  parseBlenderVersion,
  resolveBlenderBinary,
} from '../../packages/fbx-importer/src/blenderRuntime.js';

test('parses and enforces the pinned Blender version', () => {
  expect(parseBlenderVersion('Blender 5.2.3 LTS')).toEqual({
    version: '5.2.3',
    major: 5,
    minor: 2,
    patch: 3,
  });
  expect(() => assertBlenderVersion('5.2.2')).toThrow(
    'ICE3_TOOL_FBX_BLENDER_VERSION_INVALID',
  );
});

test('resolves an explicit Blender executable before platform defaults', () => {
  expect(resolveBlenderBinary({
    explicitPath: process.execPath,
    env: {},
    platform: 'linux',
  })).toBe(process.execPath);
});
