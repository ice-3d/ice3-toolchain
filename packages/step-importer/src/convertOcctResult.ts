import {
  Document,
  NodeIO,
  type Material,
  type Mesh,
  type Node,
} from '@gltf-transform/core';

export interface ICEImportedGeometryStats {
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
}

export interface OcctImportFace {
  readonly first: number;
  readonly last: number;
  readonly color?: readonly number[] | null;
}

export interface OcctImportMesh {
  readonly name?: string;
  readonly color?: readonly number[] | null;
  readonly brep_faces?: readonly OcctImportFace[];
  readonly attributes?: {
    readonly position?: {
      readonly array?: readonly number[];
    };
    readonly normal?: {
      readonly array?: readonly number[];
    };
  };
  readonly index?: {
    readonly array?: readonly number[];
  };
}

export interface OcctImportNode {
  readonly name?: string;
  readonly meshes?: readonly number[];
  readonly children?: readonly OcctImportNode[];
}

export interface OcctImportResult {
  readonly success?: boolean;
  readonly root?: OcctImportNode;
  readonly meshes?: readonly OcctImportMesh[];
}

type Rgba = readonly [number, number, number, number];
type HierarchyEntry = Readonly<{
  source: OcctImportNode;
  node: Node;
  parent?: Node;
}>;

const DEFAULT_COLOR: Rgba = [0.72, 0.74, 0.76, 1];

export async function convertOcctResult(
  result: OcctImportResult,
  outputPath: string,
): Promise<ICEImportedGeometryStats> {
  if (result.success !== true || !result.root) {
    throw new Error('ICE3_TOOL_STEP_IMPORT_FAILED');
  }
  const sourceMeshes = result.meshes ?? [];
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene('source');
  document.getRoot().setDefaultScene(scene);
  const usedNames = new Set<string>();
  const hierarchy: HierarchyEntry[] = [];

  function addHierarchy(
    source: OcctImportNode,
    parent?: Node,
  ): Node {
    const node = document.createNode(stableNodeName(
      source.name,
      usedNames.size,
      usedNames,
    ));
    if (parent) parent.addChild(node);
    hierarchy.push({
      source,
      node,
      ...(parent ? { parent } : {}),
    });
    for (const child of source.children ?? []) addHierarchy(child, node);
    return node;
  }

  const rootNode = addHierarchy(result.root);
  scene.addChild(rootNode);
  const materials = new Map<string, Material>();
  let triangleCount = 0;
  let vertexCount = 0;
  let meshCount = 0;

  for (const entry of hierarchy) {
    for (const sourceMeshIndex of entry.source.meshes ?? []) {
      const sourceMesh = sourceMeshes[sourceMeshIndex];
      if (!sourceMesh) {
        throw new Error(
          `ICE3_TOOL_IMPORT_GEOMETRY_INVALID: mesh ${sourceMeshIndex} is missing`,
        );
      }
      const converted = createMesh(
        document,
        buffer,
        sourceMesh,
        entry.node,
        usedNames,
        materials,
      );
      if (!converted) continue;
      meshCount += 1;
      triangleCount += converted.triangleCount;
      vertexCount += converted.vertexCount;
    }
  }

  if (triangleCount === 0) {
    throw new Error('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
  }

  await new NodeIO().write(outputPath, document);
  return {
    triangleCount,
    vertexCount,
    nodeCount: usedNames.size,
    meshCount,
  };
}

function createMesh(
  document: Document,
  buffer: ReturnType<Document['createBuffer']>,
  source: OcctImportMesh,
  parent: Node,
  usedNames: Set<string>,
  materials: Map<string, Material>,
): Readonly<{ triangleCount: number; vertexCount: number }> | undefined {
  const positions = source.attributes?.position?.array;
  const indices = source.index?.array;
  if (!positions || positions.length === 0) return undefined;
  if (positions.length % 3 !== 0) {
    throw new Error('ICE3_TOOL_IMPORT_GEOMETRY_INVALID: position length');
  }
  if (!indices || indices.length === 0 || indices.length % 3 !== 0) {
    throw new Error('ICE3_TOOL_IMPORT_GEOMETRY_INVALID: triangle indices');
  }
  const vertexCount = positions.length / 3;
  for (const value of positions) {
    if (!Number.isFinite(value)) {
      throw new Error('ICE3_TOOL_IMPORT_GEOMETRY_INVALID: non-finite position');
    }
  }
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new Error('ICE3_TOOL_IMPORT_GEOMETRY_INVALID: index range');
    }
  }

  const mesh = document.createMesh(stableNodeName(
    source.name,
    usedNames.size,
    usedNames,
  ));
  const node = document.createNode(mesh.getName() ?? '')
    .setMesh(mesh);
  parent.addChild(node);

  const positionAccessor = document.createAccessor()
    .setType('VEC3')
    .setArray(convertPositions(positions))
    .setBuffer(buffer);
  const normalArray = source.attributes?.normal?.array;
  const normalAccessor = normalArray?.length === positions.length
    ? document.createAccessor()
      .setType('VEC3')
      .setArray(convertNormals(normalArray))
      .setBuffer(buffer)
    : undefined;

  for (const range of triangleRanges(source, indices.length / 3)) {
    const primitive = document.createPrimitive()
      .setAttribute('POSITION', positionAccessor)
      .setIndices(document.createAccessor()
        .setType('SCALAR')
        .setArray(new Uint32Array(indices.slice(
          range.first * 3,
          (range.last + 1) * 3,
        )))
        .setBuffer(buffer));
    if (normalAccessor) {
      primitive.setAttribute('NORMAL', normalAccessor);
    }
    primitive.setMaterial(getMaterial(
      document,
      materials,
      range.color ?? DEFAULT_COLOR,
    ));
    mesh.addPrimitive(primitive);
  }

  return {
    triangleCount: indices.length / 3,
    vertexCount,
  };
}

