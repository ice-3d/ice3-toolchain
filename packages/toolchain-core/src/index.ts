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
export {
  BUDGET_PROFILES,
  evaluateAssetBudget,
  validateBudgetProfile,
  type ICEBudgetCheck,
  type ICEBudgetLimit,
  type ICEBudgetProfile,
  type ICEBudgetResult,
} from './output/evaluateAssetBudget.js';
export {
  createAssetReport,
  type ICEAssetReport,
  type ICEAssetReportDiagnostic,
  type ICEAssetReportInput,
} from './output/createAssetReport.js';
export { validatePreparedGLB } from './output/validatePreparedGLB.js';
export {
  analyzePartitionUnits,
} from './partition/analyzePartitionUnits.js';
export type {
  ICEBounds,
  ICEPartitionAnalysis,
  ICEPartitionUnit,
} from './partition/types.js';
