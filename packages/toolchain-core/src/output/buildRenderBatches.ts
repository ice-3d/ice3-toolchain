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
  readonly nodeIdPrefix?: string;
  readonly geometryOverrides?: ReadonlyMap<
    string,
    ICEBuildRenderBatchesGeometryOverride
  >;
  readonly meshOverrides?: ReadonlyMap<
    number,
    ICEBuildRenderBatchesMeshOverride
  >;
}

export interface ICEBuildRenderBatchesGeometryOverride {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
}

export interface ICEBuildRenderBatchesMeshOverride
  extends ICEBuildRenderBatchesGeometryOverride {
  readonly materialIndex?: number;
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
  readonly outputMaterialKey: string;
  readonly sourceMaterialIndex?: number;
  readonly hasColors: boolean;
  positions: number[];
  indices: number[];
  semanticIndices: number[];
  colors: number[];
  triangleCount: number;
  bytes: number;
}

interface EffectiveBatchPrimitive {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
  readonly materialIndex?: number;
  readonly mode: 4;
}

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
    semanticNodeIds.push(
      options.nodeIdPrefix ? `${options.nodeIdPrefix}/${nodeIndex}` : id,
    );
    semanticSelectionIds.push(selectionId);
  }

  const draftsByKey = new Map<string, BatchDraft[]>();
  const activeDrafts = new Map<string, BatchDraft>();
  let inputPrimitiveCount = 0;
  for (const nodeIndex of selected) {
    const node = nodes[nodeIndex]!;
    if (node.mesh === undefined) continue;
    const meshIndex = Number(node.mesh);
    const mesh = meshes[meshIndex];
    if (!mesh) continue;
    const semanticIndex = semanticIndexByNode.get(nodeIndex)!;
    const meshOverride = options.meshOverrides?.get(meshIndex);
    const primitives: EffectiveBatchPrimitive[] = meshOverride
      ? [{
          positions: meshOverride.positions,
          indices: meshOverride.indices,
          ...(meshOverride.colors ? { colors: meshOverride.colors } : {}),
          ...(meshOverride.materialIndex === undefined
            ? {}
            : { materialIndex: meshOverride.materialIndex }),
          mode: 4,
        }]
      : collectEffectivePrimitives(source, mesh, meshIndex, options);
    for (const primitive of primitives) {
      inputPrimitiveCount += 1;
      validateBatchGeometry(primitive);
      const prepared = prepareMesh(
        primitive.positions,
        primitive.indices,
        30,
        { mode: primitive.mode, generateEdges: false },
      );
      const sourceMaterialIndex = primitive.materialIndex;
      if (
        sourceMaterialIndex !== undefined
        && (!Number.isInteger(sourceMaterialIndex)
          || sourceMaterialIndex < 0
          || sourceMaterialIndex >= materials.length)
      ) {
        throw new Error('ICE3_TOOL_RENDER_BATCH_INVALID: material index is invalid');
      }
      const hasColors = primitive.colors !== undefined;
      const outputMaterialKey = materialOutputKey(
        materials,
        sourceMaterialIndex,
      );
      const key = draftKey(outputMaterialKey, hasColors);
      let vertexMap = new Map<number, number>();
      for (let offset = 0; offset < prepared.indices.length; offset += 3) {
        let draft = activeDrafts.get(key);
        if (!draft) {
          draft = createDraft(
            outputMaterialKey,
            sourceMaterialIndex,
            hasColors,
          );
          activeDrafts.set(key, draft);
        }
        if (!triangleFits(
          draft,
          prepared.indices,
          offset,
          vertexMap,
          options,
        )) {
          sealDraft(draftsByKey, key, draft);
          draft = createDraft(
            outputMaterialKey,
            sourceMaterialIndex,
            hasColors,
          );
          activeDrafts.set(key, draft);
          vertexMap = new Map();
        }
        for (let corner = offset; corner < offset + 3; corner += 1) {
          const vertexIndex = prepared.indices[corner]!;
          const existing = vertexMap.get(vertexIndex);
          if (existing !== undefined) {
            draft.indices.push(existing);
            continue;
          }
          const newIndex = draft.positions.length / 3;
          vertexMap.set(vertexIndex, newIndex);
          appendTransformedVertex(
            draft,
            worldMatrices[nodeIndex]!,
            prepared.positions,
            vertexIndex,
            semanticIndex,
            primitive.colors,
          );
          draft.indices.push(newIndex);
        }
        draft.triangleCount += 1;
        draft.bytes = draftSize(draft);
      }
    }
  }
  for (const draft of activeDrafts.values()) {
    sealDraft(
      draftsByKey,
      draftKey(draft.outputMaterialKey, draft.hasColors),
      draft,
    );
  }
  const batches = finalizeDrafts(draftsByKey);
  return {
    batches,
    semanticIds,
    semanticNodeIds,
    semanticSelectionIds,
    inputPrimitiveCount,
    outputBatchCount: batches.length,
  };
}

