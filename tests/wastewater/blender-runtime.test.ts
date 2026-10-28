import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  assertSupportedBlender,
  readBlenderVersion,
  resolveBlenderBinary,
  SUPPORTED_BLENDER_VERSION,
} from '../../tools/wastewater-plant/blender-runtime.js';

test('uses the pinned Blender installation', () => {
  const binary = resolveBlenderBinary();
  assertSupportedBlender(binary);
  expect(readBlenderVersion(binary).version).toBe(SUPPORTED_BLENDER_VERSION);
});
