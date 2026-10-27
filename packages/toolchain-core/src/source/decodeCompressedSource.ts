import { NodeIO } from '@gltf-transform/core';
import {
  ALL_EXTENSIONS,
  KHRDracoMeshCompression,
  KHRMaterialsSpecular,
} from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

let ioPromise: Promise<NodeIO> | undefined;

export function requiresMeshDecompression(bytes: Uint8Array): boolean {
  try {
    const json = readJSON(bytes);
    return Array.isArray(json.extensionsRequired)
      && json.extensionsRequired.includes(
        KHRDracoMeshCompression.EXTENSION_NAME,
      );
  } catch {
    return false;
  }
}

export async function decodeCompressedSource(path: string): Promise<Uint8Array> {
  try {
    const io = await getIO();
    const document = await io.read(path);
    for (const extension of document.getRoot().listExtensionsUsed()) {
      if (
        extension.extensionName === KHRDracoMeshCompression.EXTENSION_NAME
        || extension.extensionName === KHRMaterialsSpecular.EXTENSION_NAME
      ) {
        extension.dispose();
      }
    }
    const originalInfo = console.info;
    console.info = () => {};
    try {
      await document.transform(prune());
    } finally {
      console.info = originalInfo;
    }
    for (const texture of document.getRoot().listTextures()) {
      texture.dispose();
    }
    return Buffer.from(await io.writeBinary(document));
  } catch (error) {
    throw new Error(
      `ICE3_TOOL_COMPRESSION_FAILED: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function getIO(): Promise<NodeIO> {
  ioPromise ??= createIO();
  return ioPromise;
}

async function createIO(): Promise<NodeIO> {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });
}

function readJSON(bytes: Uint8Array): Record<string, unknown> {
  const buffer = Buffer.from(bytes);
  let jsonBytes: Uint8Array;
  if (
    buffer.byteLength >= 12
    && buffer.readUInt32LE(0) === 0x46546c67
  ) {
    const length = buffer.readUInt32LE(12);
    if (20 + length > buffer.byteLength) {
      throw new Error('invalid GLB');
    }
    jsonBytes = buffer.subarray(20, 20 + length);
  } else {
    jsonBytes = buffer;
  }
  return JSON.parse(
    Buffer.from(jsonBytes).toString('utf8').replace(/ +$/g, ''),
  ) as Record<string, unknown>;
}
