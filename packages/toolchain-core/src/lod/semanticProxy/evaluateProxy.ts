import type {
  ICESemanticProxyFitSamples,
  ICESemanticProxyKind,
} from './types.js';
import type {
  ICESemanticProxyGeometryCandidate,
} from './fitProxyGeometry.js';

export interface ICESemanticProxyEvaluation {
  readonly candidate: ICESemanticProxyGeometryCandidate;
  readonly normalizedMaximumDeviation: number;
  readonly volumeInflation: number;
  readonly accepted: boolean;
  readonly rejectionReason?: string;
}

type Vector = readonly [number, number, number];

export function evaluateProxyCandidates(
  samples: ICESemanticProxyFitSamples,
  candidates: readonly ICESemanticProxyGeometryCandidate[],
  sourceTriangles: number,
): readonly ICESemanticProxyEvaluation[] {
  const localDiagonal = diagonal(samples);
  const aabbVolume = Math.max(
    Number.EPSILON,
    extent(samples.bounds.min[0], samples.bounds.max[0])
      * extent(samples.bounds.min[1], samples.bounds.max[1])
      * extent(samples.bounds.min[2], samples.bounds.max[2]),
  );
  const fitPoints = allFitPoints(samples);
  return candidates.map((candidate) => {
    const maximumDeviation = Math.max(
      ...fitPoints.map((point) => (
        distanceToMeshSurface(point, candidate.positions, candidate.indices)
      )),
    );
    const normalizedMaximumDeviation = localDiagonal <= Number.EPSILON
      ? Infinity
      : maximumDeviation / localDiagonal;
    const volumeInflation = candidate.volume / aabbVolume;
    const reduction = sourceTriangles / Math.max(1, candidate.triangleCount);
    const rejectionReason = normalizedMaximumDeviation > 0.05
      ? 'surface_deviation'
      : volumeInflation > 2
        ? 'volume_inflation'
        : reduction < 8
          ? 'triangle_reduction'
          : undefined;
    return {
      candidate,
      normalizedMaximumDeviation,
      volumeInflation,
      accepted: rejectionReason === undefined,
      ...(rejectionReason ? { rejectionReason } : {}),
    };
  });
}

export function sortAcceptedProxyCandidates(
  evaluations: readonly ICESemanticProxyEvaluation[],
): readonly ICESemanticProxyEvaluation[] {
  return evaluations
    .filter((evaluation) => evaluation.accepted)
    .sort((left, right) => (
      left.normalizedMaximumDeviation - right.normalizedMaximumDeviation
      || left.volumeInflation - right.volumeInflation
      || left.candidate.triangleCount - right.candidate.triangleCount
      || kindRank(left.candidate.kind) - kindRank(right.candidate.kind)
      || left.candidate.id.localeCompare(right.candidate.id, 'en')
    ));
}

function kindRank(kind: ICESemanticProxyKind): number {
  return kind === 'obb' ? 0 : 1;
}

function distanceToMeshSurface(
  point: Vector,
  positions: Float32Array,
  indices: Uint32Array,
): number {
  let minimum = Infinity;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = vertex(positions, indices[offset]!);
    const b = vertex(positions, indices[offset + 1]!);
    const c = vertex(positions, indices[offset + 2]!);
    const closest = closestPointOnTriangle(point, a, b, c);
    minimum = Math.min(minimum, distance(point, closest));
  }
  return minimum;
}

function closestPointOnTriangle(point: Vector, a: Vector, b: Vector, c: Vector): Vector {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const ap = subtract(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = subtract(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return add(a, scale(ab, v));
  }
  const cp = subtract(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return add(a, scale(ac, w));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return add(b, scale(subtract(c, b), w));
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return add(a, add(scale(ab, v), scale(ac, w)));
}

function allFitPoints(samples: ICESemanticProxyFitSamples): readonly Vector[] {
  return [
    ...points(samples.vertices),
    ...points(samples.centroids),
  ];
}

function points(values: Float32Array): readonly Vector[] {
  return Array.from({ length: values.length / 3 }, (_value, index) => [
    values[index * 3]!,
    values[index * 3 + 1]!,
    values[index * 3 + 2]!,
  ]);
}

function vertex(positions: Float32Array, index: number): Vector {
  return [
    positions[index * 3]!,
    positions[index * 3 + 1]!,
    positions[index * 3 + 2]!,
  ];
}

function diagonal(samples: ICESemanticProxyFitSamples): number {
  return Math.hypot(
    extent(samples.bounds.min[0], samples.bounds.max[0]),
    extent(samples.bounds.min[1], samples.bounds.max[1]),
    extent(samples.bounds.min[2], samples.bounds.max[2]),
  );
}

function extent(min: number, max: number): number {
  return Math.max(0, max - min);
}

function subtract(left: Vector, right: Vector): Vector {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function add(left: Vector, right: Vector): Vector {
  return [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  ];
}

function scale(vector: Vector, factor: number): Vector {
  return [
    vector[0] * factor,
    vector[1] * factor,
    vector[2] * factor,
  ];
}

function dot(left: Vector, right: Vector): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function distance(left: Vector, right: Vector): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}
