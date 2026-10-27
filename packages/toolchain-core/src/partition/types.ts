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
  readonly units: readonly ICEPartitionUnit[];
}

export interface ICEPartitionPlanNode {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly ICEPartitionUnit[];
  readonly children: readonly ICEPartitionPlanNode[];
}
