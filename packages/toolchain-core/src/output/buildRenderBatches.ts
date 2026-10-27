import type { ICESourceDocument } from '../source/readSource.js';
import { readAccessor } from '../source/readAccessor.js';
import { prepareMesh } from '../scene/prepareMesh.js';
import { collectNodeWorldMatrices } from '../scene/nodeMatrices.js';
import type { ICEMatrix4Tuple } from '../scene/bakeMatrix.js';
import type { ICEBounds } from '../partition/types.js';

export interface ICEBuildRenderBatchesOptions {
  readonly mode: 'static' | 'off';
  readonly maxTrianglesPerBatch: number;
  readonly maxBytesPerBatch: number;
  readonly selectionIdAssetId?: string;
}

export interface ICEToolRenderBatch {
  readonly id: string;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly semanticIndices: Uint32Array;
  readonly colors?: Float32Array;
  readonly sourceMaterialIndex?: number;
  readonly triangleCount: number;
  readonly bounds: ICEBounds;
}

export interface ICEToolRenderBatchMetadata {
  readonly version: '1.0';
  readonly semanticIds: readonly string[];
  readonly semanticNodeIds: readonly string[];
  readonly semanticSelectionIds: readonly string[];
  readonly batches: readonly {
    readonly id: string;
    readonly mesh: number;
    readonly primitive: number;
    readonly material: number;
    readonly mode: 4;
    readonly triangleCount: number;
    readonly bounds: ICEBounds;
  }[];
}

export interface ICEBuildRenderBatchesResult {
  readonly batches: readonly ICEToolRenderBatch[];
  readonly semanticIds: readonly string[];
  readonly semanticNodeIds: readonly string[];
  readonly semanticSelectionIds: readonly string[];
  readonly inputPrimitiveCount: number;
  readonly outputBatchCount: number;
}

interface BatchDraft {
  readonly sourceMaterialIndex?: number;
  readonly hasColors: boolean;
  positions: number[];
  indices: number[];
  semanticIndices: number[];
  colors: number[];
  triangleCount: number;
  bytes: number;
}

type Vector = readonly [number, number, number];

