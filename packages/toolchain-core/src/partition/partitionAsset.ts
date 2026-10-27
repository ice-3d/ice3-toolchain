import type { ICESourceDocument } from '../source/readSource.js';
import { readAccessor } from '../source/readAccessor.js';
import { buildPreparedGLB } from '../output/buildPreparedGLB.js';
import type { ICEAssetContractStats } from '../output/assetContract.js';
import { validateSource } from '../scene/validateSource.js';
import { prepareMesh } from '../scene/prepareMesh.js';
import { collectNodeWorldMatrices } from '../scene/nodeMatrices.js';
import type { ICEMatrix4Tuple } from '../scene/bakeMatrix.js';
import { allocateAdaptiveLod } from '../lod/allocateAdaptiveLod.js';
import { allocateLodTargets } from '../lod/allocateLodTargets.js';
import { classifyAdaptiveUnits } from '../lod/classifyAdaptiveUnits.js';
import {
  createGeometryWorkspace,
  type ICEGeometryWorkspace,
} from '../lod/createGeometryWorkspace.js';
import { createLodUnitCurve } from '../lod/createLodUnitCurve.js';
import { simplifyGeometry } from '../lod/simplifyGeometry.js';
import type { ICELodUnitCurve } from '../lod/types.js';
import { analyzePartitionUnits } from './analyzePartitionUnits.js';
import { createPartitionPlan } from './createPartitionPlan.js';
import {
  createTilesetDocument,
  type ICEFinishedTile,
  type ICETilesetDocument,
} from './tileset.js';
import type {
  ICEBounds,
  ICEPartitionFile,
  ICEPartitionOptions,
  ICEPartitionPlanNode,
  ICEPartitionUnit,
} from './types.js';

export interface ICEPartitionResult {
  readonly files: readonly ICEPartitionFile[];
  readonly tileset: ICETilesetDocument;
  readonly partitionCount: number;
  readonly stats: {
    readonly triangleCount: number;
    readonly nodeCount: number;
    readonly maxPartBytes: number;
    readonly coarseTriangleCount: number;
    readonly coarseBytes: number;
    readonly maxCoarseBytes: number;
    readonly preservedCoarseUnits: number;
    readonly overBudgetCoarseNodes: number;
    readonly coarseContentCount: number;
    readonly maxCoarseChunkBytes: number;
    readonly oversizedCoarseChunks: number;
    readonly coarseTriangleRatio: number;
    readonly coarseByteRatio: number;
    readonly allocationMode: 'proportional' | 'adaptive';
    readonly adaptiveUnitCount: number;
    readonly minimumUnitTriangleRatio: number;
    readonly maximumUnitTriangleRatio: number;
    readonly maximumErrorMeters: number;
    readonly curveSampleCount: number;
  };
  readonly warnings: readonly string[];
}

interface BuiltTree {
  readonly partitionId: string;
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly import('./types.js').ICEPartitionUnit[];
  readonly children: readonly BuiltTree[];
  readonly contentUri?: string;
  readonly coarseUri?: string;
  readonly coarseContents?: readonly {
    readonly uri: string;
    readonly bytes: Uint8Array;
  }[];
  readonly coarseTriangleCount?: number;
  readonly coarseError?: number;
  readonly bytes?: Uint8Array;
  readonly coarseBytes?: Uint8Array;
  readonly stats?: ICEAssetContractStats;
  readonly coarseStats?: ICEAssetContractStats;
  readonly warnings: readonly string[];
}

const DEFAULT_MAX_TRIANGLES = 500_000;
const DEFAULT_MAX_BYTES = 33_554_432;

