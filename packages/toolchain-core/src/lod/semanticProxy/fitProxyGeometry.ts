import type {
  ICESemanticProxyFitSamples,
  ICESemanticProxyKind,
} from './types.js';

export interface ICESemanticProxyGeometryCandidate {
  readonly id: string;
  readonly kind: ICESemanticProxyKind;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly triangleCount: number;
  readonly volume: number;
  readonly axisStable: boolean;
}

export interface ICESemanticProxyFitResult {
  readonly candidates: readonly ICESemanticProxyGeometryCandidate[];
  readonly rejectionReasons: readonly string[];
}

type Vector = readonly [number, number, number];
type Matrix3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export function fitProxyGeometry(
  samples: ICESemanticProxyFitSamples,
): ICESemanticProxyFitResult {
  validateSamples(samples);
  const covariance = weightedCovariance(samples);
  const eigen = symmetricEigen(covariance);
  const [lambda1, lambda2, lambda3] = eigen.values;
  if (lambda1 <= 1e-12) {
    return { candidates: [], rejectionReasons: ['degenerate_covariance'] };
  }
  if (lambda2 / lambda1 > 0.9 && lambda3 / lambda1 > 0.8) {
    return { candidates: [], rejectionReasons: ['unstable_axis'] };
  }
  const axes = eigen.vectors;
  const points = allPoints(samples);
  const diagonal = boundsDiagonal(samples);
  const margin = Math.max(1e-6, diagonal * 1e-6);
  const obb = fitObb(points, axes, margin);
  const rejectionReasons: string[] = [];
  const cylinder = fitCylinder(points, axes[0]!);
  if (cylinder) {
    return { candidates: [obb, cylinder], rejectionReasons };
  }
  rejectionReasons.push('cylinder_aspect_ratio');
  return { candidates: [obb], rejectionReasons };
}

function fitObb(
  points: readonly Vector[],
  axes: readonly Vector[],
  margin: number,
): ICESemanticProxyGeometryCandidate {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axisIndex = 0; axisIndex < axes.length; axisIndex += 1) {
      const projection = dot(point, axes[axisIndex]!);
      min[axisIndex] = Math.min(min[axisIndex]!, projection);
      max[axisIndex] = Math.max(max[axisIndex]!, projection);
    }
  }
  const extents = max.map((value, index) => (
    value - min[index]! + margin * 2
  ));
  const mid = max.map((value, index) => (
    (value + min[index]!) / 2
  ));
  const center = [0, 1, 2].map((axisIndex) => (
    axes[0]![axisIndex]! * mid[0]!
      + axes[1]![axisIndex]! * mid[1]!
      + axes[2]![axisIndex]! * mid[2]!
  )) as [number, number, number];
  const half = extents.map((value) => value / 2);
  const positions = new Float32Array(24);
  let offset = 0;
  for (const z of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const x of [-1, 1]) {
        for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
          positions[offset] = center[axisIndex]!
            + axes[0]![axisIndex]! * half[0]! * x
            + axes[1]![axisIndex]! * half[1]! * y
            + axes[2]![axisIndex]! * half[2]! * z;
          offset += 1;
        }
      }
    }
  }
  return {
    id: 'obb',
    kind: 'obb',
    positions,
    indices: new Uint32Array([
      0, 2, 1, 1, 2, 3,
      4, 5, 6, 5, 7, 6,
      0, 1, 4, 1, 5, 4,
      2, 6, 3, 3, 6, 7,
      0, 4, 2, 2, 4, 6,
      1, 3, 5, 3, 7, 5,
    ]),
    triangleCount: 12,
    volume: extents[0]! * extents[1]! * extents[2]!,
    axisStable: true,
  };
}

