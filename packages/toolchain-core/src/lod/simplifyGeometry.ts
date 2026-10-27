import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

export interface ICESimplifyGeometryOptions {
  readonly targetTriangles: number;
  readonly minimumTriangles: number;
}

export interface ICESimplifiedGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly errorMeters: number;
  readonly sourceTriangles: number;
  readonly triangleCount: number;
  readonly preservedSource: boolean;
}

export async function simplifyGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  options: ICESimplifyGeometryOptions,
): Promise<ICESimplifiedGeometry> {
  validateGeometry(positions, indices);
  validateTarget(options);
  const sourceTriangles = indices.length / 3;
  if (sourceTriangles <= options.minimumTriangles) {
    return preserveSource(positions, indices, sourceTriangles);
  }

  await MeshoptSimplifier.ready;
  if (!MeshoptSimplifier.supported) {
    throw new Error(
      'ICE3_TOOL_LOD_UNSUPPORTED: geometry simplifier is not supported',
    );
  }
  const targetTriangles = Math.max(
    options.minimumTriangles,
    Math.min(options.targetTriangles, sourceTriangles),
  );
  let simplifiedIndices: Uint32Array;
  let relativeError: number;
  try {
    [simplifiedIndices, relativeError] = MeshoptSimplifier.simplify(
      indices,
      positions,
      3,
      targetTriangles * 3,
      1,
      ['LockBorder', 'ErrorClamped'],
    );
  } catch {
    return preserveSource(positions, indices, sourceTriangles);
  }
  if (
    simplifiedIndices.length < 3
    || simplifiedIndices.length % 3 !== 0
    || !Number.isFinite(relativeError)
  ) {
    return preserveSource(positions, indices, sourceTriangles);
  }

  const compacted = compactReferencedVertices(positions, simplifiedIndices);
  const scale = MeshoptSimplifier.getScale(positions, 3);
  return {
    positions: compacted.positions,
    indices: compacted.indices,
    errorMeters: Math.max(0, relativeError * scale),
    sourceTriangles,
    triangleCount: compacted.indices.length / 3,
    preservedSource: false,
  };
}

function compactReferencedVertices(
  positions: Float32Array,
  indices: Uint32Array,
): {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
} {
  const remap = new Map<number, number>();
  const compacted: number[] = [];
  const output = new Uint32Array(indices.length);
  for (let offset = 0; offset < indices.length; offset += 1) {
    const source = indices[offset]!;
    let target = remap.get(source);
    if (target === undefined) {
      target = remap.size;
      remap.set(source, target);
      compacted.push(
        positions[source * 3]!,
        positions[source * 3 + 1]!,
        positions[source * 3 + 2]!,
      );
    }
    output[offset] = target;
  }
  return {
    positions: new Float32Array(compacted),
    indices: output,
  };
}

function preserveSource(
  positions: Float32Array,
  indices: Uint32Array,
  sourceTriangles: number,
): ICESimplifiedGeometry {
  return {
    positions: positions.slice(),
    indices: indices.slice(),
    errorMeters: 0,
    sourceTriangles,
    triangleCount: sourceTriangles,
    preservedSource: true,
  };
}

function validateGeometry(
  positions: Float32Array,
  indices: Uint32Array,
): void {
  if (
    positions.length === 0
    || positions.length % 3 !== 0
    || positions.some((value) => !Number.isFinite(value))
    || indices.length === 0
    || indices.length % 3 !== 0
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: geometry buffers are invalid');
  }
  const vertexCount = positions.length / 3;
  if (indices.some((index) => index >= vertexCount)) {
    throw new Error('ICE3_TOOL_LOD_INVALID: geometry index is out of range');
  }
}

function validateTarget(options: ICESimplifyGeometryOptions): void {
  if (
    !Number.isInteger(options.targetTriangles)
    || options.targetTriangles < 1
    || !Number.isInteger(options.minimumTriangles)
    || options.minimumTriangles < 1
  ) {
    throw new Error(
      'ICE3_TOOL_LOD_INVALID: triangle targets must be positive integers',
    );
  }
}
