import type { ICESourceDocument } from '../source/readSource.js';

export interface ICESourceReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function validateSource(document: ICESourceDocument): ICESourceReport {
  const errors = new Set<string>();
  const warnings = new Set<string>();
  const json = document.json;
  const nodes = objects(json.nodes);
  const meshes = objects(json.meshes);
  const materials = objects(json.materials);
  const accessors = objects(json.accessors);
  const bufferViews = objects(json.bufferViews);

  const asset = record(json.asset);
  if (String(asset?.version) !== '2.0') {
    errors.add('ICE3_TOOL_INVALID_ASSET_VERSION');
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
  if (Array.isArray(json.extensionsRequired) && json.extensionsRequired.length > 0) {
    errors.add('ICE3_TOOL_UNSUPPORTED_EXTENSION');
  }
  const required = new Set(
    Array.isArray(json.extensionsRequired) ? json.extensionsRequired : [],
  );
  for (const extension of Array.isArray(json.extensionsUsed)
    ? json.extensionsUsed
    : []) {
    if (!required.has(extension)) {
      warnings.add(`ICE3_TOOL_IGNORED_EXTENSION:${String(extension)}`);
    }
  }
  if (accessors.some((accessor) => accessor.sparse !== undefined)) {
    errors.add('ICE3_TOOL_UNSUPPORTED_SPARSE_ACCESSOR');
  }

  for (const [nodeIndex, node] of nodes.entries()) {
    for (const child of integers(node.children)) {
      if (!nodes[child]) {
        errors.add(`ICE3_TOOL_INVALID_NODE_REFERENCE:${nodeIndex}`);
      }
    }
    if (node.mesh !== undefined) {
      requireIndex(node.mesh, meshes.length, 'ICE3_TOOL_INVALID_MESH_REFERENCE', errors);
    }
  }
  if (hasNodeCycle(nodes)) {
    errors.add('ICE3_TOOL_SCENE_CYCLE');
  }

  for (const [meshIndex, mesh] of meshes.entries()) {
    for (const primitive of objects(mesh.primitives)) {
      const mode = primitive.mode === undefined ? 4 : Number(primitive.mode);
      if (![4, 5, 6].includes(mode)) {
        errors.add(`ICE3_TOOL_UNSUPPORTED_PRIMITIVE_MODE:${meshIndex}`);
      }
      if (primitive.targets !== undefined) {
        errors.add('ICE3_TOOL_UNSUPPORTED_MORPH');
      }
      const attributes = record(primitive.attributes);
      if (!attributes || !Number.isInteger(attributes.POSITION)) {
        errors.add(`ICE3_TOOL_MISSING_POSITION:${meshIndex}`);
      } else {
        requireIndex(
          attributes.POSITION,
          accessors.length,
          'ICE3_TOOL_INVALID_ACCESSOR_REFERENCE',
          errors,
        );
      }
      if (primitive.indices !== undefined) {
        requireIndex(
          primitive.indices,
          accessors.length,
          'ICE3_TOOL_INVALID_ACCESSOR_REFERENCE',
          errors,
        );
      }
      if (primitive.material !== undefined) {
        requireIndex(
          primitive.material,
          materials.length,
          'ICE3_TOOL_INVALID_MATERIAL_REFERENCE',
          errors,
        );
      }
    }
  }

  for (const accessor of accessors) {
    if (accessor.bufferView !== undefined) {
      requireIndex(
        accessor.bufferView,
        bufferViews.length,
        'ICE3_TOOL_INVALID_BUFFER_VIEW_REFERENCE',
        errors,
      );
    }
  }
  for (const view of bufferViews) {
    requireIndex(
      view.buffer,
      document.buffers.length,
      'ICE3_TOOL_INVALID_BUFFER_REFERENCE',
      errors,
    );
  }

  return { errors: [...errors], warnings: [...warnings] };
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => (
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      ))
    : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function integers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item))
    : [];
}

function requireIndex(
  value: unknown,
  length: number,
  code: string,
  errors: Set<string>,
): void {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) >= length) {
    errors.add(code);
  }
}

function hasNodeCycle(nodes: readonly Record<string, unknown>[]): boolean {
  const states = new Uint8Array(nodes.length);
  const visit = (index: number): boolean => {
    if (states[index] === 1) {
      return true;
    }
    if (states[index] === 2) {
      return false;
    }
    states[index] = 1;
    for (const child of integers(nodes[index]?.children)) {
      if (nodes[child] && visit(child)) {
        return true;
      }
    }
    states[index] = 2;
    return false;
  };
  return nodes.some((_node, index) => visit(index));
}
