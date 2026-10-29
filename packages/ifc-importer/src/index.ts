import type {
  ICESourceImporter,
} from '@ice3/toolchain-core';

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
    async import() {
      throw new Error('ICE3_TOOL_IFC_IMPORT_FAILED: importer is not assembled');
    },
  };
}
