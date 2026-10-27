import type {
  ICELodBuildOptions,
  ICEPartitionUnit,
} from '../partition/types.js';

export interface ICELodUnitTarget {
  readonly nodeIndices: readonly number[];
  readonly targetTriangles: number;
  readonly minimumTriangles: number;
}

export function allocateLodTargets(
  units: readonly ICEPartitionUnit[],
  options: ICELodBuildOptions,
): readonly ICELodUnitTarget[] {
  validateOptions(options);
  if (units.length === 0) {
    throw new Error('ICE3_TOOL_LOD_INVALID: no partition units');
  }
  const targets = units.map((unit) => ({
    nodeIndices: [...unit.nodeIndices],
    targetTriangles: Math.max(
      Math.min(options.minTrianglesPerUnit, unit.triangleCount),
      Math.floor(unit.triangleCount * options.ratio),
    ),
    minimumTriangles: Math.min(
      options.minTrianglesPerUnit,
      unit.triangleCount,
    ),
  }));
  let total = targets.reduce(
    (sum, target) => sum + target.targetTriangles,
    0,
  );
  while (total > options.maxTrianglesPerProxy) {
    const adjustable = targets
      .map((target, index) => ({
        index,
        excess: target.targetTriangles - target.minimumTriangles,
      }))
      .filter((entry) => entry.excess > 0)
      .sort((left, right) => (
        right.excess - left.excess || left.index - right.index
      ));
    if (adjustable.length === 0) break;
    const excess = total - options.maxTrianglesPerProxy;
    const step = Math.max(1, Math.ceil(excess / adjustable.length));
    for (const entry of adjustable) {
      if (total <= options.maxTrianglesPerProxy) break;
      const target = targets[entry.index]!;
      const reduction = Math.min(step, target.targetTriangles - target.minimumTriangles);
      targets[entry.index] = {
        ...target,
        targetTriangles: target.targetTriangles - reduction,
      };
      total -= reduction;
    }
  }
  return targets;
}

function validateOptions(options: ICELodBuildOptions): void {
  if (
    !Number.isFinite(options.ratio)
    || options.ratio <= 0
    || options.ratio >= 1
    || !Number.isInteger(options.maxTrianglesPerProxy)
    || options.maxTrianglesPerProxy < 1
    || !Number.isInteger(options.minTrianglesPerUnit)
    || options.minTrianglesPerUnit < 1
    || options.minTrianglesPerUnit > options.maxTrianglesPerProxy
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: LOD target options are invalid');
  }
}
