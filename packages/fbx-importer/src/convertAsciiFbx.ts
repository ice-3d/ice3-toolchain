import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
  Logger,
  NodeIO,
  type Node,
} from '@gltf-transform/core';
import type {
  IFbxBridgeObject,
  IFbxBridgeReport,
} from './types.js';

const STANDARD_PROPERTIES = new Set([
  'Lcl Translation',
  'Lcl Rotation',
  'Lcl Scaling',
  'Visibility',
  'DefaultAttributeIndex',
]);

export async function convertAsciiFbx(
  inputPath: string,
  outputPath: string,
): Promise<IFbxBridgeReport> {
  const { default: createAssimp } = await import('assimpjs');
  const assimp = await createAssimp();
  const fileList = new assimp.FileList();
  fileList.AddFile(basename(inputPath), await readFile(inputPath));
  const result = assimp.ConvertFileList(fileList, 'glb2');
  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error('ICE3_TOOL_FBX_IMPORT_FAILED');
  }
  const file = result.GetFile(0);
  const content = file.GetContent();
  if (content[0] !== 0x67 || content[1] !== 0x6c || content[2] !== 0x54) {
    throw new Error('ICE3_TOOL_FBX_IMPORT_FAILED');
  }
  await writeFile(outputPath, content);
  const document = await new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.ERROR))
    .read(outputPath);
  const root = document.getRoot();
  const meshIndices = new Map(
    root.listMeshes().map((mesh, index) => [mesh, index] as const),
  );
  const properties = parseAsciiProperties(await readFile(inputPath, 'utf8'));
  const objects: IFbxBridgeObject[] = [];
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('ICE3_TOOL_FBX_IMPORT_FAILED');
  scene.traverse((node: Node) => {
    const name = cleanName(node.getName());
    const mesh = node.getMesh();
    const parentName = cleanOptionalName(node.getParentNode()?.getName());
    const meshData = mesh
      ? `assimp/mesh/${meshIndices.get(mesh) ?? 0}`
      : undefined;
    objects.push({
      name,
      objectType: mesh ? 'MESH' : 'EMPTY',
      ...(parentName ? { parentName } : {}),
      ...(meshData ? { meshData } : {}),
      vertexCount: mesh
        ? mesh.listPrimitives().reduce((total, primitive) => (
            total + (primitive.getAttribute('POSITION')?.getCount() ?? 0)
          ), 0)
        : 0,
      triangleCount: mesh
        ? mesh.listPrimitives().reduce((total, primitive) => {
            const position = primitive.getAttribute('POSITION');
            return total + (
              (primitive.getIndices()?.getCount()
                ?? position?.getCount()
                ?? 0) / 3
            );
          }, 0)
        : 0,
      customProperties: properties.get(name) ?? {},
    });
  });
  return {
    success: true,
    converter: 'assimpjs',
    toolVersion: '0.0.10',
    objects,
  };
}

function cleanName(value: string | undefined): string {
  return (value ?? '')
    .replace(/::Model$/u, '')
    .replace(/^RootNode$/u, 'FBX Root');
}

function cleanOptionalName(value: string | undefined): string | undefined {
  const cleaned = cleanName(value);
  return cleaned || undefined;
}

function parseAsciiProperties(
  source: string,
): ReadonlyMap<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  const pattern = /Model:\s*\d+\s*,\s*"Model::([^"]+)"\s*,\s*"(?:Mesh|Null)"\s*\{/gu;
  for (const match of source.matchAll(pattern)) {
    const brace = (match.index ?? 0) + match[0].lastIndexOf('{');
    const end = matchingBrace(source, brace);
    if (end < 0) continue;
    const block = source.slice(brace + 1, end);
    const properties = parsePropertyBlock(block);
    if (properties) result.set(match[1]!, properties);
  }
  return result;
}

function parsePropertyBlock(
  block: string,
): Record<string, unknown> | undefined {
  const start = block.search(/Properties70:\s*\{/u);
  if (start < 0) return undefined;
  const brace = block.indexOf('{', start);
  const end = matchingBrace(block, brace);
  if (end < 0) return undefined;
  const propertyBlock = block.slice(brace + 1, end);
  const properties: Record<string, unknown> = {};
  for (const line of propertyBlock.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*P:\s*"([^"]+)"\s*,\s*"([^"]+)"[^,]*,[^,]*,[^,]*,\s*(.+?)\s*$/u,
    );
    if (!match || STANDARD_PROPERTIES.has(match[1]!)) continue;
    const value = parseAsciiValue(match[3]!);
    if (value !== undefined) properties[match[1]!] = value;
  }
  return Object.keys(properties).length > 0 ? properties : undefined;
}

function parseAsciiValue(value: string): unknown {
  if (value === 'T') return true;
  if (value === 'F') return false;
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function matchingBrace(source: string, start: number): number {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
