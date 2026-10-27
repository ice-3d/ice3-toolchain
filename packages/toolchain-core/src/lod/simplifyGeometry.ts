import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

export interface ICESimplifyGeometryOptions {
  readonly targetTriangles: number;
  readonly minimumTriangles: number;
  readonly vertexColors?: Float32Array;
}

export interface ICESimplifiedGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly errorMeters: number;
  readonly sourceTriangles: number;
  readonly triangleCount: number;
  readonly preservedSource: boolean;
  readonly colors?: Float32Array;
}

export async function simplifyGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  options: ICESimplifyGeometryOptions,
): Promise<ICESimplifiedGeometry> {
  validateGeometry(positions, indices);
  validateTarget(options);
  const sourceTriangles = indices.length / 3;
  validateColors(positions, options.vertexColors);
  if (sourceTriangles <= options.minimumTriangles) {
    return preserveSource(
      positions,
      indices,
      sourceTriangles,
      options.vertexColors,
    );
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
  const welded = weldGeometry(
    positions,
    indices,
    options.vertexColors,
  );
  try {
    [simplifiedIndices, relativeError] = MeshoptSimplifier.simplify(
      welded.indices,
      welded.positions,
      3,
      targetTriangles * 3,
      1,
      ['LockBorder', 'ErrorClamped'],
    );
  } catch {
    return preserveSource(
      positions,
      indices,
      sourceTriangles,
      options.vertexColors,
    );
  }
  if (
    simplifiedIndices.length < 3
    || simplifiedIndices.length % 3 !== 0
    || !Number.isFinite(relativeError)
  ) {
    return preserveSource(
      positions,
      indices,
      sourceTriangles,
      options.vertexColors,
    );
  }

  const compacted = compactReferencedVertices(
    welded.positions,
    simplifiedIndices,
    welded.colors,
  );
  const scale = MeshoptSimplifier.getScale(welded.positions, 3);
  return {
    positions: compacted.positions,
    indices: compacted.indices,
    errorMeters: Math.max(0, relativeError * scale),
    sourceTriangles,
    triangleCount: compacted.indices.length / 3,
    preservedSource: false,
    ...(compacted.colors ? { colors: compacted.colors } : {}),
  };
}

function weldGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  colors?: Float32Array,
): {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
} {
  const colorComponents = colors ? colors.length / (positions.length / 3) : 0;
  const targetByKey = new Map<string, number>();
  const welded: number[] = [];
  const weldedColors: number[] = [];
  const weldedIndices = new Uint32Array(indices.length);
  for (let offset = 0; offset < indices.length; offset += 1) {
    const source = indices[offset]!;
    const keyParts = [
      quantize(positions[source * 3]!),
      quantize(positions[source * 3 + 1]!),
      quantize(positions[source * 3 + 2]!),
    ];
    for (let channel = 0; channel < colorComponents; channel += 1) {
      keyParts.push(quantize(colors![source * colorComponents + channel]!));
    }
    const key = keyParts.join(',');
    let target = targetByKey.get(key);
    if (target === undefined) {
      target = targetByKey.size;
      targetByKey.set(key, target);
      welded.push(
        positions[source * 3]!,
        positions[source * 3 + 1]!,
        positions[source * 3 + 2]!,
      );
      for (let channel = 0; channel < colorComponents; channel += 1) {
        weldedColors.push(colors![source * colorComponents + channel]!);
      }
    }
    weldedIndices[offset] = target;
  }
  return {
    positions: new Float32Array(welded),
    indices: weldedIndices,
    ...(colors ? { colors: new Float32Array(weldedColors) } : {}),
  };
}

function compactReferencedVertices(
  positions: Float32Array,
  indices: Uint32Array,
  colors?: Float32Array,
): {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
} {
  const colorComponents = colors ? colors.length / (positions.length / 3) : 0;
  const remap = new Map<number, number>();
  const compacted: number[] = [];
  const compactedColors: number[] = [];
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
      for (let channel = 0; channel < colorComponents; channel += 1) {
        compactedColors.push(colors![source * colorComponents + channel]!);
      }
    }
    output[offset] = target;
  }
  return {
    positions: new Float32Array(compacted),
    indices: output,
    ...(colors ? { colors: new Float32Array(compactedColors) } : {}),
  };
}

function preserveSource(
  positions: Float32Array,
  indices: Uint32Array,
  sourceTriangles: number,
  colors?: Float32Array,
): ICESimplifiedGeometry {
  return {
    positions: positions.slice(),
    indices: indices.slice(),
    errorMeters: 0,
    sourceTriangles,
    triangleCount: sourceTriangles,
    preservedSource: true,
    ...(colors ? { colors: colors.slice() } : {}),
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

function validateColors(
  positions: Float32Array,
  colors?: Float32Array,
): void {
  if (!colors) return;
  const vertexCount = positions.length / 3;
  if (
    colors.length !== vertexCount * 3
    && colors.length !== vertexCount * 4
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: vertex color count is invalid');
  }
  if (colors.some((value) => !Number.isFinite(value))) {
    throw new Error('ICE3_TOOL_LOD_INVALID: vertex colors must be finite');
  }
}

function quantize(value: number): number {
  return Math.round(value * 100_000);
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
