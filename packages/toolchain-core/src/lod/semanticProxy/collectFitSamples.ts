import type { ICEWorkspaceGeometry } from '../createGeometryWorkspace.js';
import type { ICESemanticProxyFitSamples } from './types.js';

export function collectFitSamples(
  geometries: readonly ICEWorkspaceGeometry[],
): ICESemanticProxyFitSamples {
  if (geometries.length === 0) throw invalidFit('geometry is empty');
  const vertices: number[] = [];
  const centroids: number[] = [];
  const areas: number[] = [];
  const vertexKeys = new Set<string>();
  const centroidKeys = new Set<string>();
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const geometry of geometries) {
    validateGeometry(geometry);
    for (let offset = 0; offset < geometry.positions.length; offset += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = geometry.positions[offset + axis]!;
        min[axis] = Math.min(min[axis]!, value);
        max[axis] = Math.max(max[axis]!, value);
      }
    }
    for (let offset = 0; offset < geometry.indices.length; offset += 3) {
      const a = vertex(geometry, geometry.indices[offset]!);
      const b = vertex(geometry, geometry.indices[offset + 1]!);
      const c = vertex(geometry, geometry.indices[offset + 2]!);
      const area = triangleArea(a, b, c);
      if (area <= 1e-12) continue;
      insertUnique(vertices, vertexKeys, a);
      insertUnique(vertices, vertexKeys, b);
      insertUnique(vertices, vertexKeys, c);
      insertUnique(centroids, centroidKeys, [
        (a[0] + b[0] + c[0]) / 3,
        (a[1] + b[1] + c[1]) / 3,
        (a[2] + b[2] + c[2]) / 3,
      ]);
      areas.push(area);
    }
  }
  if (areas.length === 0) throw invalidFit('no positive-area triangles');
  return {
    vertices: new Float32Array(vertices),
    centroids: new Float32Array(centroids),
    areas: new Float32Array(areas),
    bounds: { min, max },
  };
}

function validateGeometry(geometry: ICEWorkspaceGeometry): void {
  if (
    geometry.positions.length === 0
    || geometry.positions.length % 3 !== 0
    || geometry.positions.some((value) => !Number.isFinite(value))
    || geometry.indices.length === 0
    || geometry.indices.length % 3 !== 0
    || geometry.indices.some((index) => index >= geometry.positions.length / 3)
  ) {
    throw invalidFit('geometry buffers are invalid');
  }
}

function vertex(
  geometry: ICEWorkspaceGeometry,
  index: number,
): readonly [number, number, number] {
  return [
    geometry.positions[index * 3]!,
    geometry.positions[index * 3 + 1]!,
    geometry.positions[index * 3 + 2]!,
  ];
}

function triangleArea(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(
    ab[1]! * ac[2]! - ab[2]! * ac[1]!,
    ab[2]! * ac[0]! - ab[0]! * ac[2]!,
    ab[0]! * ac[1]! - ab[1]! * ac[0]!,
  ) / 2;
}

function insertUnique(
  output: number[],
  keys: Set<string>,
  point: readonly [number, number, number],
): void {
  const key = point.map(quantize).join(',');
  if (keys.has(key)) return;
  keys.add(key);
  output.push(...point);
}

function quantize(value: number): number {
  return Math.round(value * 100_000);
}

function invalidFit(message: string): Error {
  return new Error(`ICE3_TOOL_PROXY_FIT_INVALID: ${message}`);
}
