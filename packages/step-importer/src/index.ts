import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ICESourceImportContext,
  ICESourceImportInput,
  ICESourceImportResult,
  ICESourceImporter,
} from '@ice3/toolchain-core';
import {
  convertOcctResult,
  type OcctImportResult,
} from './convertOcctResult.js';

export {
  convertOcctResult,
  type ICEImportedGeometryStats,
  type OcctImportMesh,
  type OcctImportNode,
  type OcctImportResult,
} from './convertOcctResult.js';

const TRIANGULATION = Object.freeze({
  linearUnit: 'meter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.001,
  angularDeflection: 0.5,
});

export function createStepImporter(): ICESourceImporter {
  return {
    id: 'step',
    extensions: ['.step', '.stp'],
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
      let occt;
      try {
        const { default: createOcctImporter } = await import(
          'occt-import-js'
        );
        occt = await createOcctImporter();
      } catch (error) {
        throw new Error(
          `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE: step (${
            error instanceof Error ? error.message : String(error)
          })`,
        );
      }
      const bytes = await readFile(input.path);
      const text = bytes.toString('utf8');
      if (
        !/^\uFEFF?ISO-10303-21;/u.test(text)
        || !/END-ISO-10303-21;\s*$/u.test(text)
      ) {
        throw new Error('ICE3_TOOL_STEP_IMPORT_FAILED');
      }
      const result = occt.ReadStepFile(
        new Uint8Array(bytes),
        TRIANGULATION,
      ) as OcctImportResult;
      const sourceGlbPath = join(
        context.temporaryDirectory,
        `${safeAssetId(context.assetId)}.source.glb`,
      );
      await convertOcctResult(result, sourceGlbPath);
      return {
        adapterId: 'step',
        sourceFormat: 'step-ap242',
        sourceGlbPath,
        warnings: [],
      };
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