function collectEffectivePrimitives(
  source: ICESourceDocument,
  mesh: Record<string, unknown>,
  meshIndex: number,
  options: ICEBuildRenderBatchesOptions,
): EffectiveBatchPrimitive[] {
  const output: EffectiveBatchPrimitive[] = [];
  for (const [primitiveIndex, primitive] of records(mesh.primitives).entries()) {
    if (Number(primitive.mode ?? 4) !== 4) continue;
    const attributes = record(primitive.attributes);
    const override = options.geometryOverrides?.get(
      `${meshIndex}:${primitiveIndex}`,
    );
    const positionData = override
      ? undefined
      : readAccessor(source, Number(attributes?.POSITION));
    if (
      positionData
      && (positionData.kind !== 'float32' || positionData.components !== 3)
    ) {
      throw new Error(
        'ICE3_TOOL_RENDER_BATCH_INVALID: geometry accessors are invalid',
      );
    }
    const indexData = override || primitive.indices === undefined
      ? undefined
      : readAccessor(source, Number(primitive.indices));
    if (indexData && indexData.components !== 1) {
      throw new Error(
        'ICE3_TOOL_RENDER_BATCH_INVALID: geometry accessors are invalid',
      );
    }
    let colors = override?.colors;
    if (!colors && attributes?.COLOR_0 !== undefined) {
      const colorData = readAccessor(source, Number(attributes.COLOR_0));
      if (
        colorData.kind !== 'float32'
        || (colorData.components !== 3 && colorData.components !== 4)
      ) {
        throw new Error(
          'ICE3_TOOL_RENDER_BATCH_INVALID: vertex colors are invalid',
        );
      }
      colors = colorData.values;
    }
    const positions = override?.positions ?? positionData!.values;
    const indices = override?.indices
      ?? (indexData
        ? new Uint32Array(indexData.values)
        : sequentialIndices(positions.length / 3));
    output.push({
      positions,
      indices,
      ...(colors ? { colors } : {}),
      ...(primitive.material === undefined
        ? {}
        : { materialIndex: Number(primitive.material) }),
      mode: 4,
    });
  }
  return output;
}

function createDraft(
  outputMaterialKey: string,
  sourceMaterialIndex: number | undefined,
  hasColors: boolean,
): BatchDraft {
  return {
    outputMaterialKey,
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

function validateBatchGeometry(options: {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
  readonly materialIndex?: number;
  readonly mode: 4;
}): void {
  if (options.positions.length % 3 !== 0 || options.indices.length % 3 !== 0) {
    throw new Error(
      'ICE3_TOOL_RENDER_BATCH_INVALID: geometry accessors are invalid',
    );
  }
  const vertexCount = options.positions.length / 3;
  for (let index = 0; index < options.indices.length; index += 1) {
    const vertexIndex = options.indices[index]!;
    if (
      !Number.isInteger(vertexIndex)
      || vertexIndex < 0
      || vertexIndex >= vertexCount
    ) {
      throw new Error(
        'ICE3_TOOL_RENDER_BATCH_INVALID: geometry accessors are invalid',
      );
    }
  }
  if (options.colors) {
    const components = options.colors.length / (options.positions.length / 3);
    if (
      (components !== 3 && components !== 4)
      || options.colors.length / components !== options.positions.length / 3
    ) {
      throw new Error(
        'ICE3_TOOL_RENDER_BATCH_INVALID: vertex colors are invalid',
      );
    }
  }
}

function sequentialIndices(count: number): Uint32Array {
  const indices = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) {
    indices[index] = index;
  }
  return indices;
}

function triangleFits(
  draft: BatchDraft,
  indices: Uint16Array | Uint32Array,
  offset: number,
  vertexMap: ReadonlyMap<number, number>,
  options: ICEBuildRenderBatchesOptions,
): boolean {
  if (draft.triangleCount + 1 > options.maxTrianglesPerBatch) return false;
  let newVertices = 0;
  for (let corner = offset; corner < offset + 3; corner += 1) {
    const index = indices[corner]!;
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

function sealDraft(
  draftsByKey: Map<string, BatchDraft[]>,
  key: string,
  draft: BatchDraft,
): void {
  const drafts = draftsByKey.get(key) ?? [];
  drafts.push(draft);
  draftsByKey.set(key, drafts);
}

function finalizeDrafts(
  draftsByKey: ReadonlyMap<string, readonly BatchDraft[]>,
): ICEToolRenderBatch[] {
  const sortedDrafts = [...draftsByKey.keys()]
    .sort()
    .flatMap((key) => draftsByKey.get(key)!);
  return sortedDrafts.map((draft, index) => {
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

function appendTransformedVertex(
  draft: BatchDraft,
  matrix: ICEMatrix4Tuple,
  positions: Float32Array,
  vertexIndex: number,
  semanticIndex: number,
  colors?: Float32Array,
): void {
  const x = positions[vertexIndex * 3]!;
  const y = positions[vertexIndex * 3 + 1]!;
  const z = positions[vertexIndex * 3 + 2]!;
  draft.positions.push(
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  );
  draft.semanticIndices.push(semanticIndex);
  if (colors) {
    const components = colors.length / (positions.length / 3);
    draft.colors.push(
      colors[vertexIndex * components]!,
      colors[vertexIndex * components + 1]!,
      colors[vertexIndex * components + 2]!,
    );
  }
}

function draftKey(
  outputMaterialKey: string,
  hasColors: boolean,
): string {
  return `${outputMaterialKey}:${hasColors ? 1 : 0}`;
}

function materialOutputKey(
  materials: readonly Record<string, unknown>[],
  materialIndex: number | undefined,
): string {
  if (materialIndex === undefined) return 'default';
  const material = materials[materialIndex]!;
  const pbr = record(material.pbrMetallicRoughness);
  const baseColor = Array.isArray(pbr?.baseColorFactor)
    && pbr.baseColorFactor.length === 4
    && pbr.baseColorFactor.every((value) => (
      typeof value === 'number' && Number.isFinite(value)
    ))
    ? pbr.baseColorFactor
    : [0.5, 0.5, 0.5, 1];
  const edgeColor = record(record(material.extras)?.ice3)?.edgeColor;
  return JSON.stringify([
    baseColor,
    typeof edgeColor === 'string' ? edgeColor : '#e6f2ff',
  ]);
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
