import type { ICEBounds } from '../../partition/types.js';

export type ICESemanticProxyKind = 'obb' | 'cylinder';

export interface ICESemanticProxy {
  readonly id: string;
  readonly kind: ICESemanticProxyKind;
  readonly meshIndex: number;
  readonly triangleCount: number;
  readonly normalizedMaximumDeviation: number;
  readonly volumeInflation: number;
  readonly errorMeters: number;
  readonly materialIndex?: number;
  readonly geometryKey: string;
  readonly colors?: Float32Array;
}

export interface ICESemanticProxyFitSamples {
  readonly vertices: Float32Array;
  readonly centroids: Float32Array;
  readonly areas: Float32Array;
  readonly bounds: ICEBounds;
}
