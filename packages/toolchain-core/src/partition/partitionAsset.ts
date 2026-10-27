import type { ICESourceDocument } from '../source/readSource.js';
import { buildPreparedGLB } from '../output/buildPreparedGLB.js';
import type { ICEAssetContractStats } from '../output/assetContract.js';
import { validateSource } from '../scene/validateSource.js';
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
} from './types.js';

export interface ICEPartitionResult {
  readonly files: readonly ICEPartitionFile[];
  readonly tileset: ICETilesetDocument;
  readonly partitionCount: number;
  readonly stats: {
    readonly triangleCount: number;
    readonly nodeCount: number;
    readonly maxPartBytes: number;
  };
}

interface BuiltTree {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly import('./types.js').ICEPartitionUnit[];
  readonly children: readonly BuiltTree[];
  readonly bytes?: Uint8Array;
  readonly stats?: ICEAssetContractStats;
}

const DEFAULT_MAX_TRIANGLES = 500_000;
const DEFAULT_MAX_BYTES = 33_554_432;

export function partitionAsset(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
): ICEPartitionResult {
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
  const built = buildNode(source, options, plan, maxTriangles, maxBytes);
  const leaves = collectLeaves(built);
  const files: ICEPartitionFile[] = leaves.map((leaf, index) => ({
    path: `parts/part-${String(index).padStart(3, '0')}.glb`,
    bytes: leaf.bytes!,
  }));
  const finished = createFinishedTree(built, 'group-root', files, 0);
  const tileset = createTilesetDocument(assetId, finished.tile);

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
  const maxPartBytes = Math.max(...files.map((file) => file.bytes.byteLength));
  if (maxPartBytes > maxBytes) {
    throw new Error(
      'ICE3_TOOL_PARTITION_UNSPLITTABLE: a partition exceeds maxBytes',
    );
  }
  return {
    files,
    tileset,
    partitionCount: files.length,
    stats: {
      triangleCount,
      nodeCount,
      maxPartBytes,
    },
  };
}

function buildNode(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
  node: ICEPartitionPlanNode,
  maxTriangles: number,
  maxBytes: number,
): BuiltTree {
  if (node.children.length > 0) {
    return {
      bounds: node.bounds,
      triangleCount: node.triangleCount,
      units: node.units,
      children: node.children.map((child) => (
        buildNode(source, options, child, maxTriangles, maxBytes)
      )),
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
    return {
      bounds: node.bounds,
      triangleCount: node.triangleCount,
      units: node.units,
      children: [],
      bytes: built.bytes,
      stats: built.stats,
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
  return {
    bounds: split.bounds,
    triangleCount: split.triangleCount,
    units: split.units,
    children: split.children.map((child) => (
      buildNode(source, options, child, maxTriangles, maxBytes)
    )),
  };
}

function collectLeaves(tree: BuiltTree): BuiltTree[] {
  return tree.children.length === 0
    ? [tree]
    : tree.children.flatMap(collectLeaves);
}

function createFinishedTree(
  tree: BuiltTree,
  partitionId: string,
  files: readonly ICEPartitionFile[],
  leafOffset: number,
): { tile: ICEFinishedTile; nextLeaf: number } {
  if (tree.children.length === 0) {
    const contentUri = files[leafOffset]!.path;
    return {
      tile: {
        bounds: tree.bounds,
        contentUri,
        partitionId: contentUri.split('/').at(-1)!.replace('.glb', ''),
        children: [],
      },
      nextLeaf: leafOffset + 1,
    };
  }
  let nextLeaf = leafOffset;
  const children: ICEFinishedTile[] = [];
  for (const [index, child] of tree.children.entries()) {
    const builtChild = createFinishedTree(
      child,
      `${partitionId}-${index}`,
      files,
      nextLeaf,
    );
    children.push(builtChild.tile);
    nextLeaf = builtChild.nextLeaf;
  }
  return {
    tile: {
      bounds: tree.bounds,
      contentUri: '',
      partitionId,
      children,
    },
    nextLeaf,
  };
}

function validatePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `ICE3_TOOL_PARTITION_OPTIONS_INVALID: ${name} must be positive`,
    );
  }
}