export async function partitionAsset(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
): Promise<ICEPartitionResult> {
  const assetId = options.assetId.trim();
  if (!assetId) {
    throw new Error(
      'ICE3_TOOL_PARTITION_OPTIONS_INVALID: assetId must not be empty',
    );
  }
  const maxTriangles = options.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  validatePositive(maxTriangles, 'maxTriangles');
  validatePositive(maxBytes, 'maxBytes');
  const sourceReport = validateSource(source);
  if (sourceReport.errors.length > 0) {
    throw new Error(`ICE3_TOOL_SOURCE_UNSUPPORTED: ${sourceReport.errors.join(', ')}`);
  }

  const analysis = analyzePartitionUnits(source);
  const plan = createPartitionPlan(analysis.units, maxTriangles);
  const workspace = options.lod
    ? await createGeometryWorkspace({
        maxMemoryBytes: options.lod.maxMemoryBytes ?? 67_108_864,
      })
    : undefined;
  try {
    const normalized = workspace
      ? await normalizeLodGeometry(source, analysis.units, workspace)
      : new Map<string, ICNormalizedPrimitive>();
    const state: ICBuildState = {
      nextLeaf: 0,
      preservedCoarseUnits: new Set<string>(),
      overBudgetCoarseNodes: 0,
      worldMatrices: collectNodeWorldMatrices(source),
      lodCurveCache: new Map(),
      adaptiveUnitIds: new Set(),
      adaptiveRatios: [],
      maximumAdaptiveErrorMeters: 0,
    };
    const built = await buildNode(
      source,
      options,
      plan,
      maxTriangles,
      maxBytes,
      'group-root',
      state,
      workspace,
      normalized,
    );
    const leaves = collectLeaves(built);
    const files: ICEPartitionFile[] = [];
    collectFiles(built, files);
    const tileset = createTilesetDocument(
      assetId,
      createFinishedTree(built).tile,
    );
    const triangleCount = leaves.reduce(
      (total, leaf) => total + (leaf.stats?.triangleCount ?? 0),
      0,
    );
    if (triangleCount !== analysis.triangleCount) {
      throw new Error(
        `ICE3_TOOL_TILESET_INVALID: triangle count ${triangleCount} does not match ${analysis.triangleCount}`,
      );
    }
    const nodeCount = leaves.reduce(
      (total, leaf) => total + (leaf.stats?.nodeCount ?? 0),
      0,
    );
    const expectedNodeCount = new Set(
      analysis.units.flatMap((unit) => unit.nodeIndices),
    ).size;
    if (nodeCount !== expectedNodeCount) {
      throw new Error(
        `ICE3_TOOL_TILESET_INVALID: node count ${nodeCount} does not match ${expectedNodeCount}`,
      );
    }
    const paths = new Set(files.map((file) => file.path));
    if (paths.size !== files.length) {
      throw new Error('ICE3_TOOL_TILESET_INVALID: partition paths are not unique');
    }
    const maxPartBytes = Math.max(
      ...leaves.map((leaf) => leaf.bytes!.byteLength),
    );
    if (maxPartBytes > maxBytes) {
      throw new Error(
        'ICE3_TOOL_PARTITION_UNSPLITTABLE: a partition exceeds maxBytes',
      );
    }
    const coarseTrees = collectCoarseTrees(built);
    const coarseChunkBytes = coarseTrees.flatMap(coarseTreeChunkBytes);
    const coarseBytes = coarseChunkBytes.reduce(
      (total, bytes) => total + bytes,
      0,
    );
    const fineBytes = leaves.reduce(
      (total, leaf) => total + leaf.bytes!.byteLength,
      0,
    );
    const coarseTriangles = coarseTrees.reduce(
      (total, tree) => total + (tree.coarseTriangleCount ?? 0),
      0,
    );
    const chunkLimit = options.lod?.coarseChunkMaxBytes
      ?? options.maxBytes
      ?? DEFAULT_MAX_BYTES;
    return {
      files,
      tileset,
      partitionCount: leaves.length,
      stats: {
        triangleCount,
        nodeCount,
        maxPartBytes,
        coarseTriangleCount: coarseTriangles,
        coarseBytes,
        maxCoarseBytes: Math.max(0, ...coarseChunkBytes),
        preservedCoarseUnits: state.preservedCoarseUnits.size,
        overBudgetCoarseNodes: state.overBudgetCoarseNodes,
        coarseContentCount: coarseChunkBytes.length,
        maxCoarseChunkBytes: Math.max(0, ...coarseChunkBytes),
        oversizedCoarseChunks: coarseChunkBytes.filter(
          (bytes) => bytes > chunkLimit,
        ).length,
        coarseTriangleRatio: triangleCount === 0
          ? 0
          : coarseTriangles / triangleCount,
        coarseByteRatio: fineBytes === 0 ? 0 : coarseBytes / fineBytes,
        allocationMode: options.lod?.allocation ?? 'proportional',
        adaptiveUnitCount: state.adaptiveUnitIds.size,
        minimumUnitTriangleRatio: Math.min(
          ...(state.adaptiveRatios.length > 0
            ? state.adaptiveRatios
            : [0]),
        ),
        maximumUnitTriangleRatio: Math.max(
          0,
          ...state.adaptiveRatios,
        ),
        maximumErrorMeters: state.maximumAdaptiveErrorMeters,
        curveSampleCount: options.lod?.allocation === 'adaptive'
          ? options.lod.curveSamples ?? 8
          : 0,
      },
      warnings: [...new Set(leaves.flatMap((leaf) => leaf.warnings))],
    };
  } finally {
    await workspace?.dispose();
  }
}