export function buildRenderBatches(
  source: ICESourceDocument,
  selection: readonly number[],
  options: ICEBuildRenderBatchesOptions,
): ICEBuildRenderBatchesResult {
  validateOptions(options);
  if (options.mode === 'off') {
    return {
      batches: [],
      semanticIds: [],
      semanticNodeIds: [],
      semanticSelectionIds: [],
      inputPrimitiveCount: 0,
      outputBatchCount: 0,
    };
  }
  const nodes = records(source.json.nodes);
  const meshes = records(source.json.meshes);
  const materials = records(source.json.materials);
  const accessors = records(source.json.accessors);
  const selected = [...new Set(selection)].sort((left, right) => left - right);
  if (
    selected.length === 0
    || selected.some((index) => (
      !Number.isInteger(index) || index < 0 || index >= nodes.length
    ))
  ) {
    throw new Error('ICE3_TOOL_RENDER_BATCH_INVALID: selection is invalid');
  }
  const worldMatrices = collectNodeWorldMatrices(source);
  const semanticIds: string[] = [];
  const semanticNodeIds: string[] = [];
  const semanticSelectionIds: string[] = [];
  const semanticIndexByNode = new Map<number, number>();
  for (const nodeIndex of selected) {
    const profile = record(record(nodes[nodeIndex]?.extras)?.ice3);
    const id = typeof profile?.id === 'string' && profile.id.trim()
      ? profile.id
      : `node:${nodeIndex}`;
    const selectionId = typeof profile?.selectionId === 'string'
      ? profile.selectionId
      : `${options.selectionIdAssetId ?? 'asset'}/node/${nodeIndex}`;
    semanticIndexByNode.set(nodeIndex, semanticIds.length);
    semanticIds.push(id);
    semanticNodeIds.push(id);
    semanticSelectionIds.push(selectionId);
  }

  const batches: ICEToolRenderBatch[] = [];
  let inputPrimitiveCount = 0;
  let drafts: BatchDraft[] = [];
  for (const nodeIndex of selected) {
    const node = nodes[nodeIndex]!;
    if (node.mesh === undefined) continue;
    const mesh = meshes[Number(node.mesh)];
    if (!mesh) continue;
    const semanticIndex = semanticIndexByNode.get(nodeIndex)!;
    for (const primitive of records(mesh.primitives)) {
      if (Number(primitive.mode ?? 4) !== 4) continue;
      inputPrimitiveCount += 1;
      const attributes = record(primitive.attributes);
      const positionData = readAccessor(source, Number(attributes?.POSITION));
      const indexData = readAccessor(source, Number(primitive.indices));
      if (
        positionData.kind !== 'float32'
        || positionData.components !== 3
        || indexData.components !== 1
      ) {
        throw new Error('ICE3_TOOL_RENDER_BATCH_INVALID: geometry accessors are invalid');
      }
      const mode = Number(primitive.mode ?? 4) as 4;
      const prepared = prepareMesh(
        positionData.values,
        new Uint32Array(indexData.values),
        30,
        { mode, generateEdges: false },
      );
      const colorData = attributes?.COLOR_0 === undefined
        ? undefined
        : readAccessor(source, Number(attributes.COLOR_0));
      if (
        colorData
        && (
          colorData.kind !== 'float32'
          || (colorData.components !== 3 && colorData.components !== 4)
          || colorData.values.length / colorData.components
            !== prepared.positions.length / 3
        )
      ) {
        throw new Error('ICE3_TOOL_RENDER_BATCH_INVALID: vertex colors are invalid');
      }
      const sourceMaterialIndex = primitive.material === undefined
        ? undefined
        : Number(primitive.material);
      if (
        sourceMaterialIndex !== undefined
        && (!Number.isInteger(sourceMaterialIndex)
          || sourceMaterialIndex < 0
          || sourceMaterialIndex >= materials.length)
      ) {
        throw new Error('ICE3_TOOL_RENDER_BATCH_INVALID: material index is invalid');
      }
      let draft: BatchDraft | undefined;
      let vertexMap = new Map<number, number>();
      for (let offset = 0; offset < prepared.indices.length; offset += 3) {
        if (
          !draft
          || !fitsBatch(draft, prepared.indices.subarray(offset, offset + 3), vertexMap, options)
        ) {
          if (draft) drafts.push(draft);
          draft = createDraft(sourceMaterialIndex, Boolean(colorData));
          vertexMap = new Map();
        }
        const triangle = prepared.indices.subarray(offset, offset + 3);
        const transformed = [...triangle].map((vertexIndex) => {
          const existing = vertexMap.get(vertexIndex);
          if (existing !== undefined) return existing;
          const newIndex = draft!.positions.length / 3;
          vertexMap.set(vertexIndex, newIndex);
          const point = transformPoint(
            worldMatrices[nodeIndex]!,
            prepared.positions,
            vertexIndex,
          );
          draft!.positions.push(...point);
          draft!.semanticIndices.push(semanticIndex);
          if (colorData) {
            const components = colorData.components;
            draft!.colors.push(
              colorData.values[vertexIndex * components]!,
              colorData.values[vertexIndex * components + 1]!,
              colorData.values[vertexIndex * components + 2]!,
            );
          }
          return newIndex;
        });
        draft.indices.push(...transformed);
        draft.triangleCount += 1;
        draft.bytes = draftSize(draft);
      }
      if (draft) drafts.push(draft);
    }
  }
  batches.push(...finalizeDrafts(drafts, options));
  return {
    batches,
    semanticIds,
    semanticNodeIds,
    semanticSelectionIds,
    inputPrimitiveCount,
    outputBatchCount: batches.length,
  };
}

