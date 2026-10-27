import type {
  ICELodAllocation,
  ICELodAllocationInput,
} from './types.js';

export function allocateAdaptiveLod(
  input: ICELodAllocationInput,
): ICELodAllocation {
  validateInput(input);
  const curves = [...input.curves].sort((left, right) => (
    left.unitId.localeCompare(right.unitId, 'en')
  ));
  const selected = curves.map(() => 0);
  let allocatedTriangles = curves.reduce(
    (total, curve) => total + curve.samples[0]!.actualTriangles,
    0,
  );
  if (allocatedTriangles > input.maxTriangles) {
    throw new Error(
      `ICE3_TOOL_LOD_BUDGET_INVALID: device minimums exceed proxy budget (minimum ${allocatedTriangles}, budget ${input.maxTriangles}, units ${curves.length})`,
    );
  }

  while (allocatedTriangles < input.maxTriangles) {
    const candidates = curves.flatMap((curve, curveIndex) => {
      const sampleIndex = selected[curveIndex]! + 1;
      const previous = curve.samples[selected[curveIndex]!]!;
      const next = curve.samples[sampleIndex];
      if (!next) return [];
      const added = next.actualTriangles - previous.actualTriangles;
      const reduced = previous.errorMeters - next.errorMeters;
      if (added <= 0 || reduced <= 0) return [];
      if (allocatedTriangles + added > input.maxTriangles) return [];
      return [{
        curve,
        curveIndex,
        sampleIndex,
        added,
        benefit: (reduced / input.nodeDiagonalMeters) / added,
      }];
    }).sort((left, right) => (
      right.benefit - left.benefit
      || left.curve.unitId.localeCompare(right.curve.unitId, 'en')
      || left.sampleIndex - right.sampleIndex
    ));
    const winner = candidates[0];
    if (!winner) break;
    selected[winner.curveIndex] = winner.sampleIndex;
    allocatedTriangles += winner.added;
  }

  const selections = curves.map((curve, index) => {
    const sample = curve.samples[selected[index]!]!;
    return {
      unitId: curve.unitId,
      sampleIndex: selected[index]!,
      actualTriangles: sample.actualTriangles,
      errorMeters: sample.errorMeters,
      preservedSource: sample.preservedSource,
      replacement: sample.replacement,
    };
  });
  return {
    selections: Object.freeze(selections),
    allocatedTriangles,
    maximumErrorMeters: Math.max(
      0,
      ...selections.map((entry) => entry.errorMeters),
    ),
  };
}

function validateInput(input: ICELodAllocationInput): void {
  const ids = new Set<string>();
  if (
    !Number.isInteger(input.maxTriangles)
    || input.maxTriangles < 1
    || !Number.isFinite(input.nodeDiagonalMeters)
    || input.nodeDiagonalMeters <= 0
    || input.curves.length === 0
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: adaptive allocation input is invalid');
  }
  for (const curve of input.curves) {
    if (!curve.unitId || ids.has(curve.unitId) || curve.samples.length < 1) {
      throw new Error('ICE3_TOOL_LOD_INVALID: adaptive curve is invalid');
    }
    ids.add(curve.unitId);
    let previousTriangles = -1;
    for (const sample of curve.samples) {
      if (
        !Number.isInteger(sample.actualTriangles)
        || sample.actualTriangles < 1
        || !Number.isFinite(sample.errorMeters)
        || sample.errorMeters < 0
        || sample.actualTriangles < previousTriangles
      ) {
        throw new Error('ICE3_TOOL_LOD_INVALID: adaptive sample is invalid');
      }
      previousTriangles = sample.actualTriangles;
    }
  }
}

export type {
  ICELodAllocation,
  ICELodAllocationInput,
  ICELodAllocationSelection,
  ICELodCurvePrimitive,
  ICELodCurveSample,
  ICELodMeshReplacement,
  ICELodPrimitiveReplacement,
  ICELodSampleReplacement,
  ICELodUnitCurve,
  ICELodUnitPrimitive,
} from './types.js';
