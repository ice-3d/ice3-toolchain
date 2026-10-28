import { test } from 'node:test';
import { expect } from '#test-expect';
import { analyzePartitionUnits } from '../../packages/toolchain-core/src/partition/analyzePartitionUnits.js';
import {
  createPartitionPlan,
  type ICEPartitionPlanNode,
} from '../../packages/toolchain-core/src/partition/createPartitionPlan.js';
import { createPartitionSource } from './createPartitionSource.js';

const leaves = (node: ICEPartitionPlanNode): ICEPartitionPlanNode[] =>
  node.children.length === 0
    ? [node]
    : node.children.flatMap(leaves);

test('splits along the longest axis without exceeding the triangle budget', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());
  const plan = createPartitionPlan(analysis.units, 3);

  expect(plan.triangleCount).toBe(4);
  expect(leaves(plan).map((leaf) => leaf.units.length)).toEqual([2, 2]);
  expect(leaves(plan).map((leaf) => leaf.triangleCount)).toEqual([2, 2]);
});

test('produces the same tree when input order changes', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());
  const first = createPartitionPlan(analysis.units, 2);
  const second = createPartitionPlan([...analysis.units].reverse(), 2);

  expect(JSON.stringify(second)).toBe(JSON.stringify(first));
});

test('stops at one indivisible unit when centers coincide', () => {
  const source = createPartitionSource();
  const analysis = analyzePartitionUnits(source);
  const coincident = analysis.units.map((unit) => ({
    ...unit,
    bounds: { min: [0, 0, 0] as const, max: [0, 0, 0] as const },
  }));
  const plan = createPartitionPlan(coincident, 1);

  expect(leaves(plan)).toHaveLength(4);
  expect(leaves(plan).every((leaf) => leaf.units.length === 1)).toBe(true);
});
