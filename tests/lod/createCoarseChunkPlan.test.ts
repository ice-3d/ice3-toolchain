import { expect, test } from 'node-test';
import { createCoarseChunkPlan } from '../../packages/toolchain-core/src/lod/createCoarseChunkPlan.js';

test('groups stable units without splitting a device', () => {
  expect(createCoarseChunkPlan([
    { unitId: 'device-c', bytes: 10 },
    { unitId: 'device-a', bytes: 8 },
    { unitId: 'device-b', bytes: 8 },
  ], { maxBytes: 16 })).toEqual([
    { unitIds: ['device-a', 'device-b'], bytes: 16, oversized: false },
    { unitIds: ['device-c'], bytes: 10, oversized: false },
  ]);
});

test('keeps an oversized unit intact', () => {
  expect(createCoarseChunkPlan([
    { unitId: 'large', bytes: 40 },
    { unitId: 'small', bytes: 4 },
  ], { maxBytes: 16 })).toEqual([
    { unitIds: ['large'], bytes: 40, oversized: true },
    { unitIds: ['small'], bytes: 4, oversized: false },
  ]);
});