interface ICNormalizedPrimitive {
  readonly key: string;
  readonly triangleCount: number;
  readonly hasVertexColors: boolean;
}

interface ICBuildState {
  nextLeaf: number;
  readonly preservedCoarseUnits: Set<string>;
  overBudgetCoarseNodes: number;
  readonly worldMatrices: readonly ICEMatrix4Tuple[];
  readonly lodCurveCache: Map<string, Promise<ICELodUnitCurve>>;
  readonly adaptiveUnitIds: Set<string>;
  readonly adaptiveRatios: number[];
  maximumAdaptiveErrorMeters: number;
}

interface ICoarseAdaptiveMetrics {
  readonly unitIds: readonly string[];
  readonly ratios: readonly number[];
  readonly maximumErrorMeters: number;
}

interface ICoarseSelection {
  readonly overrides: ReadonlyMap<string, {
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly colors?: Float32Array;
  }>;
  readonly maximumError: number;
  readonly preservedUnits: readonly string[];
  readonly allocatedTriangles: number;
  readonly adaptiveMetrics?: ICoarseAdaptiveMetrics;
}

async function buildNode(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
  node: ICEPartitionPlanNode,
  maxTriangles: number,
  maxBytes: number,
  partitionId: string,
  state: ICBuildState,
  workspace?: ICEGeometryWorkspace,
  normalized = new Map<string, ICNormalizedPrimitive>(),
): Promise<BuiltTree> {
  if (node.children.length > 0) {
    const children = await Promise.all(node.children.map((child, index) => (
      buildNode(
        source,
        options,
        child,
        maxTriangles,
        maxBytes,
        `${partitionId}-${index}`,
        state,
        workspace,
        normalized,
      )
    )));
    const coarse = options.lod && workspace
      ? await buildCoarseNode(
          source,
          options,
          node,
          partitionId,
          state,
          workspace,
          normalized,
        )
      : undefined;
    return {
      partitionId,
      bounds: node.bounds,
      triangleCount: node.triangleCount,
      units: node.units,
      children,
      ...(coarse ?? {}),
      warnings: [...new Set(children.flatMap((child) => child.warnings))],
    };
  }
  const nodeIndices = node.units.flatMap((unit) => unit.nodeIndices);
  const built = buildPreparedGLB(source, {
    assetId: options.assetId.trim(),
    ...(options.creaseAngleDegrees === undefined
      ? {}
      : { creaseAngleDegrees: options.creaseAngleDegrees }),
    edges: options.edges !== false,
    ...(options.budget === undefined ? {} : { budget: options.budget }),
    selection: {
      nodeIndices,
      flattenWorldTransforms: true,
    },
  });
  if (built.budget.status === 'error') {
    throw new Error('ICE3_TOOL_BUDGET_EXCEEDED: partition exceeds hard budget');
  }
  if (built.bytes.byteLength <= maxBytes) {
    const contentUri = `parts/part-${String(state.nextLeaf).padStart(3, '0')}.glb`;
    state.nextLeaf += 1;
    return {
      partitionId,
      bounds: node.bounds,
      triangleCount: node.triangleCount,
      units: node.units,
      children: [],
      contentUri,
      bytes: built.bytes,
      stats: built.stats,
      warnings: built.budget.status === 'warning'
        ? [`ICE3_TOOL_BUDGET_WARNING:${built.budget.profile}`]
        : [],
    };
  }
  if (node.units.length === 1) {
    throw new Error(
      'ICE3_TOOL_PARTITION_UNSPLITTABLE: one semantic unit exceeds maxBytes',
    );
  }
  const nextBudget = Math.max(
    1,
    Math.floor(node.triangleCount / 2),
  );
  const split = createPartitionPlan(
    node.units,
    Math.min(maxTriangles, nextBudget),
  );
  if (split.children.length === 0) {
    throw new Error(
      'ICE3_TOOL_PARTITION_UNSPLITTABLE: semantic units cannot satisfy maxBytes',
    );
  }
  const children = await Promise.all(split.children.map((child, index) => (
    buildNode(
      source,
      options,
      child,
      maxTriangles,
      maxBytes,
      `${partitionId}-${index}`,
      state,
      workspace,
      normalized,
    )
  )));
  const coarse = options.lod && workspace
    ? await buildCoarseNode(
        source,
        options,
        node,
        partitionId,
        state,
        workspace,
        normalized,
      )
    : undefined;
  return {
    partitionId,
    bounds: split.bounds,
    triangleCount: split.triangleCount,
    units: split.units,
    children,
    ...(coarse ?? {}),
    warnings: [...new Set(children.flatMap((child) => child.warnings))],
  };
}

