export interface ICELodCurvePrimitive {
  readonly sourceKey: string;
  readonly geometryKey: string;
}

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
  readonly primitives: readonly ICELodCurvePrimitive[];
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
  readonly primitives: ICELodCurveSample['primitives'];
}

export interface ICELodAllocation {
  readonly selections: readonly ICELodAllocationSelection[];
  readonly allocatedTriangles: number;
  readonly maximumErrorMeters: number;
}
