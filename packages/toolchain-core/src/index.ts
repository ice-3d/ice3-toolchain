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
  type ICEBuildSelection,
  type ICEGeometryOverride,
  type ICEPreparedGLB,
} from './output/buildPreparedGLB.js';
export {
  collectNodeWorldMatrices,
  multiplyMatrices,
  transformBounds,
} from './scene/nodeMatrices.js';
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
export {
  createPartitionPlan,
  type ICEPartitionPlanNode,
} from './partition/createPartitionPlan.js';
export {
  createTilesetDocument,
  type ICEFinishedTile,
  type ICETilesetDocument,
} from './partition/tileset.js';
export {
  simplifyGeometry,
  type ICESimplifiedGeometry,
  type ICESimplifyGeometryOptions,
} from './lod/simplifyGeometry.js';
export {
  createGeometryWorkspace,
  type ICEGeometryWorkspace,
  type ICEGeometryWorkspaceOptions,
  type ICEWorkspaceGeometry,
} from './lod/createGeometryWorkspace.js';
export {
  allocateLodTargets,
  type ICELodUnitTarget,
} from './lod/allocateLodTargets.js';
export {
  createCoarseChunkPlan,
  type ICECoarseChunk,
  type ICECoarseChunkUnit,
} from './lod/createCoarseChunkPlan.js';
export {
  partitionAsset,
  type ICEPartitionResult,
} from './partition/partitionAsset.js';
export type {
  ICEBounds,
  ICEPartitionAnalysis,
  ICEPartitionFile,
  ICEPartitionOptions,
  ICEPartitionUnit,
  ICELodBuildOptions,
} from './partition/types.js';