async function buildCoarseNode(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
  node: ICEPartitionPlanNode,
  partitionId: string,
  state: ICBuildState,
  workspace: ICEGeometryWorkspace,
  normalized: ReadonlyMap<string, ICNormalizedPrimitive>,
): Promise<Pick<
  BuiltTree,
  'coarseUri' | 'coarseContents' | 'coarseTriangleCount' | 'coarseError' | 'coarseBytes' | 'coarseStats'
>> {
  const lod = options.lod!;
  const limit = lod.coarseChunkMaxBytes
    ?? options.maxBytes
    ?? DEFAULT_MAX_BYTES;
  const built = await buildSingleCoarseNode(
    source,
    options,
    node,
    partitionId,
    state,
    workspace,
    normalized,
  );
  if (built.coarseBytes!.byteLength <= limit || node.units.length === 1) {
    for (const unitId of built.preservedUnits) {
      state.preservedCoarseUnits.add(unitId);
    }
    if (built.overBudget) state.overBudgetCoarseNodes += 1;
    if (built.adaptiveMetrics) {
      const { unitIds, ratios, maximumErrorMeters } = built.adaptiveMetrics;
      state.adaptiveRatios.push(...ratios);
      state.maximumAdaptiveErrorMeters = Math.max(
        state.maximumAdaptiveErrorMeters,
        maximumErrorMeters,
      );
      for (const unitId of classifyAdaptiveUnits(unitIds, ratios)) {
        state.adaptiveUnitIds.add(unitId);
      }
    }
    return {
      coarseUri: built.coarseUri!,
      coarseTriangleCount: built.coarseTriangleCount!,
      coarseError: built.coarseError!,
      coarseBytes: built.coarseBytes!,
      coarseStats: built.coarseStats!,
    };
  }
  const middle = Math.ceil(node.units.length / 2);
  const split = [
    node.units.slice(0, middle),
    node.units.slice(middle),
  ] as const;
  const children = await Promise.all(split.map((units, index) => (
    buildCoarseNode(
      source,
      options,
      {
        bounds: node.bounds,
        triangleCount: units.reduce(
          (total, unit) => total + unit.triangleCount,
          0,
        ),
        units,
        children: [],
      },
      `${partitionId}/part-${String(index).padStart(3, '0')}`,
      state,
      workspace,
      normalized,
    )
  )));
  const coarseContents = children.flatMap((child) => [
    ...(child.coarseUri && child.coarseBytes
      ? [{ uri: child.coarseUri, bytes: child.coarseBytes }]
      : []),
    ...(child.coarseContents ?? []),
  ]);
  return {
    coarseContents,
    coarseTriangleCount: children.reduce(
      (total, child) => total + (child.coarseTriangleCount ?? 0),
      0,
    ),
    coarseError: Math.max(...children.map((child) => child.coarseError ?? 0)),
  };
}

