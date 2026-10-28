import { test } from 'node:test';
import { expect } from '#test-expect';
import { createLodSampleSchedule } from '../../packages/toolchain-core/src/lod/createLodSampleSchedule.js';

test('builds deterministic logarithmic samples including both endpoints', () => {
  const first = createLodSampleSchedule({
    sourceTriangles: 1000,
    minimumTriangles: 10,
    sampleCount: 4,
  });
  const second = createLodSampleSchedule({
    sourceTriangles: 1000,
    minimumTriangles: 10,
    sampleCount: 4,
  });

  expect(first).toEqual([10, 46, 215, 1000]);
  expect(second).toEqual(first);
});

test('deduplicates tiny ranges and rejects invalid sample counts', () => {
  expect(createLodSampleSchedule({
    sourceTriangles: 4,
    minimumTriangles: 3,
    sampleCount: 8,
  })).toEqual([3, 4]);

  expect(() => createLodSampleSchedule({
    sourceTriangles: 8,
    minimumTriangles: 1,
    sampleCount: 3,
  })).toThrow(/ICE3_TOOL_LOD_INVALID/);
});
