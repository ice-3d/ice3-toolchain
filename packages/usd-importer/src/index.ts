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
  assertUsdBlender,
  resolveUsdBlenderBinary,
} from './blenderRuntime.js';
import { canonicalizeUsdGlb } from './canonicalizeUsdGlb.js';
import { runUsdBridge } from './runBridge.js';

export {
  canonicalizeUsdGlb,
  type IUsdCanonicalizeOptions,
  type IUsdSourceStats,
} from './canonicalizeUsdGlb.js';
export {
  assertUsdBlender,
  assertUsdBlenderVersion,
  parseBlenderVersion,
  resolveUsdBlenderBinary,
  SUPPORTED_USD_BLENDER_VERSION,
} from './blenderRuntime.js';
export { runUsdBridge } from './runBridge.js';
export type {
  IUsdBridgeObject,
  IUsdBridgeOptions,
  IUsdBridgeProcessResult,
  IUsdBridgeReport,
  IUsdBridgeRequest,
  IUsdBridgeRunner,
} from './types.js';

export function createUsdImporter(): ICESourceImporter {
  return {
    id: 'usd',
    extensions: ['.usda', '.usdc'],
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
      const rawGlbPath = join(context.temporaryDirectory, 'usd.raw.glb');
      const reportPath = join(context.temporaryDirectory, 'usd.bridge.json');
      const sourceGlbPath = join(
        context.temporaryDirectory,
        `${safeAssetId(context.assetId)}.source.glb`,
      );
      try {
        const blenderBinary = resolveUsdBlenderBinary();
        assertUsdBlender(blenderBinary);
        const report = await runUsdBridge({
          inputPath: input.path,
          outputPath: rawGlbPath,
          reportPath,
        }, {
          blenderBinary,
          scriptPath: await resolveBridgeScript(),
          timeoutMs: usdTimeoutMs(),
        });
        const stats = await canonicalizeUsdGlb(rawGlbPath, sourceGlbPath, {
          assetId: context.assetId,
          bridgeReport: report,
        });
        return {
          adapterId: 'usd',
          sourceFormat: 'usd',
          sourceGlbPath,
          warnings: stats.warnings,
        };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('ICE3_TOOL_')) {
          throw error;
        }
        throw new Error('ICE3_TOOL_USD_IMPORT_FAILED');
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
    new URL('../scripts/usd-to-glb.py', import.meta.url),
    new URL('./usd/usd-to-glb.py', import.meta.url),
  ]) {
    const path = fileURLToPath(candidate);
    try {
      await access(path);
      return path;
    } catch {
      // Try the next source or published-package location.
    }
  }
  throw new Error('ICE3_TOOL_USD_BLENDER_UNAVAILABLE');
}

function safeAssetId(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(
    /^[.-]+|[.-]+$/g,
    '',
  );
  return safe || 'source';
}

function usdTimeoutMs(): number {
  const value = process.env.ICE3_USD_TIMEOUT_MS;
  if (value === undefined) return 120_000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('ICE3_TOOL_USD_IMPORT_FAILED');
  }
  return parsed;
}