async function buildSingleCoarseNode(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
  node: ICEPartitionPlanNode,
  partitionId: string,
  state: ICBuildState,
  workspace: ICEGeometryWorkspace,
  normalized: ReadonlyMap<string, ICNormalizedPrimitive>,
): Promise<Pick<
  BuiltTree,
  'coarseUri' | 'coarseTriangleCount' | 'coarseError' | 'coarseBytes' | 'coarseStats'
> & {
  readonly preservedUnits: readonly string[];
  readonly overBudget: boolean;
  readonly adaptiveMetrics?: ICoarseAdaptiveMetrics;
}> {
  const lod = options.lod!;
  const selection = lod.allocation === 'adaptive'
    ? await selectAdaptiveCoarseGeometry(
        source,
        options,
        node,
        state,
        workspace,
        normalized,
      )
    : await selectProportionalCoarseGeometry(
        source,
        options,
        node,
        state,
        workspace,
        normalized,
      );
  const built = buildPreparedGLB(source, {
    assetId: `${options.assetId.trim()}:lod:${partitionId}`,
    selectionIdAssetId: options.assetId.trim(),
    geometryOverrides: selection.overrides,
    ...(options.creaseAngleDegrees === undefined
      ? {}
      : { creaseAngleDegrees: options.creaseAngleDegrees }),
    edges: options.edges !== false,
    ...(options.budget === undefined ? {} : { budget: options.budget }),
    selection: {
      nodeIndices: node.units.flatMap((unit) => unit.nodeIndices),
      flattenWorldTransforms: true,
    },
  });
  if (built.budget.status === 'error') {
    throw new Error('ICE3_TOOL_BUDGET_EXCEEDED: coarse partition exceeds budget');
  }
  const overBudget = (
    selection.allocatedTriangles > lod.maxTrianglesPerProxy
    || built.stats.triangleCount > lod.maxTrianglesPerProxy
  );
  return {
    coarseUri: `coarse/${partitionId}.glb`,
    coarseTriangleCount: built.stats.triangleCount,
    coarseError: selection.maximumError,
    coarseBytes: built.bytes,
    coarseStats: built.stats,
    preservedUnits: selection.preservedUnits,
    overBudget,
    ...(selection.adaptiveMetrics
      ? { adaptiveMetrics: selection.adaptiveMetrics }
      : {}),
  };
}

