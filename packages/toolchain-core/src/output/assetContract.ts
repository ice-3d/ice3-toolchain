export const ICE_ASSET_CONTRACT_VERSION = '1.0';

export interface ICEAssetMetrics {
  readonly encodedBytes: number;
  readonly jsonChunkBytes: number;
  readonly binChunkBytes: number;
  readonly nodeCount: number;
  readonly maxNodeDepth: number;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly triangleCount: number;
  readonly edgeSegmentCount: number;
  readonly materialCount: number;
  readonly selectionGroupCount: number;
}

export type ICEAssetContractStats = Omit<
  ICEAssetMetrics,
  'encodedBytes' | 'jsonChunkBytes' | 'binChunkBytes'
>;

export const contractStats = (
  metrics: ICEAssetMetrics,
): ICEAssetContractStats => ({
  nodeCount: metrics.nodeCount,
  maxNodeDepth: metrics.maxNodeDepth,
  meshCount: metrics.meshCount,
  primitiveCount: metrics.primitiveCount,
  triangleCount: metrics.triangleCount,
  edgeSegmentCount: metrics.edgeSegmentCount,
  materialCount: metrics.materialCount,
  selectionGroupCount: metrics.selectionGroupCount,
});

export interface ICEAssetPreparation {
  readonly runtimeConversionRequired: false;
  readonly sourceFormat: 'gltf-2.0';
  readonly unitsNormalized: true;
  readonly matrixTransformsBaked: true;
  readonly requiredCompressionDecoded: true;
  readonly edgesPrepared: boolean;
  readonly selectionGroupsPrepared: true;
  readonly options: Readonly<{
    creaseAngleDegrees: number;
    edges: boolean;
  }>;
}

export interface ICEAssetContract {
  readonly contractVersion: '1.0';
  readonly stats: ICEAssetContractStats;
  readonly preparation: ICEAssetPreparation;
  readonly budget: Readonly<{
    profile: string;
    status: 'pass' | 'warning' | 'error';
    warningCount: number;
    errorCount: number;
  }>;
}
