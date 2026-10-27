import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ICEGeometryWorkspaceOptions {
  readonly maxMemoryBytes: number;
  readonly temporaryRoot?: string;
}

export interface ICEWorkspaceGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
}

export interface ICEGeometryWorkspace {
  write(key: string, geometry: ICEWorkspaceGeometry): Promise<void>;
  read(key: string): Promise<ICEWorkspaceGeometry>;
  readonly spilledBytes: number;
  dispose(): Promise<void>;
}

interface IGEStoredGeometry {
  readonly byteLength: number;
  readonly positions?: Float32Array;
  readonly indices?: Uint32Array;
  readonly colors?: Float32Array;
  readonly path?: string;
}

export async function createGeometryWorkspace(
  options: ICEGeometryWorkspaceOptions,
): Promise<ICEGeometryWorkspace> {
  if (
    !Number.isInteger(options.maxMemoryBytes)
    || options.maxMemoryBytes < 0
  ) {
    throw new Error(
      'ICE3_TOOL_LOD_INVALID: maxMemoryBytes must be a non-negative integer',
    );
  }
  const root = options.temporaryRoot
    ? options.temporaryRoot
    : await mkdtemp(join(tmpdir(), 'ice3-lod-'));
  if (options.temporaryRoot) await mkdir(root);
  const records = new Map<string, IGEStoredGeometry>();
  let memoryBytes = 0;
  let spilledBytes = 0;
  let nextSpillIndex = 0;
  let disposed = false;

  return {
    async write(key, geometry): Promise<void> {
      assertActive(disposed);
      if (!key.trim()) {
        throw new Error('ICE3_TOOL_LOD_INVALID: workspace key is empty');
      }
      if (records.has(key)) {
        throw new Error(`ICE3_TOOL_LOD_INVALID: duplicate workspace key ${key}`);
      }
      validateGeometry(geometry);
      const byteLength = geometry.positions.byteLength
        + geometry.indices.byteLength
        + (geometry.colors?.byteLength ?? 0);
      if (memoryBytes + byteLength <= options.maxMemoryBytes) {
        records.set(key, {
          byteLength,
          positions: geometry.positions.slice(),
          indices: geometry.indices.slice(),
          ...(geometry.colors
            ? { colors: geometry.colors.slice() }
            : {}),
        });
        memoryBytes += byteLength;
        return;
      }
      const path = join(root, `${nextSpillIndex}.bin`);
      nextSpillIndex += 1;
      await writeFile(path, encodeGeometry(geometry));
      records.set(key, { byteLength, path });
      spilledBytes += byteLength;
    },
    async read(key): Promise<ICEWorkspaceGeometry> {
      assertActive(disposed);
      const record = records.get(key);
      if (!record) {
        throw new Error(`ICE3_TOOL_LOD_INVALID: workspace key not found: ${key}`);
      }
      if (record.positions && record.indices) {
        return {
          positions: record.positions.slice(),
          indices: record.indices.slice(),
          ...(record.colors ? { colors: record.colors.slice() } : {}),
        };
      }
      return decodeGeometry(await readFile(record.path!));
    },
    get spilledBytes(): number {
      return spilledBytes;
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      records.clear();
      memoryBytes = 0;
      try {
        await rm(root, { recursive: true, force: true });
      } catch (error) {
        throw new Error(
          `ICE3_TOOL_LOD_CLEANUP_FAILED: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  };
}

function encodeGeometry(geometry: ICEWorkspaceGeometry): Buffer {
  const header = 12;
  const colorBytes = geometry.colors?.byteLength ?? 0;
  const bytes = Buffer.alloc(
    header
      + geometry.positions.byteLength
      + geometry.indices.byteLength
      + colorBytes,
  );
  bytes.writeUInt32LE(geometry.positions.byteLength, 0);
  bytes.writeUInt32LE(geometry.indices.byteLength, 4);
  bytes.writeUInt32LE(colorBytes, 8);
  Buffer.from(
    geometry.positions.buffer,
    geometry.positions.byteOffset,
    geometry.positions.byteLength,
  ).copy(bytes, header);
  Buffer.from(
    geometry.indices.buffer,
    geometry.indices.byteOffset,
    geometry.indices.byteLength,
  ).copy(bytes, header + geometry.positions.byteLength);
  if (geometry.colors) {
    Buffer.from(
      geometry.colors.buffer,
      geometry.colors.byteOffset,
      geometry.colors.byteLength,
    ).copy(
      bytes,
      header + geometry.positions.byteLength + geometry.indices.byteLength,
    );
  }
  return bytes;
}

function decodeGeometry(bytes: Buffer): ICEWorkspaceGeometry {
  if (bytes.byteLength < 12) {
    throw new Error('ICE3_TOOL_LOD_INVALID: spilled geometry header is invalid');
  }
  const positionBytes = bytes.readUInt32LE(0);
  const indexBytes = bytes.readUInt32LE(4);
  const colorBytes = bytes.readUInt32LE(8);
  if (
    positionBytes % 4 !== 0
    || indexBytes % 4 !== 0
    || colorBytes % 4 !== 0
    || 12 + positionBytes + indexBytes + colorBytes !== bytes.byteLength
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: spilled geometry length is invalid');
  }
  const positions = new Float32Array(positionBytes / 4);
  const indices = new Uint32Array(indexBytes / 4);
  const colors = colorBytes === 0
    ? undefined
    : new Float32Array(colorBytes / 4);
  new Uint8Array(positions.buffer).set(bytes.subarray(12, 12 + positionBytes));
  new Uint8Array(indices.buffer).set(
    bytes.subarray(12 + positionBytes, 12 + positionBytes + indexBytes),
  );
  if (colors) {
    new Uint8Array(colors.buffer).set(
      bytes.subarray(12 + positionBytes + indexBytes),
    );
  }
  const geometry = {
    positions,
    indices,
    ...(colors ? { colors } : {}),
  };
  validateGeometry(geometry);
  return geometry;
}

function validateGeometry(geometry: ICEWorkspaceGeometry): void {
  if (
    geometry.positions.length === 0
    || geometry.positions.length % 3 !== 0
    || geometry.indices.length === 0
    || geometry.indices.length % 3 !== 0
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: workspace geometry is invalid');
  }
  if (!geometry.colors) return;
  const vertexCount = geometry.positions.length / 3;
  if (
    geometry.colors.length !== vertexCount * 3
    && geometry.colors.length !== vertexCount * 4
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: workspace color count is invalid');
  }
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error('ICE3_TOOL_LOD_INVALID: geometry workspace is disposed');
  }
}