async function selectProportionalCoarseGeometry(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
  node: ICEPartitionPlanNode,
  state: ICBuildState,
  workspace: ICEGeometryWorkspace,
  normalized: ReadonlyMap<string, ICNormalizedPrimitive>,
): Promise<ICoarseSelection> {
  const lod = options.lod!;
  const targets = allocateLodTargets(node.units, lod);
  const overrides = new Map<string, {
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly colors?: Float32Array;
  }>();
  let maximumError = 0;
  const preservedUnits: string[] = [];
  for (const [unitIndex, unit] of node.units.entries()) {
    const target = targets[unitIndex]!;
    let preserved = false;
    for (const meshIndex of unit.meshIndices) {
      for (const primitive of meshPrimitives(source, meshIndex)) {
        const key = `${meshIndex}:${primitive.index}`;
        const info = normalized.get(key);
        if (!info) continue;
        const geometry = await workspace.read(info.key);
        const colorData = info.hasVertexColors
          ? readAccessor(
              source,
              Number(record(primitive.value.attributes)?.COLOR_0),
            )
          : undefined;
        if (
          colorData
          && (
            colorData.kind !== 'float32'
            || (colorData.components !== 3 && colorData.components !== 4)
          )
        ) {
          throw new Error(
            'ICE3_TOOL_LOD_INVALID: vertex colors must be float VEC3 or VEC4',
          );
        }
        const primitiveTarget = Math.max(
          1,
          Math.floor(
            target.targetTriangles
              * info.triangleCount
              / Math.max(1, unit.triangleCount),
          ),
        );
        const simplified = await simplifyGeometry(
          geometry.positions,
          geometry.indices,
          {
            targetTriangles: primitiveTarget,
            minimumTriangles: 1,
            ...(colorData ? { vertexColors: colorData.values } : {}),
          },
        );
        preserved ||= simplified.preservedSource;
        overrides.set(key, {
          positions: simplified.positions,
          indices: simplified.indices,
          ...(simplified.colors ? { colors: simplified.colors } : {}),
        });
        maximumError = Math.max(
          maximumError,
          simplified.errorMeters * maximumWorldScale(
            state.worldMatrices,
            unit.nodeIndices,
          ),
        );
      }
    }
    if (preserved) {
      preservedUnits.push(unit.nodeIndices.join(','));
    }
  }
  return {
    overrides,
    maximumError,
    preservedUnits,
    allocatedTriangles: targets.reduce(
      (total, target) => total + target.targetTriangles,
      0,
    ),
  };
}

async function selectAdaptiveCoarseGeometry(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
  node: ICEPartitionPlanNode,
  state: ICBuildState,
  workspace: ICEGeometryWorkspace,
  normalized: ReadonlyMap<string, ICNormalizedPrimitive>,
): Promise<ICoarseSelection> {
  const lod = options.lod!;
  const curves = await Promise.all(node.units.map((unit) => (
    loadUnitCurve(source, unit, options, state, workspace, normalized)
  )));
  const proportionalBudget = allocateLodTargets(node.units, lod).reduce(
    (total, target) => total + target.targetTriangles,
    0,
  );
  const allocation = allocateAdaptiveLod({
    curves,
    maxTriangles: Math.min(
      lod.maxTrianglesPerProxy,
      proportionalBudget,
    ),
    nodeDiagonalMeters: boundsDiagonal(node.bounds),
  });
  const selectionByUnit = new Map(
    allocation.selections.map((selection) => (
      [selection.unitId, selection] as const
    )),
  );
  const overrides = new Map<string, {
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly colors?: Float32Array;
  }>();
  const preservedUnits: string[] = [];
  const unitIds: string[] = [];
  const ratios: number[] = [];
  for (const unit of node.units) {
    const unitId = unit.nodeIndices.join(',');
    const unitSelection = selectionByUnit.get(unitId);
    if (!unitSelection) {
      throw new Error('ICE3_TOOL_LOD_INVALID: adaptive selection is missing');
    }
    unitIds.push(unitId);
    ratios.push(
      unitSelection.actualTriangles / Math.max(1, unit.triangleCount),
    );
    if (unitSelection.preservedSource) preservedUnits.push(unitId);
    for (const primitive of unitSelection.primitives) {
      const geometry = await workspace.read(primitive.geometryKey);
      overrides.set(primitive.sourceKey, {
        positions: geometry.positions,
        indices: geometry.indices,
        ...(geometry.colors ? { colors: geometry.colors } : {}),
      });
    }
  }
  return {
    overrides,
    maximumError: allocation.maximumErrorMeters,
    preservedUnits,
    allocatedTriangles: allocation.allocatedTriangles,
    adaptiveMetrics: {
      unitIds,
      ratios,
      maximumErrorMeters: allocation.maximumErrorMeters,
    },
  };
}

