import { extname } from 'node:path';
import type {
  ICEImporterRegistry,
  ICESourceImportContext,
  ICESourceImportInput,
  ICESourceImportResult,
  ICESourceImporter,
} from './types.js';

export function createImporterRegistry(
  importers: readonly ICESourceImporter[],
): ICEImporterRegistry {
  const byId = new Map<string, ICESourceImporter>();
  const byExtension = new Map<string, ICESourceImporter>();

  for (const importer of importers) {
    if (byId.has(importer.id)) {
      throw new Error(`duplicate importer id: ${importer.id}`);
    }
    byId.set(importer.id, importer);

    for (const rawExtension of importer.extensions) {
      const extension = rawExtension.toLowerCase();
      if (byExtension.has(extension)) {
        throw new Error(`duplicate importer extension: ${extension}`);
      }
      byExtension.set(extension, importer);
    }
  }

  function resolve(path: string, requestedAdapter?: string) {
    const extension = extname(path).toLowerCase();
    const byPath = byExtension.get(extension);
    if (!byPath) {
      throw new Error(`ICE3_TOOL_IMPORT_UNSUPPORTED: ${extension || path}`);
    }
    if (requestedAdapter && requestedAdapter !== 'auto') {
      const requested = byId.get(requestedAdapter);
      if (!requested || requested !== byPath) {
        throw new Error(
          `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE: ${requestedAdapter}`,
        );
      }
      return requested;
    }
    return byPath;
  }

  return {
    resolve,
    async import(
      input: ICESourceImportInput,
      context: ICESourceImportContext,
    ): Promise<ICESourceImportResult> {
      return resolve(input.path, input.requestedAdapter).import(input, context);
    },
  };
}
