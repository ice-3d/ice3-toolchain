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
        + geometry.indices.byteLength;
      if (memoryBytes + byteLength <= options.maxMemoryBytes) {
        records.set(key, {
          byteLength,
          positions: geometry.positions.slice(),
          indices: geometry.indices.slice(),
        });
        memoryBytes += byteLength;
        return;
      }
      const path = join(root, `${records.size}.bin`);
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
  const header = 8;
  const bytes = Buffer.alloc(
    header + geometry.positions.byteLength + geometry.indices.byteLength,
  );
  bytes.writeUInt32LE(geometry.positions.byteLength, 0);
  bytes.writeUInt32LE(geometry.indices.byteLength, 4);
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
  return bytes;
}

function decodeGeometry(bytes: Buffer): ICEWorkspaceGeometry {
  if (bytes.byteLength < 8) {
    throw new Error('ICE3_TOOL_LOD_INVALID: spilled geometry header is invalid');
  }
  const positionBytes = bytes.readUInt32LE(0);
  const indexBytes = bytes.readUInt32LE(4);
  if (
    positionBytes % 4 !== 0
    || indexBytes % 4 !== 0
    || 8 + positionBytes + indexBytes !== bytes.byteLength
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: spilled geometry length is invalid');
  }
  const positions = new Float32Array(positionBytes / 4);
  const indices = new Uint32Array(indexBytes / 4);
  new Uint8Array(positions.buffer).set(bytes.subarray(8, 8 + positionBytes));
  new Uint8Array(indices.buffer).set(bytes.subarray(8 + positionBytes));
  validateGeometry({ positions, indices });
  return { positions, indices };
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
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error('ICE3_TOOL_LOD_INVALID: geometry workspace is disposed');
  }
}