function createDraft(
  sourceMaterialIndex: number | undefined,
  hasColors: boolean,
): BatchDraft {
  return {
    ...(sourceMaterialIndex === undefined ? {} : { sourceMaterialIndex }),
    hasColors,
    positions: [],
    indices: [],
    semanticIndices: [],
    colors: [],
    triangleCount: 0,
    bytes: 0,
  };
}

function fitsBatch(
  draft: BatchDraft,
  triangle: Uint16Array | Uint32Array,
  vertexMap: ReadonlyMap<number, number>,
  options: ICEBuildRenderBatchesOptions,
): boolean {
  if (draft.triangleCount + 1 > options.maxTrianglesPerBatch) return false;
  let newVertices = 0;
  for (const index of triangle) {
    if (!vertexMap.has(index)) newVertices += 1;
  }
  return draft.bytes
    + newVertices * (draft.hasColors ? 28 : 16)
    + 12 <= options.maxBytesPerBatch;
}

function draftSize(draft: BatchDraft): number {
  return draft.positions.length * 4
    + draft.indices.length * 4
    + draft.semanticIndices.length * 4
    + draft.colors.length * 4;
}

function finalizeDrafts(
  drafts: readonly BatchDraft[],
  options: ICEBuildRenderBatchesOptions,
): ICEToolRenderBatch[] {
  const merged: BatchDraft[] = [];
  const byKey = new Map<string, BatchDraft[]>();
  for (const fragment of drafts) {
    const entries = byKey.get(draftKey(fragment)) ?? [];
    entries.push(fragment);
    byKey.set(draftKey(fragment), entries);
  }
  for (const key of [...byKey.keys()].sort()) {
    for (const fragment of byKey.get(key)!) {
      const previous = merged.at(-1);
      if (
        previous
        && draftKey(previous) === key
        && previous.triangleCount + fragment.triangleCount
          <= options.maxTrianglesPerBatch
        && previous.bytes + fragment.bytes <= options.maxBytesPerBatch
      ) {
        const offset = previous.positions.length / 3;
        previous.positions.push(...fragment.positions);
        previous.indices.push(...fragment.indices.map((index) => index + offset));
        previous.semanticIndices.push(...fragment.semanticIndices);
        previous.colors.push(...fragment.colors);
        previous.triangleCount += fragment.triangleCount;
        previous.bytes = draftSize(previous);
      } else {
        merged.push({ ...fragment });
      }
    }
  }
  return merged.map((draft, index) => {
    const bounds = boundsFromValues(draft.positions);
    return {
      id: `batch:${index}`,
      positions: new Float32Array(draft.positions),
      indices: new Uint32Array(draft.indices),
      semanticIndices: new Uint32Array(draft.semanticIndices),
      ...(draft.hasColors ? { colors: new Float32Array(draft.colors) } : {}),
      ...(draft.sourceMaterialIndex === undefined
        ? {}
        : { sourceMaterialIndex: draft.sourceMaterialIndex }),
      triangleCount: draft.triangleCount,
      bounds,
    };
  });
}

function draftKey(draft: BatchDraft): string {
  return `${draft.sourceMaterialIndex ?? 'default'}:${draft.hasColors ? 1 : 0}`;
}

function boundsFromValues(values: readonly number[]): ICEBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < values.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, values[offset + axis]!);
      max[axis] = Math.max(max[axis]!, values[offset + axis]!);
    }
  }
  return { min, max };
}

function transformPoint(
  matrix: ICEMatrix4Tuple,
  positions: Float32Array,
  index: number,
): Vector {
  const x = positions[index * 3]!;
  const y = positions[index * 3 + 1]!;
  const z = positions[index * 3 + 2]!;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function validateOptions(options: ICEBuildRenderBatchesOptions): void {
  if (
    (options.mode !== 'static' && options.mode !== 'off')
    || !Number.isInteger(options.maxTrianglesPerBatch)
    || options.maxTrianglesPerBatch < 1
    || !Number.isInteger(options.maxBytesPerBatch)
    || options.maxBytesPerBatch < 1
  ) {
    throw new Error('ICE3_TOOL_RENDER_BATCH_INVALID: options are invalid');
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
