import type {
  ICESourceImporter,
} from '@ice3/toolchain-core';

export {
  createIfcApi,
  openIfcDocument,
  validateIfcLengthUnit,
  type IIfcOpenDocument,
} from './ifcApi.js';

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
    async import() {
      throw new Error('ICE3_TOOL_IFC_IMPORT_FAILED: importer is not assembled');
    },
  };
}