function fitCylinder(
  points: readonly Vector[],
  axis: Vector,
): ICESemanticProxyGeometryCandidate | undefined {
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  for (const point of points) {
    const along = dot(point, axis);
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
  }
  const halfHeight = (maxAlong - minAlong) / 2;
  if (halfHeight <= 0) return undefined;
  const centerAlong = (minAlong + maxAlong) / 2;
  const [basisX, basisY] = perpendicularBasis(axis);
  let radialCenterX = 0;
  let radialCenterY = 0;
  for (const point of points) {
    const delta = subtract(point, [
      axis[0] * dot(point, axis),
      axis[1] * dot(point, axis),
      axis[2] * dot(point, axis),
    ]);
    radialCenterX += dot(delta, basisX);
    radialCenterY += dot(delta, basisY);
  }
  radialCenterX /= points.length;
  radialCenterY /= points.length;
  const center = [0, 1, 2].map((index) => axis[index]! * centerAlong) as [
    number,
    number,
    number,
  ];
  for (let index = 0; index < 3; index += 1) {
    center[index] = center[index]! + basisX[index]! * radialCenterX
      + basisY[index]! * radialCenterY;
  }
  let radius = 0;
  for (const point of points) {
    const delta = subtract(point, center);
    const x = dot(delta, basisX);
    const y = dot(delta, basisY);
    radius = Math.max(radius, Math.hypot(x, y));
  }
  if (radius <= 0 || halfHeight / radius < 1.25) return undefined;

  const segments = 16;
  const positions = new Float32Array((segments * 2 + 2) * 3);
  const bottomCenter = segments * 2;
  const topCenter = bottomCenter + 1;
  for (let segment = 0; segment < segments; segment += 1) {
    const angle = segment / segments * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const bottom: Vector = [
      center[0] + basisX[0] * x + basisY[0] * y - axis[0] * halfHeight,
      center[1] + basisX[1] * x + basisY[1] * y - axis[1] * halfHeight,
      center[2] + basisX[2] * x + basisY[2] * y - axis[2] * halfHeight,
    ];
    const top: Vector = [
      center[0] + basisX[0] * x + basisY[0] * y + axis[0] * halfHeight,
      center[1] + basisX[1] * x + basisY[1] * y + axis[1] * halfHeight,
      center[2] + basisX[2] * x + basisY[2] * y + axis[2] * halfHeight,
    ];
    positions.set(bottom, segment * 3);
    positions.set(top, (segments + segment) * 3);
  }
  positions.set([
    center[0] - axis[0] * halfHeight,
    center[1] - axis[1] * halfHeight,
    center[2] - axis[2] * halfHeight,
  ], bottomCenter * 3);
  positions.set([
    center[0] + axis[0] * halfHeight,
    center[1] + axis[1] * halfHeight,
    center[2] + axis[2] * halfHeight,
  ], topCenter * 3);
  const indices: number[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    const bottom = segment;
    const bottomNext = next;
    const top = segments + segment;
    const topNext = segments + next;
    indices.push(bottom, bottomNext, top, bottomNext, topNext, top);
    indices.push(bottomCenter, bottomNext, bottom);
    indices.push(topCenter, top, topNext);
  }
  return {
    id: 'cylinder',
    kind: 'cylinder',
    positions,
    indices: new Uint32Array(indices),
    triangleCount: 64,
    volume: Math.PI * radius * radius * halfHeight * 2,
    axisStable: true,
  };
}

function weightedCovariance(samples: ICESemanticProxyFitSamples): Matrix3 {
  let weight = 0;
  const mean = [0, 0, 0];
  for (let index = 0; index < samples.areas.length; index += 1) {
    const area = samples.areas[index]!;
    weight += area;
    for (let axis = 0; axis < 3; axis += 1) {
      mean[axis] = mean[axis]! + samples.centroids[index * 3 + axis]! * area;
    }
  }
  for (let axis = 0; axis < 3; axis += 1) mean[axis] = mean[axis]! / weight;
  const covariance = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let index = 0; index < samples.areas.length; index += 1) {
    const area = samples.areas[index]!;
    const delta = [0, 1, 2].map((axis) => (
      samples.centroids[index * 3 + axis]! - mean[axis]!
    ));
    for (let row = 0; row < 3; row += 1) {
      for (let column = row; column < 3; column += 1) {
        covariance[row * 3 + column] = covariance[row * 3 + column]!
          + area * delta[row]! * delta[column]!;
      }
    }
  }
  covariance[3] = covariance[1]!;
  covariance[6] = covariance[2]!;
  covariance[7] = covariance[5]!;
  return covariance as unknown as Matrix3;
}

