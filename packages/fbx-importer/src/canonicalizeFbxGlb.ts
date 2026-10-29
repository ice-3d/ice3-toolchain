import {
  NodeIO,
  type Document,
  type Node,
} from '@gltf-transform/core';
import type { IFbxBridgeReport } from './types.js';
import {
  createInstanceMetadata,
  mergeBridgeReport,
} from './mergeBridgeReport.js';

export interface IFbxCanonicalizeOptions {
  readonly assetId: string;
  readonly bridgeReport: IFbxBridgeReport;
}

export interface IFbxSourceStats {
  readonly outputPath: string;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly instanceNodeCount: number;
  readonly sourceOrigin: readonly [number, number, number];
  readonly warnings: readonly string[];
}

export async function canonicalizeFbxGlb(
  rawGlbPath: string,
  outputPath: string,
  options: IFbxCanonicalizeOptions,
): Promise<IFbxSourceStats> {
  const document = await new NodeIO().read(rawGlbPath);
  removeUnsupportedResources(document);
  const reportByName = mergeBridgeReport(options.bridgeReport);
  const instanceMetadata = createInstanceMetadata(options.bridgeReport.objects);
  const warnings: string[] = [];
  const nodes = document.getRoot().listNodes();
  let triangleCount = 0;
  let vertexCount = 0;
  let meshCount = 0;
  for (const [ordinal, node] of nodes.entries()) {
    const name = node.getName() || `fbx/node/${ordinal}`;
    node.setName(name);
    const reportObject = reportByName.get(name);
    if (!reportObject) warnings.push(`ICE3_TOOL_FBX_UNMATCHED_OBJECT:${ordinal}`);
    const instanceGroup = reportObject?.meshData
      ? instanceMetadata.groups.get(reportObject.meshData)
      : undefined;
    const customProperties = sanitizeProperties(
      reportObject?.customProperties ?? {},
    );
    node.setExtras({
      ...node.getExtras(),
      ice3: {
        selectionId: `${options.assetId}/fbx/node/${ordinal}`,
        displayName: name,
        fbx: {
          objectType: reportObject?.objectType ?? 'EMPTY',
          ...(reportObject?.meshData
            ? { meshData: reportObject.meshData }
            : {}),
          ...(instanceGroup ? { instanceGroup } : {}),
          ...(Object.keys(customProperties).length > 0
            ? { customProperties }
            : {}),
          ...(!reportObject ? { unmatchedObject: true } : {}),
        },
      },
    });
    const mesh = node.getMesh();
    if (mesh) {
      meshCount += 1;
      for (const primitive of mesh.listPrimitives()) {
        const position = primitive.getAttribute('POSITION');
        const indices = primitive.getIndices();
        vertexCount += position?.getCount() ?? 0;
        triangleCount += (indices?.getCount() ?? position?.getCount() ?? 0) / 3;
      }
    }
  }
  if (triangleCount <= 0) throw new Error('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');

  for (const material of document.getRoot().listMaterials()) {
    material.setMetallicFactor(0);
    material.setRoughnessFactor(1);
  }
  const bounds = worldBounds(nodes);
  if (!bounds) throw new Error('ICE3_TOOL_FBX_GEOMETRY_INVALID');
  const sourceOrigin: readonly [number, number, number] = [
    bounds.min[0],
    0,
    bounds.min[2],
  ];
  applySharedOrigin(document, sourceOrigin);
  const asset = document.getRoot().getAsset();
  asset.extras = {
    ice3: {
      coordinateSystem: {
        handedness: 'right',
        upAxis: 'y',
        linearUnit: 'meter',
      },
      fbx: {
        bridgeVersion: '1.0',
        sourceOrigin: [...sourceOrigin],
      },
    },
  };
  await new NodeIO().write(outputPath, document);
  return {
    outputPath,
    triangleCount,
    vertexCount,
    nodeCount: nodes.length,
    meshCount,
    instanceNodeCount: instanceMetadata.instanceNodeCount,
    sourceOrigin,
    warnings: [...new Set(warnings)].sort(),
  };
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
  if (!scene) throw new Error('ICE3_TOOL_FBX_GEOMETRY_INVALID');
  const roots = scene.listChildren();
  let root: Node;
  if (roots.length === 1) {
    root = roots[0]!;
    const translation = root.getTranslation();
    root.setTranslation([
      translation[0] - origin[0],
      translation[1] - origin[1],
      translation[2] - origin[2],
    ]);
    return;
  }
  root = document.createNode('FBX Root')
    .setTranslation([-origin[0], -origin[1], -origin[2]]);
  scene.addChild(root);
  for (const child of roots) root.addChild(child);
}
