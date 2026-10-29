import {
  Logger,
  NodeIO,
  type Accessor,
  type Document,
  type Mesh,
  type Node,
} from '@gltf-transform/core';

export interface IObjCanonicalizeOptions {
  readonly assetId: string;
  readonly warnings: readonly string[];
}

export interface IObjSourceStats {
  readonly outputPath: string;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly sourceOrigin: readonly [number, number, number];
  readonly warnings: readonly string[];
}

export async function canonicalizeObjGlb(
  rawGlbPath: string,
  outputPath: string,
  options: IObjCanonicalizeOptions,
): Promise<IObjSourceStats> {
  const document = await new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.ERROR))
    .read(rawGlbPath);
  removeUnsupportedResources(document);
  const nodes = document.getRoot().listNodes();
  let triangleCount = 0;
  let vertexCount = 0;
  let meshCount = 0;
  for (const [ordinal, node] of nodes.entries()) {
    const sourceName = cleanNodeName(node.getName(), ordinal);
    node.setName(sourceName);
    const mesh = node.getMesh();
    if (mesh) {
      meshCount += 1;
      for (const primitive of mesh.listPrimitives()) {
        const indexCount = primitive.getIndices()?.getCount()
          ?? primitive.getAttribute('POSITION')?.getCount()
          ?? 0;
        if (indexCount % 3 !== 0) {
          throw new Error('ICE3_TOOL_OBJ_IMPORT_FAILED');
        }
        for (const semantic of primitive.listSemantics()) {
          if (
            semantic.startsWith('COLOR_')
            || semantic.startsWith('TEXCOORD_')
          ) {
            primitive.setAttribute(semantic, null);
          }
        }
        const position = primitive.getAttribute('POSITION');
        const indices = primitive.getIndices();
        vertexCount += position?.getCount() ?? 0;
        triangleCount += (indices?.getCount() ?? position?.getCount() ?? 0) / 3;
      }
    }
    node.setExtras({
      ice3: {
        selectionId: `${options.assetId}/obj/node/${ordinal}`,
        displayName: sourceName,
        obj: {
          objectType: mesh ? 'MESH' : 'EMPTY',
          sourceName,
          materialNames: mesh ? materialNames(mesh) : [],
        },
      },
    });
  }
  if (triangleCount <= 0) throw new Error('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');

  for (const material of document.getRoot().listMaterials()) {
    material.setMetallicFactor(0);
    material.setRoughnessFactor(1);
  }
  const bounds = worldBounds(nodes);
  if (!bounds) throw new Error('ICE3_TOOL_OBJ_GEOMETRY_INVALID');
  const sourceOrigin: readonly [number, number, number] = [
    bounds.min[0],
    0,
    bounds.min[2],
  ];
  applyGeometryOrigin(nodes, sourceOrigin);
  const asset = document.getRoot().getAsset();
  asset.generator = 'ICE3 Toolchain OBJ Adapter';
  asset.extras = {
    ice3: {
      coordinateSystem: {
        handedness: 'right',
        upAxis: 'y',
        linearUnit: 'meter',
      },
      obj: {
        converter: 'assimpjs',
        converterVersion: '0.0.10',
        unitAssumption: 'meter',
        sourceOrigin: [...sourceOrigin],
      },
    },
  };
  await new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.ERROR))
    .write(outputPath, document);
  return {
    outputPath,
    triangleCount,
    vertexCount,
    nodeCount: nodes.length,
    meshCount,
    sourceOrigin,
    warnings: [...new Set(options.warnings)].sort(),
  };
}

function materialNames(mesh: Mesh): readonly string[] {
  return [...new Set(
    mesh.listPrimitives()
      .map((primitive) => primitive.getMaterial()?.getName())
      .filter((name): name is string => Boolean(name)),
  )].sort();
}

function cleanNodeName(value: string, ordinal: number): string {
  const normalized = value
    .replace(/\.obj$/iu, '')
    .trim();
  if (!normalized) return `OBJ Root ${ordinal}`;
  return ordinal === 0 && /\.obj$/iu.test(value)
    ? 'OBJ Root'
    : normalized;
}

function removeUnsupportedResources(document: Document): void {
  const root = document.getRoot();
  for (const property of [
    ...root.listAnimations(),
    ...root.listSkins(),
    ...root.listCameras(),
    ...root.listTextures(),
  ]) {
    property.dispose();
  }
}

function worldBounds(nodes: readonly Node[]): {
  min: [number, number, number];
  max: [number, number, number];
} | undefined {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const localMin = position.getMin([]);
      const localMax = position.getMax([]);
      for (let corner = 0; corner < 8; corner += 1) {
        const local = [
          (corner & 1) === 0 ? localMin[0]! : localMax[0]!,
          (corner & 2) === 0 ? localMin[1]! : localMax[1]!,
          (corner & 4) === 0 ? localMin[2]! : localMax[2]!,
        ];
        const world = [
          matrix[0]! * local[0]! + matrix[4]! * local[1]!
            + matrix[8]! * local[2]! + matrix[12]!,
          matrix[1]! * local[0]! + matrix[5]! * local[1]!
            + matrix[9]! * local[2]! + matrix[13]!,
          matrix[2]! * local[0]! + matrix[6]! * local[1]!
            + matrix[10]! * local[2]! + matrix[14]!,
        ];
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis]!, world[axis]!);
          max[axis] = Math.max(max[axis]!, world[axis]!);
        }
      }
    }
  }
  return min.every(Number.isFinite) && max.every(Number.isFinite)
    ? { min, max }
    : undefined;
}

function applyGeometryOrigin(
  nodes: readonly Node[],
  origin: readonly [number, number, number],
): void {
  const seen = new Set<Accessor>();
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position || seen.has(position)) continue;
      seen.add(position);
      const source = position.getArray();
      if (!source || source.length % 3 !== 0) {
        throw new Error('ICE3_TOOL_OBJ_GEOMETRY_INVALID');
      }
      const shifted = new Float32Array(source.length);
      for (let index = 0; index < source.length; index += 3) {
        const x = source[index]! - origin[0];
        const y = source[index + 1]! - origin[1];
        const z = source[index + 2]! - origin[2];
        if (![x, y, z].every(Number.isFinite)) {
          throw new Error('ICE3_TOOL_OBJ_GEOMETRY_INVALID');
        }
        shifted[index] = x;
        shifted[index + 1] = y;
        shifted[index + 2] = z;
      }
      position.setArray(shifted);
    }
  }
}
