import type {
  ICESourceImportContext,
  ICESourceImportInput,
  ICESourceImportResult,
  ICESourceImporter,
} from '@ice3/toolchain-core';
import { join } from 'node:path';
import {
  buildIfcSourceGlb,
} from './buildIfcSourceGlb.js';
import {
  createIfcApi,
  openIfcDocument,
  type IIfcOpenDocument,
} from './ifcApi.js';
import {
  readIfcMetadata,
} from './readIfcMetadata.js';

export {
  buildIfcSourceGlb,
  type IIfcSourceStats,
} from './buildIfcSourceGlb.js';
export {
  createIfcApi,
  openIfcDocument,
  validateIfcLengthUnit,
  type IIfcOpenDocument,
} from './ifcApi.js';
export {
  readIfcMetadata,
} from './readIfcMetadata.js';
export type {
  IIfcMetadata,
  IIfcMetadataNode,
  IIfcProductMetadata,
  IIfcPropertySetMetadata,
  IIfcSystemMetadata,
} from './types.js';

export function createIfcImporter(): ICESourceImporter {
  return {
    id: 'ifc',
    extensions: ['.ifc'],
    capabilities: {
      hierarchy: true,
      vertexColors: false,
      materialColors: true,
      instances: false,
      semanticMetadata: true,
    },
    async import(
      input: ICESourceImportInput,
      context: ICESourceImportContext,
    ): Promise<ICESourceImportResult> {
      let api;
      let document: IIfcOpenDocument | undefined;
      try {
        try {
          api = await createIfcApi();
        } catch (error) {
          throw new Error(
            `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE: ifc (${
              error instanceof Error ? error.message : String(error)
            })`,
          );
        }
        try {
          document = await openIfcDocument(api, input.path);
        } catch (error) {
          if (
            error instanceof Error
            && (
              error.message.startsWith('ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED')
              || error.message.startsWith('ICE3_TOOL_IFC_UNIT_UNSUPPORTED')
              || error.message.startsWith('ICE3_TOOL_IFC_IMPORT_FAILED')
            )
          ) {
            throw error;
          }
          throw new Error('ICE3_TOOL_IFC_IMPORT_FAILED');
        }
        try {
          const metadata = await readIfcMetadata(document, context.assetId);
          const sourceGlbPath = join(
            context.temporaryDirectory,
            `${safeAssetId(context.assetId)}.source.glb`,
          );
          const stats = await buildIfcSourceGlb(
            document,
            metadata,
            sourceGlbPath,
          );
          return {
            adapterId: 'ifc',
            sourceFormat: 'ifc-4x3',
            sourceGlbPath,
            warnings: stats.warnings,
          };
        } catch (error) {
          if (
            error instanceof Error
            && error.message.startsWith('ICE3_TOOL_')
          ) {
            throw error;
          }
          throw new Error('ICE3_TOOL_IFC_IMPORT_FAILED');
        }
      } finally {
        if (document) document.api.CloseModel(document.modelID);
        api?.Dispose();
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
