import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ICESourceImportContext,
  ICESourceImportInput,
  ICESourceImportResult,
  ICESourceImporter,
} from '@ice3/toolchain-core';
import {
  assertSupportedBlender,
  resolveBlenderBinary,
} from './blenderRuntime.js';
import { canonicalizeFbxGlb } from './canonicalizeFbxGlb.js';
import { convertAsciiFbx } from './convertAsciiFbx.js';
import { runFbxBridge } from './runBridge.js';

export {
  canonicalizeFbxGlb,
  type IFbxCanonicalizeOptions,
  type IFbxSourceStats,
} from './canonicalizeFbxGlb.js';
export {
  assertBlenderVersion,
  assertSupportedBlender,
  parseBlenderVersion,
  resolveBlenderBinary,
  SUPPORTED_BLENDER_VERSION,
} from './blenderRuntime.js';
export { runFbxBridge } from './runBridge.js';
export type {
  IFbxBridgeObject,
  IFbxBridgeOptions,
  IFbxBridgeProcessResult,
  IFbxBridgeReport,
  IFbxBridgeRequest,
  IFbxBridgeRunner,
} from './types.js';

export function createFbxImporter(): ICESourceImporter {
  return {
    id: 'fbx',
    extensions: ['.fbx'],
    capabilities: {
      hierarchy: true,
      vertexColors: false,
      materialColors: true,
      instances: true,
      semanticMetadata: true,
    },
    async import(
      input: ICESourceImportInput,
      context: ICESourceImportContext,
    ): Promise<ICESourceImportResult> {
      const rawGlbPath = join(context.temporaryDirectory, 'fbx.raw.glb');
      const reportPath = join(context.temporaryDirectory, 'fbx.bridge.json');
      const sourceGlbPath = join(
        context.temporaryDirectory,
        `${safeAssetId(context.assetId)}.source.glb`,
      );
      try {
        const source = await readFile(input.path);
        const report = source.subarray(0, 23).toString('ascii')
          === 'Kaydara FBX Binary  \x00\x1a\x00'
          ? await (async () => {
              const blenderBinary = resolveBlenderBinary();
              assertSupportedBlender(blenderBinary);
              return runFbxBridge({
                inputPath: input.path,
                outputPath: rawGlbPath,
                reportPath,
              }, {
                blenderBinary,
                scriptPath: await resolveBridgeScript(),
              });
            })()
          : await convertAsciiFbx(input.path, rawGlbPath);
        const stats = await canonicalizeFbxGlb(rawGlbPath, sourceGlbPath, {
          assetId: context.assetId,
          bridgeReport: report,
        });
        return {
          adapterId: 'fbx',
          sourceFormat: 'fbx',
          sourceGlbPath,
          warnings: stats.warnings,
        };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('ICE3_TOOL_')) {
          throw error;
        }
        throw new Error('ICE3_TOOL_FBX_IMPORT_FAILED');
      } finally {
        await Promise.all([
          rm(rawGlbPath, { force: true }),
          rm(reportPath, { force: true }),
        ]);
      }
    },
  };
}

async function resolveBridgeScript(): Promise<string> {
  for (const candidate of [
    new URL('../scripts/fbx-to-glb.py', import.meta.url),
    new URL('./fbx/fbx-to-glb.py', import.meta.url),
  ]) {
    const path = fileURLToPath(candidate);
    try {
      await access(path);
      return path;
    } catch {
      // Try the next source or published-package location.
    }
  }
  throw new Error('ICE3_TOOL_FBX_BLENDER_UNAVAILABLE');
}

function safeAssetId(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(
    /^[.-]+|[.-]+$/g,
    '',
  );
  return safe || 'source';
}
