import type {
  ICEBounds,
  ICEPartitionPlanNode,
  ICEPartitionUnit,
} from './types.js';

export type { ICEPartitionPlanNode } from './types.js';

export function createPartitionPlan(
  units: readonly ICEPartitionUnit[],
  maxTriangles: number,
): ICEPartitionPlanNode {
  if (!Number.isFinite(maxTriangles) || maxTriangles <= 0) {
    throw new Error(
      'ICE3_TOOL_PARTITION_OPTIONS_INVALID: maxTriangles must be positive',
    );
  }
  if (units.length === 0) {
    throw new Error('ICE3_TOOL_PARTITION_EMPTY: no partition units');
  }
  const sorted = [...units].sort((left, right) => (
    left.nodeIndices[0]! - right.nodeIndices[0]!
  ));
  return planNode(sorted, maxTriangles);
}

function planNode(
  units: readonly ICEPartitionUnit[],
  maxTriangles: number,
): ICEPartitionPlanNode {
  const triangleCount = units.reduce(
    (total, unit) => total + unit.triangleCount,
    0,
  );
  const bounds = unionBounds(units.map((unit) => unit.bounds));
  if (triangleCount <= maxTriangles || units.length === 1) {
    return {
      bounds,
      triangleCount,
      units,
      children: [],
    };
  }

  const centers = units.map((unit) => boundsCenter(unit.bounds));
  const extents = [0, 1, 2].map((axis) => (
    Math.max(...centers.map((center) => center[axis]!))
    - Math.min(...centers.map((center) => center[axis]!))
  ));
  const axis = extents.reduce((selected, extent, index) => (
    extent > (extents[selected] ?? -1) ? index : selected
  ), 0);
  const ordered = [...units].sort((left, right) => {
    const delta = boundsCenter(left.bounds)[axis]!
      - boundsCenter(right.bounds)[axis]!;
    return delta || left.nodeIndices[0]! - right.nodeIndices[0]!;
  });

  let cumulative = 0;
  let split = 1;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    cumulative += ordered[index]!.triangleCount;
    split = index + 1;
    if (cumulative >= triangleCount / 2) break;
  }
  split = Math.max(1, Math.min(ordered.length - 1, split));
  const children = [
    planNode(ordered.slice(0, split), maxTriangles),
    planNode(ordered.slice(split), maxTriangles),
  ] as const;
  return {
    bounds,
    triangleCount,
    units: ordered,
    children,
  };
}

function boundsCenter(
  bounds: ICEBounds,
): readonly [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function unionBounds(bounds: readonly ICEBounds[]): ICEBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const bound of bounds) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, bound.min[axis]!);
      max[axis] = Math.max(max[axis]!, bound.max[axis]!);
    }
  }
  return { min, max };
}
