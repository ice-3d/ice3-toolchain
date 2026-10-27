export interface ICEPreparedGeometry {
  readonly id: string;
  readonly positions: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly edgeIndices: Uint16Array | Uint32Array;
  readonly bounds: Readonly<{
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }>;
}

export interface ICEPrepareMeshOptions {
  readonly id?: string;
  readonly mode?: 4 | 5 | 6;
}

interface EdgeRecord {
  readonly starts: [number, number];
  count: number;
  readonly normals: [number, number, number][];
}

export function prepareMesh(
  positions: Float32Array,
  indices: Uint32Array,
  creaseAngleDegrees = 30,
  options: ICEPrepareMeshOptions = {},
): ICEPreparedGeometry {
  if (positions.length === 0 || positions.length % 3 !== 0) {
    throw geometryError('positions must contain a non-empty multiple of 3 values');
  }
  if (positions.some((value) => !Number.isFinite(value))) {
    throw geometryError('positions must be finite');
  }
  if (!Number.isFinite(creaseAngleDegrees)) {
    throw geometryError('crease angle must be finite');
  }
  const triangleIndices = triangulate(indices, options.mode ?? 4, positions.length / 3);
  const bounds = computeBounds(positions);
  const welded = weldVertexIndices(positions);
  const edges = new Map<string, EdgeRecord>();

  for (let index = 0; index < triangleIndices.length; index += 3) {
    const triangle = [
      triangleIndices[index]!,
      triangleIndices[index + 1]!,
      triangleIndices[index + 2]!,
    ] as const;
    const normal = faceNormal(positions, triangle);
    const weldedTriangle = triangle.map((vertex) => welded[vertex]!) as [
      number,
      number,
      number,
    ];
    for (let edge = 0; edge < 3; edge += 1) {
      const first = weldedTriangle[edge]!;
      const second = weldedTriangle[(edge + 1) % 3]!;
      const key = edgeKey(first, second);
      const existing = edges.get(key);
      if (existing) {
        existing.count += 1;
        existing.normals.push(normal);
      } else {
        edges.set(key, {
          starts: first <= second ? [first, second] : [second, first],
          count: 1,
          normals: [normal],
        });
      }
    }
  }

  const creaseCosine = Math.cos(clamp(creaseAngleDegrees, 0, 180) * Math.PI / 180);
  const emitted: number[] = [];
  for (const edge of edges.values()) {
    const crease = edge.normals.some((normal) => (
      dot(edge.normals[0]!, normal) <= creaseCosine + 1e-6
    ));
    if (edge.count === 1 || crease) {
      emitted.push(edge.starts[0], edge.starts[1]);
    }
  }

  const vertexCount = positions.length / 3;
  return {
    id: options.id ?? 'prepared-geometry',
    positions: positions.slice(),
    indices: toIndexArray(triangleIndices, vertexCount),
    edgeIndices: toIndexArray(emitted, vertexCount),
    bounds,
  };
}

function triangulate(
  indices: Uint32Array,
  mode: 4 | 5 | 6,
  vertexCount: number,
): number[] {
  for (const index of indices) {
    if (index >= vertexCount) {
      throw geometryError('source index is outside the position array');
    }
  }
  if (mode === 4) {
    if (indices.length % 3 !== 0) {
      throw geometryError('triangle index count must be a multiple of 3');
    }
    return [...indices];
  }
  if (indices.length < 3) {
    throw geometryError('strip and fan modes require at least 3 indices');
  }
  const output: number[] = [];
  if (mode === 5) {
    for (let index = 0; index + 2 < indices.length; index += 1) {
      const first = indices[index]!;
      const second = indices[index + 1]!;
      const third = indices[index + 2]!;
      output.push(
        ...(index % 2 === 0
          ? [first, second, third]
          : [second, first, third]),
      );
    }
    return output;
  }
  for (let index = 1; index + 1 < indices.length; index += 1) {
    output.push(indices[0]!, indices[index]!, indices[index + 1]!);
  }
  return output;
}

function computeBounds(positions: Float32Array): ICEPreparedGeometry['bounds'] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis]!;
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  return { min, max };
}

function weldVertexIndices(positions: Float32Array): number[] {
  const welded: number[] = [];
  const representatives = new Map<string, number>();
  for (let index = 0; index < positions.length; index += 3) {
    const key = [
      quantize(positions[index]!),
      quantize(positions[index + 1]!),
      quantize(positions[index + 2]!),
    ].join(',');
    const existing = representatives.get(key);
    if (existing === undefined) {
      representatives.set(key, index / 3);
      welded.push(index / 3);
    } else {
      welded.push(existing);
    }
  }
  return welded;
}

function faceNormal(
  positions: Float32Array,
  triangle: readonly [number, number, number],
): [number, number, number] {
  const a = point(positions, triangle[0]);
  const b = point(positions, triangle[1]);
  const c = point(positions, triangle[2]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const normal: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...normal);
  return length > 0
    ? [normal[0] / length, normal[1] / length, normal[2] / length]
    : [0, 0, 0];
}

function point(
  positions: Float32Array,
  index: number,
): readonly [number, number, number] {
  return [
    positions[index * 3]!,
    positions[index * 3 + 1]!,
    positions[index * 3 + 2]!,
  ];
}

function toIndexArray(
  values: readonly number[],
  vertexCount: number,
): Uint16Array | Uint32Array {
  return vertexCount <= 65_535
    ? new Uint16Array(values)
    : new Uint32Array(values);
}

function edgeKey(first: number, second: number): string {
  return first <= second ? `${first}:${second}` : `${second}:${first}`;
}

function quantize(value: number): number {
  return Math.round(value * 100_000);
}

function dot(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function geometryError(message: string): Error {
  return new Error(`ICE3_TOOL_INVALID_GEOMETRY: ${message}`);
}
