import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ICESourceImportContext,
  ICESourceImportInput,
  ICESourceImportResult,
  ICESourceImporter,
} from '@ice3/toolchain-core';
import {
  canonicalizeJtGlb,
} from './canonicalizeJtGlb.js';
import {
  resolveJtConverter,
  runJtConverter,
  type IJtConverterRunner,
} from './runConverter.js';

export {
  canonicalizeJtGlb,
  type IJtCanonicalizeOptions,
  type IJtSourceStats,
} from './canonicalizeJtGlb.js';
export {
  resolveJtConverter,
  runJtConverter,
  type IJtConverterOptions,
  type IJtConverterProcessResult,
  type IJtConverterRequest,
  type IJtConverterRunner,
} from './runConverter.js';

export interface IJtImporterOptions {
  readonly converterBinary?: string;
  readonly timeoutMs?: number;
  readonly runner?: IJtConverterRunner;
}

export function createJtImporter(
  options: IJtImporterOptions = {},
): ICESourceImporter {
  return {
    id: 'jt',
    extensions: ['.jt'],
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
      const rawGlbPath = join(context.temporaryDirectory, 'jt.raw.glb');
      const sourceGlbPath = join(
        context.temporaryDirectory,
        `${safeAssetId(context.assetId)}.source.glb`,
      );
      try {
        const converterBinary = resolveJtConverter(options.converterBinary);
        await runJtConverter({
          inputPath: input.path,
          outputPath: rawGlbPath,
        }, {
          converterBinary,
          timeoutMs: options.timeoutMs ?? jtTimeoutMs(),
          ...(options.runner ? { runner: options.runner } : {}),
        });
        const stats = await canonicalizeJtGlb(rawGlbPath, sourceGlbPath, {
          assetId: context.assetId,
        });
        return {
          adapterId: 'jt',
          sourceFormat: 'jt',
          sourceGlbPath,
          warnings: stats.warnings,
        };
      } catch (error) {
        if (
          error instanceof Error
          && (
            error.message.startsWith('ICE3_TOOL_JT_')
            || error.message.startsWith('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY')
          )
        ) {
          throw error;
        }
        throw new Error('ICE3_TOOL_JT_CONVERT_FAILED');
      } finally {
        await rm(rawGlbPath, { force: true });
      }
    },
  };
}

function safeAssetId(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(
    /^[.-]+|[.-]+$/g,
    '',
  );
  return safe || 'source';
}

function jtTimeoutMs(): number {
  const value = process.env.ICE3_JT_TIMEOUT_MS;
  if (value === undefined) return 300_000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('ICE3_TOOL_JT_CONVERT_FAILED');
  }
  return parsed;
}
