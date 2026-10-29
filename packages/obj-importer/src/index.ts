import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ICESourceImportContext,
  ICESourceImportInput,
  ICESourceImportResult,
  ICESourceImporter,
} from '@ice3/toolchain-core';
import { canonicalizeObjGlb } from './canonicalizeObjGlb.js';
import { convertObjToGlb } from './convertObjToGlb.js';

export {
  canonicalizeObjGlb,
  type IObjCanonicalizeOptions,
  type IObjSourceStats,
} from './canonicalizeObjGlb.js';
export {
  convertObjToGlb,
  type IObjConversion,
} from './convertObjToGlb.js';
export {
  readObjResources,
  type IObjResource,
  type IObjResources,
} from './readObjResources.js';

export function createObjImporter(): ICESourceImporter {
  return {
    id: 'obj',
    extensions: ['.obj'],
    capabilities: {
      hierarchy: true,
      vertexColors: false,
      materialColors: true,
      instances: false,
      semanticMetadata: false,
    },
    async import(
      input: ICESourceImportInput,
      context: ICESourceImportContext,
    ): Promise<ICESourceImportResult> {
      const rawGlbPath = join(context.temporaryDirectory, 'obj.raw.glb');
      const sourceGlbPath = join(
        context.temporaryDirectory,
        `${safeAssetId(context.assetId)}.source.glb`,
      );
      try {
        const converted = await convertObjToGlb(input.path, rawGlbPath);
        const stats = await canonicalizeObjGlb(rawGlbPath, sourceGlbPath, {
          assetId: context.assetId,
          warnings: converted.warnings,
        });
        return {
          adapterId: 'obj',
          sourceFormat: 'obj',
          sourceGlbPath,
          warnings: stats.warnings,
        };
      } catch (error) {
        if (
          error instanceof Error
          && (
            error.message.startsWith('ICE3_TOOL_OBJ_')
            || error.message.startsWith('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY')
          )
        ) {
          throw error;
        }
        throw new Error('ICE3_TOOL_OBJ_IMPORT_FAILED');
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
