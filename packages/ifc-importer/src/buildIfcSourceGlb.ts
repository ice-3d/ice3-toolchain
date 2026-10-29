import {
  Document,
  NodeIO,
  type Material,
  type Node,
} from '@gltf-transform/core';
import type { IfcAPI, FlatMesh } from 'web-ifc';
import type { IIfcOpenDocument } from './ifcApi.js';
import {
  readPlacedGeometry,
  type IIfcGeometryPart,
} from './geometry.js';
import type {
  IIfcMetadata,
  IIfcProductMetadata,
} from './types.js';
import {
  readIfcProductMetadata,
} from './readIfcMetadata.js';

export interface IIfcSourceStats {
  readonly outputPath: string;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly productCount: number;
  readonly sourceOrigin: readonly [number, number, number];
  readonly warnings: readonly string[];
}

interface IProductGeometry {
  readonly parts: IIfcGeometryPart[];
}

export async function buildIfcSourceGlb(
  document: IIfcOpenDocument,
  metadata: IIfcMetadata,
  outputPath: string,
): Promise<IIfcSourceStats> {
  const geometries = collectGeometry(document.api, document.modelID);
  const products = new Map(
    metadata.products.map((product) => [product.expressId, product] as const),
  );
  const warnings = [...metadata.warnings];
  const usedSelectionIds = new Set(
    metadata.products.map((product) => product.selectionId),
  );
  for (const expressId of geometries.keys()) {
    if (!products.has(expressId)) {
      warnings.push(`IFC_UNMAPPED_GEOMETRY:${expressId}`);
      const line = document.api.GetLine(document.modelID, expressId);
      const ifcType = document.api.GetNameFromTypeCode(line.type).toUpperCase();
      const fallback = readIfcProductMetadata(
        document.api,
        document.modelID,
        expressId,
        ifcType,
        metadata.assetId,
        usedSelectionIds,
        new Map(),
        warnings,
      );
      products.set(expressId, fallback);
    }
  }
  const bounds = geometryBounds([...geometries.values()]);
  if (!bounds) throw new Error('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
  const sourceOrigin: readonly [number, number, number] = [
    bounds.min[0],
    0,
    bounds.min[2],
  ];

  const output = new Document();
  const buffer = output.createBuffer();
  const scene = output.createScene('source');
  output.getRoot().setDefaultScene(scene);
  output.getRoot().getAsset().extras = {
    ice3: {
      coordinateSystem: {
        handedness: 'right',
        upAxis: 'y',
        linearUnit: 'meter',
      },
      ifc: {
        schema: document.schema,
        sourceOrigin: [...sourceOrigin],
      },
    },
  };
  const usedNames = new Set<string>();
  const nodesByExpressId = new Map<number, Node>();
  const parentByChild = new Map<number, number>();
  for (const nodeMetadata of metadata.nodes) {
    const node = output.createNode(stableName(
      nodeMetadata.name,
      nodeMetadata.expressId,
      usedNames,
    ));
    nodesByExpressId.set(nodeMetadata.expressId, node);
    for (const child of nodeMetadata.children) {
      parentByChild.set(child, nodeMetadata.expressId);
    }
  }
  for (const [expressId, node] of nodesByExpressId) {
    const parentId = parentByChild.get(expressId);
    const parent = parentId === undefined
      ? undefined
      : nodesByExpressId.get(parentId);
    if (parent) parent.addChild(node);
    else if (expressId === metadata.projectId) scene.addChild(node);
  }
  const projectNode = nodesByExpressId.get(metadata.projectId);
  for (const [expressId, product] of products) {
    if (nodesByExpressId.has(expressId)) continue;
    const node = output.createNode(stableName(
      product.name,
      expressId,
      usedNames,
    ));
    nodesByExpressId.set(expressId, node);
    projectNode?.addChild(node);
  }

  const materials = new Map<string, Material>();
  let triangleCount = 0;
  let vertexCount = 0;
  let meshCount = 0;
  let productCount = 0;
  for (const [expressId, geometry] of [...geometries].sort(
    ([left], [right]) => left - right,
  )) {
    const product = products.get(expressId);
    const node = nodesByExpressId.get(expressId);
    if (!product || !node) continue;
    const mesh = output.createMesh(product.name);
    for (const part of geometry.parts) {
      const positionAccessor = output.createAccessor()
        .setType('VEC3')
        .setArray(subtractOrigin(part.positions, sourceOrigin))
        .setBuffer(buffer);
      const primitive = output.createPrimitive()
        .setAttribute('POSITION', positionAccessor)
        .setIndices(output.createAccessor()
          .setType('SCALAR')
          .setArray(part.indices)
          .setBuffer(buffer))
        .setMaterial(materialFor(output, materials, part.color));
      mesh.addPrimitive(primitive);
      triangleCount += part.indices.length / 3;
      vertexCount += part.positions.length / 3;
    }
    node.setMesh(mesh);
    node.setExtras({
      ice3: productExtras(product, document.schema),
    });
    productCount += 1;
    meshCount += 1;
  }
  if (productCount === 0) throw new Error('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
  await new NodeIO().write(outputPath, output);
  return {
    outputPath,
    triangleCount,
    vertexCount,
    nodeCount: nodesByExpressId.size,
    meshCount,
    productCount,
    sourceOrigin,
    warnings: [...new Set(warnings)].sort(),
  };
}

function collectGeometry(
  api: IfcAPI,
  modelID: number,
): ReadonlyMap<number, IProductGeometry> {
  const geometries = new Map<number, IProductGeometry>();
  api.StreamAllMeshes(modelID, (mesh: FlatMesh) => {
    const parts: IIfcGeometryPart[] = [];
    const placedGeometries = mesh.geometries as unknown as {
      size(): number;
      get(index: number): Parameters<typeof readPlacedGeometry>[2];
    };
    for (let index = 0; index < placedGeometries.size(); index += 1) {
      parts.push(readPlacedGeometry(
        api,
        modelID,
        placedGeometries.get(index),
      ));
    }
    if (parts.length > 0) {
      geometries.set(mesh.expressID, { parts });
    }
  }, true);
  return geometries;
}

function geometryBounds(
  geometries: readonly IProductGeometry[],
): { min: [number, number, number]; max: [number, number, number] } | undefined {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const geometry of geometries) {
    for (const part of geometry.parts) {
      for (let index = 0; index < part.positions.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          const value = part.positions[index + axis]!;
          min[axis] = Math.min(min[axis]!, value);
          max[axis] = Math.max(max[axis]!, value);
        }
      }
    }
  }
  return min.every(Number.isFinite) && max.every(Number.isFinite)
    ? { min, max }
    : undefined;
}

