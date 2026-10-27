export interface ICELodCurvePrimitive {
  readonly sourceKey: string;
  readonly geometryKey: string;
}

export interface ICELodPrimitiveReplacement {
  readonly kind: 'primitives';
  readonly primitives: readonly ICELodCurvePrimitive[];
}

export interface ICELodMeshReplacement {
  readonly kind: 'mesh';
  readonly proxy: import('./semanticProxy/types.js').ICESemanticProxy;
}

export type ICELodSampleReplacement =
  | ICELodPrimitiveReplacement
  | ICELodMeshReplacement;

export interface ICELodUnitPrimitive {
  readonly sourceKey: string;
  readonly workspaceKey: string;
  readonly triangleCount: number;
  readonly materialIndex?: number;
}

export interface ICELodCurveSample {
  readonly targetTriangles: number;
  readonly actualTriangles: number;
  readonly errorMeters: number;
  readonly preservedSource: boolean;
  readonly replacement: ICELodSampleReplacement;
}

export interface ICELodUnitCurve {
  readonly unitId: string;
  readonly sourceTriangles: number;
  readonly samples: readonly ICELodCurveSample[];
}

export interface ICELodAllocationInput {
  readonly curves: readonly ICELodUnitCurve[];
  readonly maxTriangles: number;
  readonly nodeDiagonalMeters: number;
}

export interface ICELodAllocationSelection {
  readonly unitId: string;
  readonly sampleIndex: number;
  readonly actualTriangles: number;
  readonly errorMeters: number;
  readonly preservedSource: boolean;
  readonly replacement: ICELodCurveSample['replacement'];
}

export interface ICELodAllocation {
  readonly selections: readonly ICELodAllocationSelection[];
  readonly allocatedTriangles: number;
  readonly maximumErrorMeters: number;
}