function triangleRanges(
  source: OcctImportMesh,
  triangleCount: number,
): readonly Readonly<{ first: number; last: number; color: Rgba }>[] {
  const fallback = normalizeColor(source.color) ?? DEFAULT_COLOR;
  const faces = source.brep_faces ?? [];
  if (faces.length === 0) {
    return [{ first: 0, last: triangleCount - 1, color: fallback }];
  }
  return faces.map((face) => {
    if (
      !Number.isInteger(face.first)
      || !Number.isInteger(face.last)
      || face.first < 0
      || face.last < face.first
      || face.last >= triangleCount
    ) {
      throw new Error('ICE3_TOOL_IMPORT_GEOMETRY_INVALID: face range');
    }
    return {
      first: face.first,
      last: face.last,
      color: normalizeColor(face.color) ?? fallback,
    };
  });
}

function getMaterial(
  document: Document,
  materials: Map<string, Material>,
  color: Rgba,
): Material {
  const key = color.join(',');
  const existing = materials.get(key);
  if (existing) return existing;
  const material = document.createMaterial(`step/material/${materials.size}`)
    .setBaseColorFactor([...color])
    .setMetallicFactor(0)
    .setRoughnessFactor(1);
  materials.set(key, material);
  return material;
}

function normalizeColor(value: readonly number[] | null | undefined): Rgba | undefined {
  if (!value || value.length < 3) return undefined;
  const components = value.slice(0, 3);
  if (!components.every((component) => (
    Number.isFinite(component) && component >= 0 && component <= 1
  ))) {
    return DEFAULT_COLOR;
  }
  return [components[0]!, components[1]!, components[2]!, 1];
}

function convertPositions(
  positions: readonly number[],
): Float32Array<ArrayBuffer> {
  const output = new Float32Array(new ArrayBuffer(positions.length * 4));
  for (let index = 0; index < positions.length; index += 3) {
    output[index] = positions[index]!;
    output[index + 1] = positions[index + 2]!;
    output[index + 2] = -positions[index + 1]!;
  }
  return output;
}

function convertNormals(
  normals: readonly number[],
): Float32Array<ArrayBuffer> {
  return convertPositions(normals);
}

function stableNodeName(
  rawName: string | undefined,
  ordinal: number,
  usedNames: Set<string>,
): string {
  const base = rawName?.trim() || `step/node/${ordinal}`;
  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    candidate = `${base}[${suffix}]`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}
