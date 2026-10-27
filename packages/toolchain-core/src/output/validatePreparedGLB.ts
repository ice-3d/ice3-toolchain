import { createHash } from 'node:crypto';
import type { ICESourceReport } from '../scene/validateSource.js';
import {
  BUDGET_PROFILES,
  evaluateAssetBudget,
} from './evaluateAssetBudget.js';

type JSONRecord = Record<string, unknown>;

interface ParsedGLB {
  readonly json: JSONRecord;
  readonly binary: Buffer;
}

export function validatePreparedGLB(bytes: Uint8Array): ICESourceReport {
  const errors = new Set<string>();
  let parsed: ParsedGLB;
  try {
    parsed = parseGLB(Buffer.from(bytes));
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : 'ICE3_TOOL_INVALID_GLB'],
      warnings: [],
    };
  }

  const json = parsed.json;
  const asset = record(json.asset);
  const profile = record(record(asset?.extras)?.ice3);
  if (
    profile?.profile !== 'ice3-prepared'
    || profile.profileVersion !== '1.0'
    || typeof profile.assetId !== 'string'
  ) {
    errors.add('ICE3_TOOL_PROFILE_MISSING');
    return { errors: [...errors], warnings: [] };
  }

  const digest = record(profile.contentDigest);
  const binaryDigest = createHash('sha256')
    .update(parsed.binary)
    .digest('hex');
  if (digest?.algorithm !== 'sha256' || digest.value !== binaryDigest) {
    errors.add('ICE3_TOOL_CONTENT_DIGEST_MISMATCH');
  }

  if (asset?.version !== '2.0') {
    errors.add('ICE3_TOOL_INVALID_ASSET_VERSION');
  }
  if (Array.isArray(json.extensionsRequired) && json.extensionsRequired.length > 0) {
    errors.add('ICE3_TOOL_UNSUPPORTED_EXTENSION');
  }
  for (const [field, code] of [
    ['animations', 'ICE3_TOOL_UNSUPPORTED_ANIMATION'],
    ['skins', 'ICE3_TOOL_UNSUPPORTED_SKIN'],
    ['cameras', 'ICE3_TOOL_UNSUPPORTED_CAMERA'],
    ['textures', 'ICE3_TOOL_UNSUPPORTED_TEXTURE'],
    ['images', 'ICE3_TOOL_UNSUPPORTED_IMAGE'],
    ['samplers', 'ICE3_TOOL_UNSUPPORTED_SAMPLER'],
  ] as const) {
    if (Array.isArray(json[field]) && json[field].length > 0) {
      errors.add(code);
    }
  }

  const scenes = records(json.scenes);
  if (
    scenes.length !== 1
    || !Number.isInteger(json.scene)
    || Number(json.scene) !== 0
  ) {
    errors.add('ICE3_TOOL_INVALID_SCENE');
  }
  const buffers = records(json.buffers);
  if (
    buffers.length !== 1
    || buffers[0]?.uri !== undefined
    || Number(buffers[0]?.byteLength) > parsed.binary.byteLength
  ) {
    errors.add('ICE3_TOOL_INVALID_BUFFER');
  }

  const nodes = records(json.nodes);
  const ids = new Set<string>();
  for (const node of nodes) {
    const nodeProfile = record(record(node.extras)?.ice3);
    const id = nodeProfile?.id;
    if (typeof id !== 'string' || !id || ids.has(id)) {
      errors.add('ICE3_TOOL_DUPLICATE_ID');
    } else {
      ids.add(id);
    }
    const matrix = node.matrix;
    if (
      !Array.isArray(matrix)
      || matrix.length !== 16
      || matrix.some((value) => typeof value !== 'number' || !Number.isFinite(value))
      || node.translation !== undefined
      || node.rotation !== undefined
      || node.scale !== undefined
    ) {
      errors.add('ICE3_TOOL_INVALID_NODE_TRANSFORM');
    }
  }

  const accessors = records(json.accessors);
  const views = records(json.bufferViews);
  for (const [index, view] of views.entries()) {
    const offset = Number(view.byteOffset ?? 0);
    const length = Number(view.byteLength);
    if (
      !Number.isInteger(offset)
      || !Number.isInteger(length)
      || offset % 4 !== 0
      || offset < 0
      || length < 0
      || offset + length > parsed.binary.byteLength
      || view.buffer !== 0
      || view.byteStride !== undefined
    ) {
      errors.add(`ICE3_TOOL_INVALID_BUFFER_VIEW:${index}`);
    }
  }
  for (const [index, accessor] of accessors.entries()) {
    const viewIndex = Number(accessor.bufferView);
    if (!views[viewIndex] || accessor.sparse !== undefined || accessor.normalized === true) {
      errors.add(`ICE3_TOOL_INVALID_ACCESSOR:${index}`);
    }
  }

  const meshes = records(json.meshes);
  let primitiveCount = 0;
  let triangleCount = 0;
  let edgeSegmentCount = 0;
  for (const [meshIndex, mesh] of meshes.entries()) {
    for (const [primitiveIndex, primitive] of records(mesh.primitives).entries()) {
      primitiveCount += 1;
      const mode = Number(primitive.mode ?? 4);
      const path = `${meshIndex}:${primitiveIndex}`;
      if (mode !== 4 && mode !== 1) {
        errors.add(`ICE3_TOOL_INVALID_PRIMITIVE_MODE:${path}`);
        continue;
      }
      const positionIndex = Number(record(primitive.attributes)?.POSITION);
      const indexIndex = Number(primitive.indices);
      const colorIndexRaw = record(primitive.attributes)?.COLOR_0;
      const colorIndex = colorIndexRaw === undefined ? undefined : Number(colorIndexRaw);
      const position = accessors[positionIndex];
      const indices = accessors[indexIndex];
      const colors = colorIndex === undefined ? undefined : accessors[colorIndex];
      if (
        position?.componentType !== 5126
        || position.type !== 'VEC3'
        || ![5123, 5125].includes(Number(indices?.componentType))
        || indices?.type !== 'SCALAR'
      ) {
        errors.add(`ICE3_TOOL_INVALID_PRIMITIVE_ACCESSORS:${path}`);
        continue;
      }
      if (
        colorIndex !== undefined
        && (
          colors?.componentType !== 5126
          || colors.type !== 'VEC3'
          || colors.count !== position.count
        )
      ) {
        errors.add(`ICE3_TOOL_INVALID_VERTEX_COLORS:${path}`);
      }
      const count = Number(indices.count);
      if (
        (mode === 4 && count % 3 !== 0)
        || (mode === 1 && count % 2 !== 0)
      ) {
        errors.add(`ICE3_TOOL_INVALID_PRIMITIVE_COUNT:${path}`);
      }
      if (mode === 4) {
        triangleCount += count / 3;
      } else {
        edgeSegmentCount += count / 2;
        if (record(record(primitive.extras)?.ice3)?.role !== 'edges') {
          errors.add(`ICE3_TOOL_INVALID_EDGE_PRIMITIVE:${path}`);
        }
      }
      const maxIndex = readMaxIndex(
        parsed.binary,
        views[Number(indices.bufferView)]!,
        indices,
      );
      if (maxIndex >= Number(position.count)) {
        errors.add(`ICE3_TOOL_INVALID_INDEX_RANGE:${path}`);
      }
    }
  }

  const stats = record(profile.stats);
  const contractVersion = profile.contractVersion;
  const hasContract = contractVersion !== undefined;
  if (
    Number(stats?.nodeCount) !== nodes.length
    || Number(stats?.meshCount) !== meshes.length
    || Number(stats?.triangleCount) !== triangleCount
    || Number(stats?.edgeSegmentCount) !== edgeSegmentCount
    || (hasContract && (
      Number(stats?.primitiveCount) !== primitiveCount
      || Number(stats?.materialCount) !== records(json.materials).length
      || Number(stats?.maxNodeDepth) !== maxNodeDepth(nodes, scenes)
      || Number(stats?.selectionGroupCount) !== selectionGroupCount(nodes, meshes)
    ))
  ) {
    errors.add('ICE3_TOOL_INVALID_PROFILE_STATS');
  }

  if (hasContract) {
    if (contractVersion !== '1.0') {
      errors.add('ICE3_TOOL_CONTRACT_UNSUPPORTED');
    }
    const preparation = record(profile.preparation);
    if (preparation?.runtimeConversionRequired !== false) {
      errors.add('ICE3_TOOL_RUNTIME_CONVERSION_REQUIRED');
    }
    const budget = record(profile.budget);
    const status = budget?.status;
    const warningCount = Number(budget?.warningCount);
    const errorCount = Number(budget?.errorCount);
    if (
      !budget
      || !['pass', 'warning', 'error'].includes(String(status))
      || !Number.isInteger(warningCount)
      || warningCount < 0
      || !Number.isInteger(errorCount)
      || errorCount < 0
      || (status === 'error') !== (errorCount > 0)
      || (status === 'pass' && warningCount > 0)
    ) {
      errors.add('ICE3_TOOL_INVALID_BUDGET');
    } else {
      const builtIn = typeof budget.profile === 'string'
        ? BUDGET_PROFILES[budget.profile]
        : undefined;
      if (builtIn) {
        const expected = evaluateAssetBudget({
          encodedBytes: bytes.byteLength,
          jsonChunkBytes: jsonChunkBytes(Buffer.from(bytes)),
          binChunkBytes: parsed.binary.byteLength,
          nodeCount: nodes.length,
          maxNodeDepth: maxNodeDepth(nodes, scenes),
          meshCount: meshes.length,
          primitiveCount,
          triangleCount,
          edgeSegmentCount,
          materialCount: records(json.materials).length,
          selectionGroupCount: selectionGroupCount(nodes, meshes),
        }, builtIn);
        if (
          budget.status !== expected.status
          || warningCount !== expected.warningCount
          || errorCount !== expected.errorCount
        ) {
          errors.add('ICE3_TOOL_INVALID_BUDGET');
        }
      }
    }
  }

  const meshIds = new Set<string>();
  validateProfileIds(meshes, meshIds, errors);
  const materialIds = new Set<string>();
  validateProfileIds(records(json.materials), materialIds, errors);

  return { errors: [...errors], warnings: [] };
}