function symmetricEigen(matrix: Matrix3): {
  readonly values: readonly [number, number, number];
  readonly vectors: readonly [Vector, Vector, Vector];
} {
  const a = [
    [matrix[0], matrix[1], matrix[2]],
    [matrix[3], matrix[4], matrix[5]],
    [matrix[6], matrix[7], matrix[8]],
  ] as number[][];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const [p, q] = largestOffDiagonal(a);
    if (Math.abs(a[p]![q]!) <= 1e-12) break;
    const angle = 0.5 * Math.atan2(
      2 * a[p]![q]!,
      a[q]![q]! - a[p]![p]!,
    );
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const app = a[p]![p]!;
    const aqq = a[q]![q]!;
    const apq = a[p]![q]!;
    for (let index = 0; index < 3; index += 1) {
      if (index === p || index === q) continue;
      const aip = a[index]![p]!;
      const aiq = a[index]![q]!;
      a[index]![p] = cosine * aip - sine * aiq;
      a[p]![index] = a[index]![p]!;
      a[index]![q] = sine * aip + cosine * aiq;
      a[q]![index] = a[index]![q]!;
    }
    a[p]![p] = cosine * cosine * app
      - 2 * sine * cosine * apq
      + sine * sine * aqq;
    a[q]![q] = sine * sine * app
      + 2 * sine * cosine * apq
      + cosine * cosine * aqq;
    a[p]![q] = 0;
    a[q]![p] = 0;
    for (let row = 0; row < 3; row += 1) {
      const vip = v[row]![p]!;
      const viq = v[row]![q]!;
      v[row]![p] = cosine * vip - sine * viq;
      v[row]![q] = sine * vip + cosine * viq;
    }
  }
  const sorted = [0, 1, 2]
    .sort((left, right) => a[right]![right]! - a[left]![left]!)
    .map((column) => ({
      value: a[column]![column]!,
      vector: signedVector([v[0]![column]!, v[1]![column]!, v[2]![column]!]),
    }));
  return {
    values: [
      sorted[0]!.value,
      sorted[1]!.value,
      sorted[2]!.value,
    ],
    vectors: [
      sorted[0]!.vector,
      sorted[1]!.vector,
      sorted[2]!.vector,
    ],
  };
}

function signedVector(vector: Vector): Vector {
  const absolute = vector.map(Math.abs);
  let pivot = 0;
  for (let index = 1; index < 3; index += 1) {
    if (absolute[index]! > absolute[pivot]!) pivot = index;
  }
  const sign = vector[pivot]! < 0 ? -1 : 1;
  return vector.map((value) => value * sign) as unknown as Vector;
}

function largestOffDiagonal(matrix: readonly number[][]): readonly [number, number] {
  let p = 0;
  let q = 1;
  let maximum = Math.abs(matrix[0]![1]!);
  for (const [row, column] of [[0, 2], [1, 2]] as const) {
    const value = Math.abs(matrix[row]![column]!);
    if (value > maximum) {
      maximum = value;
      p = row;
      q = column;
    }
  }
  return [p, q];
}

function perpendicularBasis(axis: Vector): readonly [Vector, Vector] {
  const reference = Math.abs(axis[0]) <= Math.abs(axis[1])
    && Math.abs(axis[0]) <= Math.abs(axis[2])
    ? [1, 0, 0] as const
    : Math.abs(axis[1]) <= Math.abs(axis[2])
      ? [0, 1, 0] as const
      : [0, 0, 1] as const;
  const basisX = normalize(cross(axis, reference));
  return [basisX, normalize(cross(axis, basisX))];
}

function allPoints(samples: ICESemanticProxyFitSamples): readonly Vector[] {
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

function boundsDiagonal(samples: ICESemanticProxyFitSamples): number {
  return Math.hypot(
    samples.bounds.max[0] - samples.bounds.min[0],
    samples.bounds.max[1] - samples.bounds.min[1],
    samples.bounds.max[2] - samples.bounds.min[2],
  );
}

function validateSamples(samples: ICESemanticProxyFitSamples): void {
  if (
    samples.vertices.length === 0
    || samples.vertices.length % 3 !== 0
    || samples.centroids.length % 3 !== 0
    || samples.centroids.length / 3 !== samples.areas.length
    || samples.areas.length === 0
    || [...samples.bounds.min, ...samples.bounds.max]
      .some((value) => !Number.isFinite(value))
  ) {
    throw new Error('ICE3_TOOL_PROXY_FIT_INVALID: fit samples are invalid');
  }
}

function cross(left: Vector, right: Vector): Vector {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(vector: Vector): Vector {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtract(left: Vector, right: Vector): Vector {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function dot(left: Vector, right: Vector): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
