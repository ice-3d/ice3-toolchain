import type {
  IfcAPI,
  PlacedGeometry,
} from 'web-ifc';

export interface IIfcGeometryPart {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
  readonly color: readonly [number, number, number, number];
}

export function readPlacedGeometry(
  api: IfcAPI,
  modelID: number,
  placed: PlacedGeometry,
): IIfcGeometryPart {
  const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
  try {
    const vertices = api.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize(),
    );
    const indices = api.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize(),
    );
    if (
      vertices.length === 0
      || vertices.length % 6 !== 0
      || indices.length === 0
      || indices.length % 3 !== 0
    ) {
      throw new Error('ICE3_TOOL_IFC_GEOMETRY_INVALID');
    }
    const positions = new Float32Array(new ArrayBuffer(
      (vertices.length / 6) * 3 * 4,
    ));
    for (
      let source = 0, target = 0;
      source < vertices.length;
      source += 6, target += 3
    ) {
      const x = vertices[source]!;
      const y = vertices[source + 1]!;
      const z = vertices[source + 2]!;
      const matrix = placed.flatTransformation;
      const worldX = matrix[0]! * x + matrix[4]! * y
        + matrix[8]! * z + matrix[12]!;
      const worldY = matrix[1]! * x + matrix[5]! * y
        + matrix[9]! * z + matrix[13]!;
      const worldZ = matrix[2]! * x + matrix[6]! * y
        + matrix[10]! * z + matrix[14]!;
      positions[target] = worldX;
      positions[target + 1] = worldZ;
      positions[target + 2] = -worldY;
      if (
        !Number.isFinite(positions[target])
        || !Number.isFinite(positions[target + 1])
        || !Number.isFinite(positions[target + 2])
      ) {
        throw new Error('ICE3_TOOL_IFC_GEOMETRY_INVALID');
      }
    }
    const vertexCount = positions.length / 3;
    for (const index of indices) {
      if (index >= vertexCount) {
        throw new Error('ICE3_TOOL_IFC_GEOMETRY_INVALID');
      }
    }
    const copiedIndices = new Uint32Array(new ArrayBuffer(
      indices.byteLength,
    ));
    copiedIndices.set(indices);
    return {
      positions,
      indices: copiedIndices,
      color: [
        clampColor(placed.color.x),
        clampColor(placed.color.y),
        clampColor(placed.color.z),
        clampColor(placed.color.w),
      ],
    };
  } finally {
    geometry.delete();
  }
}

function clampColor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