const jsonChunkBytes = (bytes: Buffer): number => bytes.readUInt32LE(12);

const selectionGroupCount = (
  nodes: readonly JSONRecord[],
  meshes: readonly JSONRecord[],
): number => {
  let count = 0;
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const mesh = meshes[Number(node.mesh)];
    if (
      mesh
      && records(mesh.primitives).some((primitive) => (
        Number(primitive.mode ?? 4) === 4
      ))
    ) {
      count += 1;
    }
  }
  return count;
};

const maxNodeDepth = (
  nodes: readonly JSONRecord[],
  scenes: readonly JSONRecord[],
): number => {
  const visit = (index: number, visiting = new Set<number>()): number => {
    if (visiting.has(index)) return 0;
    const next = new Set(visiting).add(index);
    const children = integers(nodes[index]?.children);
    return children.length === 0
      ? 0
      : 1 + Math.max(...children.map((child) => visit(child, next)));
  };
  const roots = integers(scenes[0]?.nodes);
  return roots.length === 0
    ? 0
    : Math.max(...roots.map((root) => visit(root)));
};

function parseGLB(bytes: Buffer): ParsedGLB {
  if (
    bytes.byteLength < 12
    || bytes.readUInt32LE(0) !== 0x46546c67
    || bytes.readUInt16LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  ) {
    throw new Error('ICE3_TOOL_INVALID_GLB');
  }
  let offset = 12;
  let json: JSONRecord | undefined;
  let binary: Buffer | undefined;
  let index = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('ICE3_TOOL_INVALID_GLB');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (length % 4 !== 0 || offset + 8 + length > bytes.byteLength) {
      throw new Error('ICE3_TOOL_INVALID_GLB');
    }
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (index === 0) {
      if (type !== 0x4e4f534a) throw new Error('ICE3_TOOL_INVALID_GLB');
      let parsed: unknown;
      try {
        parsed = JSON.parse(chunk.toString('utf8').replace(/ +$/g, ''));
      } catch {
        throw new Error('ICE3_TOOL_INVALID_GLB');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ICE3_TOOL_INVALID_GLB');
      }
      json = parsed as JSONRecord;
    } else if (type === 0x004e4942) {
      if (index !== 1 || binary) throw new Error('ICE3_TOOL_INVALID_GLB');
      binary = chunk;
    }
    offset += 8 + length;
    index += 1;
  }
  if (!json || !binary) throw new Error('ICE3_TOOL_INVALID_GLB');
  return { json, binary };
}

function validateProfileIds(
  entries: readonly JSONRecord[],
  ids: Set<string>,
  errors: Set<string>,
): void {
  for (const entry of entries) {
    const id = record(record(entry.extras)?.ice3)?.id;
    if (typeof id !== 'string' || !id || ids.has(id)) {
      errors.add('ICE3_TOOL_DUPLICATE_ID');
    } else {
      ids.add(id);
    }
  }
}

function readMaxIndex(
  binary: Buffer,
  view: JSONRecord,
  accessor: JSONRecord,
): number {
  const offset = Number(view.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  const count = Number(accessor.count);
  const componentType = Number(accessor.componentType);
  let maximum = -1;
  for (let index = 0; index < count; index += 1) {
    const value = componentType === 5123
      ? binary.readUInt16LE(offset + index * 2)
      : binary.readUInt32LE(offset + index * 4);
    maximum = Math.max(maximum, value);
  }
  return maximum;
}

function records(value: unknown): JSONRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JSONRecord => (
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      ))
    : [];
}

function integers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => (
        typeof item === 'number' && Number.isInteger(item)
      ))
    : [];
}

function record(value: unknown): JSONRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JSONRecord
    : undefined;
}