function loadUnitCurve(
  source: ICESourceDocument,
  unit: ICEPartitionUnit,
  options: ICEPartitionOptions,
  state: ICBuildState,
  workspace: ICEGeometryWorkspace,
  normalized: ReadonlyMap<string, ICNormalizedPrimitive>,
): Promise<ICELodUnitCurve> {
  const unitId = unit.nodeIndices.join(',');
  const cached = state.lodCurveCache.get(unitId);
  if (cached) return cached;
  const primitives = unit.meshIndices.flatMap((meshIndex) => (
    meshPrimitives(source, meshIndex).flatMap((primitive) => {
      const normalizedPrimitive = normalized.get(
        `${meshIndex}:${primitive.index}`,
      );
      return normalizedPrimitive
        ? [{
            sourceKey: normalizedPrimitive.key,
            workspaceKey: normalizedPrimitive.key,
            triangleCount: normalizedPrimitive.triangleCount,
          }]
        : [];
    })
  ));
  const pending = createLodUnitCurve({
    unitId,
    sourceTriangles: unit.triangleCount,
    primitives,
    workspace,
    minimumTriangles: options.lod!.minTrianglesPerUnit,
    sampleCount: options.lod!.curveSamples ?? 8,
    worldScale: maximumWorldScale(state.worldMatrices, unit.nodeIndices),
  });
  state.lodCurveCache.set(unitId, pending);
  pending.catch(() => {
    if (state.lodCurveCache.get(unitId) === pending) {
      state.lodCurveCache.delete(unitId);
    }
  });
  return pending;
}

function boundsDiagonal(bounds: ICEBounds): number {
  return Math.max(
    Number.EPSILON,
    Math.hypot(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ),
  );
}

async function normalizeLodGeometry(
  source: ICESourceDocument,
  units: readonly import('./types.js').ICEPartitionUnit[],
  workspace: ICEGeometryWorkspace,
): Promise<Map<string, ICNormalizedPrimitive>> {
  const normalized = new Map<string, ICNormalizedPrimitive>();
  const meshIndices = new Set(units.flatMap((unit) => unit.meshIndices));
  for (const meshIndex of meshIndices) {
    for (const primitive of meshPrimitives(source, meshIndex)) {
      const attributes = record(primitive.value.attributes);
      const positionAccessorIndex = Number(attributes?.POSITION);
      const positionData = readAccessor(source, positionAccessorIndex);
      if (positionData.kind !== 'float32' || positionData.components !== 3) {
        throw new Error('ICE3_TOOL_LOD_INVALID: POSITION must be float VEC3');
      }
      const indexData = primitive.value.indices === undefined
        ? {
            values: Array.from(
              { length: positionData.values.length / 3 },
              (_value, index) => index,
            ),
          }
        : readAccessor(source, Number(primitive.value.indices));
      const prepared = prepareMesh(
        positionData.values,
        new Uint32Array(indexData.values),
        30,
        {
          id: `workspace:${meshIndex}:${primitive.index}`,
          mode: Number(primitive.value.mode ?? 4) as 4 | 5 | 6,
          generateEdges: false,
        },
      );
      const key = `${meshIndex}:${primitive.index}`;
      const colorData = attributes?.COLOR_0 === undefined
        ? undefined
        : readAccessor(source, Number(attributes.COLOR_0));
      if (
        colorData
        && (
          colorData.kind !== 'float32'
          || (colorData.components !== 3 && colorData.components !== 4)
        )
      ) {
        throw new Error(
          'ICE3_TOOL_LOD_INVALID: vertex colors must be float VEC3 or VEC4',
        );
      }
      await workspace.write(key, {
        positions: prepared.positions,
        indices: new Uint32Array(prepared.indices),
        ...(colorData ? { colors: colorData.values } : {}),
      });
      normalized.set(key, {
        key,
        triangleCount: prepared.indices.length / 3,
        hasVertexColors: attributes?.COLOR_0 !== undefined,
      });
    }
  }
  return normalized;
}

