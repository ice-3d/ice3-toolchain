import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createBox,
  createCylinder,
  createOpenCylinder,
  createPipeSegment,
} from '../../tools/wastewater-plant/primitives.js';

test('creates a finite indexed box with independent face normals', () => {
  const box = createBox(2, 3, 4);
  expect(box.positions).toHaveLength(72);
  expect(box.normals).toHaveLength(72);
  expect(box.indices).toHaveLength(36);
  expect([...box.positions].every(Number.isFinite)).toBe(true);
  expect([...box.normals].every(Number.isFinite)).toBe(true);
});

test('creates closed and open cylindrical walls with stable winding', () => {
  const closed = createCylinder(2, 4, 16);
  const open = createOpenCylinder(2, 4, 16);

  expect(closed.indices.length % 3).toBe(0);
  expect(open.indices.length % 3).toBe(0);
  expect(open.indices.length).toBeLessThan(closed.indices.length);
});

test('creates a pipe segment aligned with two finite endpoints', () => {
  const pipe = createPipeSegment([1, 2, 3], [4, 5, 6], 0.25);

  expect(pipe.positions.length).toBeGreaterThan(0);
  expect([...pipe.positions].every(Number.isFinite)).toBe(true);
  expect([...pipe.indices].every((index) => (
    index >= 0 && index < pipe.positions.length / 3
  ))).toBe(true);
});
