export interface ICEBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ICEPartitionUnit {
  readonly nodeIndices: readonly number[];
  readonly meshIndices: readonly number[];
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
}

export interface ICEPartitionAnalysis {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly renderedTriangleCount: number;
  readonly units: readonly ICEPartitionUnit[];
}

export interface ICEPartitionPlanNode {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly ICEPartitionUnit[];
  readonly children: readonly ICEPartitionPlanNode[];
}

export interface ICEPartitionOptions {
  readonly assetId: string;
  readonly maxTriangles?: number;
  readonly maxBytes?: number;
  readonly creaseAngleDegrees?: number;
  readonly edges?: boolean;
  readonly budget?: import('../output/evaluateAssetBudget.js').ICEBudgetProfile;
  readonly lod?: ICELodBuildOptions;
  readonly renderBatch?: ICRenderBatchMode;
}

export type ICELodAllocationMode = 'proportional' | 'adaptive';
export type ICESemanticProxyMode = 'off' | 'auto';
export type ICRenderBatchMode = 'off' | 'static';

export interface ICELodBuildOptions {
  readonly allocation?: ICELodAllocationMode;
  readonly semanticProxy?: ICESemanticProxyMode;
  readonly curveSamples?: number;
  readonly ratio: number;
  readonly maxTrianglesPerProxy: number;
  readonly minTrianglesPerUnit: number;
  readonly maxMemoryBytes?: number;
  readonly coarseChunkMaxBytes?: number;
}

export interface ICEPartitionFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}