function meshPrimitives(
  source: ICESourceDocument,
  meshIndex: number,
): readonly {
  readonly index: number;
  readonly value: Record<string, unknown>;
}[] {
  const mesh = records(source.json.meshes)[meshIndex];
  return records(mesh?.primitives)
    .map((value, index) => ({ index, value }))
    .filter(({ value }) => Number(value.mode ?? 4) !== 1);
}

function maximumWorldScale(
  matrices: readonly ICEMatrix4Tuple[],
  nodeIndices: readonly number[],
): number {
  return Math.max(
    0,
    ...nodeIndices.map((nodeIndex) => {
      const matrix = matrices[nodeIndex]!;
      return Math.max(
        Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!),
        Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
        Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!),
      );
    }),
  );
}

function collectLeaves(tree: BuiltTree): BuiltTree[] {
  return tree.children.length === 0
    ? [tree]
    : tree.children.flatMap(collectLeaves);
}

function collectFiles(tree: BuiltTree, files: ICEPartitionFile[]): void {
  if (tree.contentUri && tree.bytes) {
    files.push({ path: tree.contentUri, bytes: tree.bytes });
  }
  if (tree.coarseUri && tree.coarseBytes) {
    files.push({ path: tree.coarseUri, bytes: tree.coarseBytes });
  }
  for (const content of tree.coarseContents ?? []) {
    files.push({ path: content.uri, bytes: content.bytes });
  }
  for (const child of tree.children) collectFiles(child, files);
}

function collectCoarseTrees(tree: BuiltTree): BuiltTree[] {
  return [
    ...(tree.coarseBytes || tree.coarseContents?.length ? [tree] : []),
    ...tree.children.flatMap(collectCoarseTrees),
  ];
}

function createFinishedTree(
  tree: BuiltTree,
): { tile: ICEFinishedTile } {
  if (tree.children.length === 0) {
    return {
      tile: {
        bounds: tree.bounds,
        contentUri: tree.contentUri!,
        partitionId: tree.partitionId,
        geometricError: 0,
        children: [],
      },
    };
  }
  const children = tree.children.map((child) => createFinishedTree(child).tile);
  const contentUris = [
    ...(tree.coarseUri ? [tree.coarseUri] : []),
    ...(tree.coarseContents?.map((content) => content.uri) ?? []),
  ];
  return {
    tile: {
      bounds: tree.bounds,
      ...(contentUris.length === 1
        ? { contentUri: contentUris[0]! }
        : { contentUris }),
      partitionId: tree.partitionId,
      geometricError: Math.max(
        tree.coarseError ?? 0,
        ...children.map((child) => child.geometricError),
      ),
      children,
    },
  };
}

function coarseTreeBytes(tree: BuiltTree): number {
  return (tree.coarseBytes?.byteLength ?? 0)
    + (tree.coarseContents?.reduce(
      (total, content) => total + content.bytes.byteLength,
      0,
    ) ?? 0);
}

function coarseTreeChunkBytes(tree: BuiltTree): number[] {
  return [
    ...(tree.coarseBytes ? [tree.coarseBytes.byteLength] : []),
    ...(tree.coarseContents?.map((content) => content.bytes.byteLength) ?? []),
  ];
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

function validatePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `ICE3_TOOL_PARTITION_OPTIONS_INVALID: ${name} must be positive`,
    );
  }
}
