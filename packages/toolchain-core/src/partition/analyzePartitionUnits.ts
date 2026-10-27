import type { ICESourceDocument } from '../source/readSource.js';
import { readAccessor } from '../source/readAccessor.js';
import {
  bakeLocalMatrix,
  type ICEMatrix4Tuple,
} from '../scene/bakeMatrix.js';
import {
  multiplyMatrices,
  transformBounds,
} from '../scene/nodeMatrices.js';
import type {
  ICEBounds,
  ICEPartitionAnalysis,
  ICEPartitionUnit,
} from './types.js';

type JSONRecord = Record<string, unknown>;

export function analyzePartitionUnits(
  source: ICESourceDocument,
): ICEPartitionAnalysis {
  const nodes = records(source.json.nodes);
  const meshes = records(source.json.meshes);
  const accessors = records(source.json.accessors);
  const scenes = records(source.json.scenes);
  const activeScene = scenes[Number(source.json.scene ?? 0)];
  const roots = integers(activeScene?.nodes);
  const worldMatrices = new Array<ICEMatrix4Tuple | undefined>(nodes.length);

  const visit = (index: number, parent: ICEMatrix4Tuple): void => {
    const node = nodes[index];
    if (!node) {
      throw new Error(`ICE3_TOOL_PARTITION_EMPTY: node ${index} is missing`);
    }
    const local = bakeLocalMatrix(
      numbers(node.matrix, 16),
      numbers(node.translation, 3),
      numbers(node.rotation, 4),
      numbers(node.scale, 3),
    );
    const world = multiplyMatrices(parent, local);
    worldMatrices[index] = world;
    for (const child of integers(node.children)) {
      visit(child, world);
    }
  };

  for (const root of roots) {
    visit(root, identity());
  }

  const meshToNodes = new Map<number, number[]>();
  for (const [nodeIndex, node] of nodes.entries()) {
    if (node.mesh === undefined || !worldMatrices[nodeIndex]) continue;
    const meshIndex = Number(node.mesh);
    if (!meshes[meshIndex]) {
      throw new Error(
        `ICE3_TOOL_PARTITION_EMPTY: mesh ${meshIndex} is missing`,
      );
    }
    const owners = meshToNodes.get(meshIndex) ?? [];
    owners.push(nodeIndex);
    meshToNodes.set(meshIndex, owners);
  }

  if (meshToNodes.size === 0) {
    throw new Error('ICE3_TOOL_PARTITION_EMPTY: active scene has no mesh nodes');
  }

  const units: ICEPartitionUnit[] = [];
  for (const [meshIndex, nodeIndices] of meshToNodes) {
    const mesh = meshes[meshIndex]!;
    const primitives = records(mesh.primitives);
    let triangleCount = 0;
    const localBounds: ICEBounds[] = [];
    for (const primitive of primitives) {
      const mode = Number(primitive.mode ?? 4);
      if (![4, 5, 6].includes(mode)) continue;
      const attributes = record(primitive.attributes);
      const positionAccessorIndex = Number(attributes?.POSITION);
      const positionAccessor = accessors[positionAccessorIndex];
      if (!positionAccessor) {
        throw new Error(
          `ICE3_TOOL_PARTITION_EMPTY: POSITION accessor ${positionAccessorIndex} is missing`,
        );
      }
      const count = Number(positionAccessor.count);
      const indexAccessor = primitive.indices === undefined
        ? undefined
        : accessors[Number(primitive.indices)];
      const elementCount = primitive.indices === undefined
        ? count
        : Number(indexAccessor?.count);
      triangleCount += mode === 4
        ? elementCount / 3
        : Math.max(0, elementCount - 2);
      localBounds.push(accessorBounds(source, positionAccessorIndex));
    }
    if (triangleCount === 0 || localBounds.length === 0) continue;

    const local = unionBounds(localBounds);
    let bounds: ICEBounds | undefined;
    for (const nodeIndex of nodeIndices) {
      const transformed = transformBounds(local, worldMatrices[nodeIndex]!);
      bounds = bounds ? unionBounds([bounds, transformed]) : transformed;
    }
    units.push({
      nodeIndices: [...nodeIndices].sort((left, right) => left - right),
      meshIndices: [meshIndex],
      bounds: bounds!,
      triangleCount,
    });
  }

  if (units.length === 0) {
    throw new Error('ICE3_TOOL_PARTITION_EMPTY: active scene has no triangles');
  }
  units.sort((left, right) => (
    left.nodeIndices[0]! - right.nodeIndices[0]!
  ));
  return {
    bounds: unionBounds(units.map((unit) => unit.bounds)),
    triangleCount: units.reduce(
      (total, unit) => total + unit.triangleCount,
      0,
    ),
    units,
  };
}

function accessorBounds(
  source: ICESourceDocument,
  accessorIndex: number,
): ICEBounds {
  const accessors = records(source.json.accessors);
  const value = accessors[accessorIndex];
  const min = numbers(value?.min, 3);
  const max = numbers(value?.max, 3);
  if (min && max) {
    return {
      min: [min[0]!, min[1]!, min[2]!],
      max: [max[0]!, max[1]!, max[2]!],
    };
  }
  const data = readAccessor(source, accessorIndex);
  if (data.kind !== 'float32' || data.components !== 3) {
    throw new Error(
      'ICE3_TOOL_PARTITION_EMPTY: POSITION must be float VEC3',
    );
  }
  const boundsMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const boundsMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < data.values.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(boundsMin[axis]!, data.values[index + axis]!);
      boundsMax[axis] = Math.max(boundsMax[axis]!, data.values[index + axis]!);
    }
  }
  return { min: boundsMin, max: boundsMax };
}

function identity(): ICEMatrix4Tuple {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function unionBounds(bounds: readonly ICEBounds[]): ICEBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const bound of bounds) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, bound.min[axis]!);
      max[axis] = Math.max(max[axis]!, bound.max[axis]!);
    }
  }
  return { min, max };
}

function records(value: unknown): JSONRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JSONRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}

function record(value: unknown): JSONRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JSONRecord
    : undefined;
}

function integers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => Number.isInteger(entry))
    : [];
}

function numbers(
  value: unknown,
  length: number,
): number[] | undefined {
  return Array.isArray(value)
    && value.length === length
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    ? value as number[]
    : undefined;
}
