export const TOOLCHAIN_PACKAGE = '@ice3/toolchain-core';
export {
  readSource,
  type ICESourceDocument,
} from './source/index.js';
export {
  readAccessor,
  type ICEAccessorData,
} from './source/index.js';
export {
  validateSource,
  type ICESourceReport,
} from './scene/validateSource.js';
export {
  bakeLocalMatrix,
  type ICEMatrix4Tuple,
} from './scene/bakeMatrix.js';
export {
  prepareMesh,
  type ICEPrepareMeshOptions,
  type ICEPreparedGeometry,
} from './scene/prepareMesh.js';
export {
  buildPreparedGLB,
  type ICEBuildOptions,
  type ICEPreparedGLB,
} from './output/buildPreparedGLB.js';
export {
  ICE_ASSET_CONTRACT_VERSION,
  contractStats,
  type ICEAssetContract,
  type ICEAssetContractStats,
  type ICEAssetMetrics,
  type ICEAssetPreparation,
} from './output/assetContract.js';
export { validatePreparedGLB } from './output/validatePreparedGLB.js';