function subtractOrigin(
  positions: Float32Array<ArrayBuffer>,
  origin: readonly [number, number, number],
): Float32Array<ArrayBuffer> {
  const result = new Float32Array(new ArrayBuffer(positions.byteLength));
  for (let index = 0; index < positions.length; index += 3) {
    result[index] = positions[index]! - origin[0];
    result[index + 1] = positions[index + 1]! - origin[1];
    result[index + 2] = positions[index + 2]! - origin[2];
  }
  return result;
}

function materialFor(
  document: Document,
  materials: Map<string, Material>,
  color: readonly [number, number, number, number],
): Material {
  const key = color.join(',');
  const existing = materials.get(key);
  if (existing) return existing;
  const material = document.createMaterial(`ifc/material/${materials.size}`)
    .setBaseColorFactor([...color])
    .setMetallicFactor(0)
    .setRoughnessFactor(1);
  materials.set(key, material);
  return material;
}

function productExtras(
  product: IIfcProductMetadata,
  schema: string,
): Record<string, unknown> {
  return {
    selectionId: product.selectionId,
    displayName: product.name,
    ...(product.tag ? { equipmentTag: product.tag } : {}),
    ifc: {
      schema,
      expressId: product.expressId,
      ifcType: product.ifcType,
      ...(product.globalId ? { globalId: product.globalId } : {}),
      ...(product.description ? { description: product.description } : {}),
      ...(product.objectType ? { objectType: product.objectType } : {}),
      ...(product.predefinedType
        ? { predefinedType: product.predefinedType }
        : {}),
      propertySets: product.propertySets,
      systems: product.systems,
    },
  };
}

function stableName(
  rawName: string,
  expressId: number,
  usedNames: Set<string>,
): string {
  const base = rawName.trim() || `ifc/node/${expressId}`;
  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    candidate = `${base}[${suffix}]`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}
