import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

export interface ICESourceDocument {
  readonly json: Readonly<Record<string, unknown>>;
  readonly buffers: readonly Uint8Array[];
  readonly baseDirectory: string;
}

export async function readSource(path: string): Promise<ICESourceDocument> {
  const absolutePath = resolve(path);
  const bytes = await readFile(absolutePath);
  if (bytes.byteLength >= 4 && bytes.readUInt32LE(0) === GLB_MAGIC) {
    return readGLB(bytes, dirname(absolutePath));
  }
  return readJSON(bytes, dirname(absolutePath));
}

async function readJSON(
  bytes: Uint8Array,
  baseDirectory: string,
): Promise<ICESourceDocument> {
  const json = parseJSON(bytes);
  const buffers = await readBuffers(json, baseDirectory);
  return { json, buffers, baseDirectory };
}

async function readGLB(
  bytes: Buffer,
  baseDirectory: string,
): Promise<ICESourceDocument> {
  if (bytes.byteLength < 12) {
    throw invalidSource('GLB header is truncated');
  }
  if (bytes.readUInt16LE(4) !== 2) {
    throw invalidSource('GLB version must be 2');
  }
  if (bytes.readUInt32LE(8) !== bytes.byteLength) {
    throw invalidSource('GLB declared length does not match the file');
  }

  let offset = 12;
  let chunkIndex = 0;
  let json: Record<string, unknown> | undefined;
  let binaryChunk: Uint8Array | undefined;

  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) {
      throw invalidSource('GLB chunk header is truncated');
    }
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    if (chunkLength % 4 !== 0 || offset + 8 + chunkLength > bytes.byteLength) {
      throw invalidSource('GLB chunk length is invalid');
    }
    const data = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkIndex === 0 && chunkType !== JSON_CHUNK) {
      throw invalidSource('GLB JSON chunk must be first');
    }
    if (chunkType === JSON_CHUNK) {
      if (json) {
        throw invalidSource('GLB must contain exactly one JSON chunk');
      }
      json = parseJSON(data);
    } else if (chunkType === BIN_CHUNK) {
      if (chunkIndex !== 1 || binaryChunk) {
        throw invalidSource('GLB BIN chunk must be second and unique');
      }
      binaryChunk = data;
    }
    chunkIndex += 1;
    offset += 8 + chunkLength;
  }

  if (!json) {
    throw invalidSource('GLB JSON chunk is missing');
  }
  const buffers = await readBuffers(json, baseDirectory, binaryChunk);
  return { json, buffers, baseDirectory };
}

function parseJSON(bytes: Uint8Array): Record<string, unknown> {
  const text = Buffer.from(bytes)
    .toString('utf8')
    .replace(/ +$/g, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidSource('JSON document is invalid');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidSource('JSON root must be an object');
  }
  return parsed as Record<string, unknown>;
}

async function readBuffers(
  json: Readonly<Record<string, unknown>>,
  baseDirectory: string,
  binaryChunk?: Uint8Array,
): Promise<readonly Uint8Array[]> {
  if (json.buffers === undefined) {
    return [];
  }
  if (!Array.isArray(json.buffers)) {
    throw invalidSource('buffers must be an array');
  }
  return Promise.all(json.buffers.map(async (entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw invalidSource(`buffer ${index} must be an object`);
    }
    const buffer = entry as Record<string, unknown>;
    const byteLength = buffer.byteLength;
    if (
      typeof byteLength !== 'number'
      || !Number.isInteger(byteLength)
      || byteLength < 0
    ) {
      throw invalidSource(`buffer ${index} byteLength is invalid`);
    }
    if (buffer.uri === undefined) {
      if (index !== 0 || !binaryChunk || binaryChunk.byteLength < byteLength) {
        throw invalidSource(`buffer ${index} has no data source`);
      }
      return binaryChunk.subarray(0, byteLength);
    }
    if (typeof buffer.uri !== 'string') {
      throw invalidSource(`buffer ${index} uri is invalid`);
    }
    const data = await readURI(buffer.uri, baseDirectory);
    if (data.byteLength < byteLength) {
      throw invalidSource(`buffer ${index} is shorter than byteLength`);
    }
    return data.subarray(0, byteLength);
  }));
}

async function readURI(uri: string, baseDirectory: string): Promise<Uint8Array> {
  if (uri.startsWith('data:')) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri);
    if (!match) {
      throw invalidSource('data URI is invalid');
    }
    try {
      return match[2]
        ? Buffer.from(match[3]!, 'base64')
        : Buffer.from(decodeURIComponent(match[3]!), 'utf8');
    } catch {
      throw invalidSource('data URI payload is invalid');
    }
  }
  if (isAbsolute(uri) || /^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    throw invalidSource('external resource URI must be relative');
  }
  const target = resolve(baseDirectory, uri);
  const relation = relative(baseDirectory, target);
  if (relation.startsWith('..') || isAbsolute(relation)) {
    throw invalidSource('external resource URI escapes the source directory');
  }
  try {
    return await readFile(target);
  } catch {
    throw invalidSource(`external resource is missing: ${uri}`);
  }
}

function invalidSource(message: string): Error {
  return new Error(`ICE3_TOOL_INVALID_SOURCE: ${message}`);
}
