import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXPECTED_EQUIPMENT_TAGS } from './equipment.js';

export interface ICEWWTPArtifactSummary {
  readonly fineParts: number;
  readonly coarseParts: number;
  readonly selectionIds: readonly string[];
  readonly triangleCount: number;
}

interface TilesetDocument {
  readonly asset?: { readonly version?: string };
  readonly extensionsRequired?: readonly string[];
  readonly root?: TilesetTile;
}

interface TilesetTile {
  readonly content?: { readonly uri?: string };
  readonly contents?: readonly { readonly uri?: string }[];
  readonly children?: readonly TilesetTile[];
}

function invalid(detail: string): never {
  throw new Error(`ICE3_WWTP_ARTIFACT_INVALID: ${detail}`);
}

async function glbFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await glbFiles(path));
    } else if (extname(entry.name) === '.glb') {
      files.push(path);
    }
  }
  return files;
}

function contentUris(tile: TilesetTile | undefined): string[] {
  if (!tile) return [];
  const uris = [
    ...(tile.content?.uri === undefined ? [] : [tile.content.uri]),
    ...(tile.contents ?? []).flatMap((content) =>
      content.uri === undefined ? [] : [content.uri]),
  ];
  return [
    ...uris,
    ...(tile.children ?? []).flatMap(contentUris),
  ];
}

export async function inspectWastewaterArtifacts(
  assetRoot: string,
): Promise<ICEWWTPArtifactSummary> {
  const root = resolve(assetRoot);
  const tiled = join(root, 'tiled');
  const tilesetPath = join(tiled, 'tileset.json');
  const document = JSON.parse(
    await readFile(tilesetPath, 'utf8'),
  ) as TilesetDocument;
  if (document.asset?.version !== '1.1' || !document.root) {
    invalid('Tileset asset version or root is invalid');
  }
  if ((document.extensionsRequired?.length ?? 0) > 0) {
    invalid('required Tileset extensions are unsupported');
  }
  for (const uri of contentUris(document.root)) {
    if (/^https?:\/\//i.test(uri)) {
      invalid('external Tileset content is not allowed');
    }
    const resolved = resolve(tiled, uri);
    const relation = relative(tiled, resolved);
    if (relation.startsWith('..') || relation.length === 0) {
      invalid('Tileset content escapes the tiled directory');
    }
    await readFile(resolved).catch(() => {
      invalid(`missing Tileset content: ${uri}`);
    });
  }

  const fineFiles = await glbFiles(join(tiled, 'parts'));
  const coarseFiles = await glbFiles(join(tiled, 'coarse'));
  if (fineFiles.length < 2 || coarseFiles.length < 2) {
    invalid('expected multiple fine partitions and multiple coarse chunks');
  }

  const io = new NodeIO();
  const selectionIds = new Set<string>();
  let triangleCount = 0;
  for (const file of [...fineFiles, ...coarseFiles]) {
    const bytes = await readFile(file);
    const glb = await io.readBinary(bytes);
    for (const node of glb.getRoot().listNodes()) {
      const selectionId = (
        node.getExtras().ice3 as Record<string, unknown> | undefined
      )?.selectionId;
      if (
        typeof selectionId === 'string'
        && selectionId.startsWith('ice3-virtual-wwtp/equipment/')
      ) {
        selectionIds.add(selectionId);
      }
    }
    if (fineFiles.includes(file)) {
      for (const mesh of glb.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const indices = primitive.getIndices();
          const position = primitive.getAttribute('POSITION');
          if (indices) {
            triangleCount += indices.getCount() / 3;
          } else if (position) {
            triangleCount += position.getCount() / 3;
          }
        }
      }
    }
  }

  for (const tag of EXPECTED_EQUIPMENT_TAGS) {
    if (!selectionIds.has(`ice3-virtual-wwtp/equipment/${tag}`)) {
      invalid(`missing equipment identity: ${tag}`);
    }
  }

  return Object.freeze({
    fineParts: fineFiles.length,
    coarseParts: coarseFiles.length,
    selectionIds: Object.freeze([...selectionIds].sort()),
    triangleCount,
  });
}

export async function runVerifyCli(argv: readonly string[]): Promise<number> {
  try {
    if (argv.length !== 1 || !argv[0]) {
      throw new Error(
        'ICE3_WWTP_ARTIFACT_INVALID: usage: verify <asset-root>',
      );
    }
    const summary = await inspectWastewaterArtifacts(argv[0]);
    console.log(JSON.stringify(summary));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runVerifyCli(process.argv.slice(2));
}
