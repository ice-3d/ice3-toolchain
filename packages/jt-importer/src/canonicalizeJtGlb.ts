import {
  Logger,
  NodeIO,
  type Document,
  type Mesh,
  type Node,
} from '@gltf-transform/core';

export interface IJtCanonicalizeOptions {
  readonly assetId: string;
}

export interface IJtSourceStats {
  readonly outputPath: string;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly instanceNodeCount: number;
  readonly sourceOrigin: readonly [number, number, number];
  readonly warnings: readonly string[];
}

export async function canonicalizeJtGlb(
  rawGlbPath: string,
  outputPath: string,
  options: IJtCanonicalizeOptions,
): Promise<IJtSourceStats> {
  let document: Document;
  try {
    document = await new NodeIO()
      .setLogger(new Logger(Logger.Verbosity.ERROR))
      .read(rawGlbPath);
  } catch {
    throw new Error('ICE3_TOOL_JT_EXPORT_INVALID');
  }
  removeUnsupportedResources(document);
  const nodes = document.getRoot().listNodes();
  const instances = instanceGroups(nodes);
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
          throw new Error('ICE3_TOOL_JT_GEOMETRY_INVALID');
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
    const source = record(rawExtras(node).jt);
    const customProperties = record(source?.customProperties);
    const instanceGroup = mesh ? instances.groups.get(mesh) : undefined;
    node.setExtras({
      ice3: {
        selectionId: `${options.assetId}/jt/node/${ordinal}`,
        displayName: sourceName,
        jt: {
          objectType: mesh ? 'MESH' : 'EMPTY',
          sourceName,
          materialNames: mesh ? materialNames(mesh) : [],
          ...(typeof source?.objectId === 'string'
            ? { objectId: source.objectId }
            : {}),
          ...(typeof source?.assemblyPath === 'string'
            ? { assemblyPath: source.assemblyPath }
            : {}),
          ...(instanceGroup ? { instanceGroup } : {}),
          ...(customProperties
            ? { customProperties: sanitizeProperties(customProperties) }
            : {}),
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
  if (!bounds) throw new Error('ICE3_TOOL_JT_GEOMETRY_INVALID');
  const sourceOrigin: readonly [number, number, number] = [
    bounds.min[0],
    0,
    bounds.min[2],
  ];
  applySharedOrigin(document, sourceOrigin);
  const asset = document.getRoot().getAsset();
  asset.generator = 'ICE3 Toolchain JT Adapter';
  asset.extras = {
    ice3: {
      coordinateSystem: {
        handedness: 'right',
        upAxis: 'y',
        linearUnit: 'meter',
      },
      jt: {
        converterContractVersion: '1.0',
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
    instanceNodeCount: instances.count,
    sourceOrigin,
    warnings: [],
  };
}

function instanceGroups(nodes: readonly Node[]): {
  readonly groups: ReadonlyMap<Mesh, string>;
  readonly count: number;
} {
  const counts = new Map<Mesh, number>();
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (mesh) counts.set(mesh, (counts.get(mesh) ?? 0) + 1);
  }
  const groups = new Map<Mesh, string>();
  let count = 0;
  let index = 0;
  for (const [mesh, uses] of counts) {
    if (uses < 2) continue;
    groups.set(mesh, `jt/instance/${index}`);
    count += uses - 1;
    index += 1;
  }
  return { groups, count };
}

function rawExtras(node: Node): Record<string, unknown> {
  return node.getExtras();
}

function cleanNodeName(value: string, ordinal: number): string {
  const normalized = value.trim();
  return normalized || `jt/node/${ordinal}`;
}

function materialNames(mesh: Mesh): readonly string[] {
  return [...new Set(
    mesh.listPrimitives()
      .map((primitive) => primitive.getMaterial()?.getName())
      .filter((name): name is string => Boolean(name)),
  )].sort();
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

function sanitizeProperties(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const sanitized = sanitizeValue(value, 0);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 8) return undefined;
  if (
    typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value) && value.length <= 256) {
    const items = value.map((item) => sanitizeValue(item, depth + 1));
    return items.some((item) => item === undefined) ? undefined : items;
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
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

function applySharedOrigin(
  document: Document,
  origin: readonly [number, number, number],
): void {
  const scene = document.getRoot().getDefaultScene();
  if (!scene) throw new Error('ICE3_TOOL_JT_GEOMETRY_INVALID');
  const roots = scene.listChildren();
  if (roots.length === 1) {
    const root = roots[0]!;
    const translation = root.getTranslation();
    root.setTranslation([
      translation[0] - origin[0],
      translation[1] - origin[1],
      translation[2] - origin[2],
    ]);
    return;
  }
  const root = document.createNode('JT Root')
    .setTranslation([-origin[0], -origin[1], -origin[2]]);
  scene.addChild(root);
  for (const child of roots) root.addChild(child);
}
