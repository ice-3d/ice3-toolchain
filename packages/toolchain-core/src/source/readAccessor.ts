import type { ICESourceDocument } from './readSource.js';

export type ICEAccessorData =
  | { readonly kind: 'float32'; readonly values: Float32Array; readonly components: number }
  | { readonly kind: 'uint16'; readonly values: Uint16Array; readonly components: number }
  | { readonly kind: 'uint32'; readonly values: Uint32Array; readonly components: number };

const COMPONENT_BYTES: Readonly<Record<number, number>> = {
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENTS: Readonly<Record<string, number>> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

export function readAccessor(
  document: ICESourceDocument,
  accessorIndex: number,
): ICEAccessorData {
  const accessors = arrayOfObjects(document.json.accessors, 'accessors');
  const accessor = accessors[accessorIndex];
  if (!accessor) {
    throw accessorError('accessor index is missing');
  }
  if (accessor.sparse !== undefined) {
    throw accessorError('sparse accessors are unsupported');
  }
  if (accessor.normalized === true) {
    throw accessorError('normalized accessors are unsupported');
  }
  const componentType = integer(accessor.componentType, 'componentType');
  const componentBytes = COMPONENT_BYTES[componentType];
  if (!componentBytes) {
    throw accessorError(`unsupported component type ${componentType}`);
  }
  const components = TYPE_COMPONENTS[String(accessor.type)];
  if (!components) {
    throw accessorError(`unsupported accessor type ${String(accessor.type)}`);
  }
  const count = nonNegativeInteger(accessor.count, 'count');
  const viewIndex = nonNegativeInteger(accessor.bufferView, 'bufferView');
  const views = arrayOfObjects(document.json.bufferViews, 'bufferViews');
  const view = views[viewIndex];
  if (!view) {
    throw accessorError('bufferView index is missing');
  }
  const bufferIndex = nonNegativeInteger(view.buffer, 'buffer');
  const buffer = document.buffers[bufferIndex];
  if (!buffer) {
    throw accessorError('buffer index is missing');
  }
  const viewOffset = nonNegativeInteger(view.byteOffset ?? 0, 'byteOffset');
  const viewLength = nonNegativeInteger(view.byteLength, 'byteLength');
  const accessorOffset = nonNegativeInteger(accessor.byteOffset ?? 0, 'byteOffset');
  const elementBytes = componentBytes * components;
  const stride = view.byteStride === undefined
    ? elementBytes
    : nonNegativeInteger(view.byteStride, 'byteStride');
  const accessorBytes = count === 0
    ? 0
    : (count - 1) * stride + elementBytes;
  if (
    viewOffset + viewLength > buffer.byteLength
    || accessorOffset + accessorBytes > viewLength
  ) {
    throw new Error('ICE3_TOOL_ACCESSOR_OUT_OF_RANGE: accessor exceeds its buffer view');
  }

  const byteLength = componentBytes * components * count;
  const output = new ArrayBuffer(byteLength);
  const sourceBytes = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset + viewOffset + accessorOffset,
    accessorBytes,
  );
  const targetBytes = new Uint8Array(output);
  for (let element = 0; element < count; element += 1) {
    targetBytes.set(
      sourceBytes.subarray(element * stride, element * stride + elementBytes),
      element * elementBytes,
    );
  }

  if (componentType === 5126) {
    return { kind: 'float32', values: new Float32Array(output), components };
  }
  if (componentType === 5123) {
    return { kind: 'uint16', values: new Uint16Array(output), components };
  }
  return { kind: 'uint32', values: new Uint32Array(output), components };
}

function arrayOfObjects(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw accessorError(`${field} must be an array`);
  }
  return value as Record<string, unknown>[];
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw accessorError(`${field} must be an integer`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = integer(value, field);
  if (parsed < 0) {
    throw accessorError(`${field} must be non-negative`);
  }
  return parsed;
}

function accessorError(message: string): Error {
  return new Error(`ICE3_TOOL_ACCESSOR_UNSUPPORTED: ${message}`);
}
