import { basename } from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
  readObjResources,
} from './readObjResources.js';

export interface IObjConversion {
  readonly warnings: readonly string[];
}

export async function convertObjToGlb(
  inputPath: string,
  outputPath: string,
): Promise<IObjConversion> {
  const resources = await readObjResources(inputPath);
  let content: Uint8Array;
  try {
    const { default: createAssimp } = await import('assimpjs');
    const assimp = await createAssimp();
    const fileList = new assimp.FileList();
    fileList.AddFile(basename(inputPath), resources.obj);
    for (const sidecar of resources.sidecars) {
      fileList.AddFile(sidecar.name, sidecar.bytes);
    }
    const result = assimp.ConvertFileList(fileList, 'glb2');
    if (!result.IsSuccess() || result.FileCount() === 0) {
      throw new Error('ICE3_TOOL_OBJ_IMPORT_FAILED');
    }
    content = result.GetFile(0).GetContent();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ICE3_TOOL_')) {
      throw error;
    }
    throw new Error('ICE3_TOOL_OBJ_IMPORT_FAILED');
  }
  if (
    content.length < 20
    || content[0] !== 0x67
    || content[1] !== 0x6c
    || content[2] !== 0x54
  ) {
    throw new Error('ICE3_TOOL_OBJ_IMPORT_FAILED');
  }
  await writeFile(outputPath, content);
  const warnings = new Set(resources.warnings);
  warnings.add('ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS');
  if (hasVertexColors(resources.obj.toString('utf8'))) {
    warnings.add('ICE3_TOOL_OBJ_VERTEX_COLORS_UNSUPPORTED');
  }
  return {
    warnings: [...warnings].sort(),
  };
}

function hasVertexColors(source: string): boolean {
  return source.split(/\r?\n/u).some((line) => {
    if (!line.startsWith('v ')) return false;
    return line.trim().split(/\s+/u).length >= 7;
  });
}
