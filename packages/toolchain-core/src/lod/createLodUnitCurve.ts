import type { ICEGeometryWorkspace } from './createGeometryWorkspace.js';
import { createLodSampleSchedule } from './createLodSampleSchedule.js';
import { simplifyGeometry } from './simplifyGeometry.js';
import type {
  ICELodCurvePrimitive,
  ICELodCurveSample,
  ICELodUnitCurve,
  ICELodUnitPrimitive,
} from './types.js';

export interface ICELodUnitCurveOptions {
  readonly unitId: string;
  readonly sourceTriangles: number;
  readonly primitives: readonly ICELodUnitPrimitive[];
  readonly workspace: ICEGeometryWorkspace;
  readonly minimumTriangles: number;
  readonly sampleCount: number;
  readonly worldScale: number;
}

export async function createLodUnitCurve(
  options: ICELodUnitCurveOptions,
): Promise<ICELodUnitCurve> {
  validateOptions(options);
  const schedule = createLodSampleSchedule({
    sourceTriangles: options.sourceTriangles,
    minimumTriangles: Math.min(
      options.minimumTriangles,
      options.sourceTriangles,
    ),
    sampleCount: options.sampleCount,
  });
  const samples: ICELodCurveSample[] = [];

  for (const [sampleIndex, targetTriangles] of schedule.entries()) {
    const primitives: ICELodCurvePrimitive[] = [];
    let actualTriangles = 0;
    let errorMeters = 0;
    let preservedSource = false;

    for (const primitive of options.primitives) {
      const input = await options.workspace.read(primitive.workspaceKey);
      const target = Math.max(
        1,
        Math.floor(
          targetTriangles
            * primitive.triangleCount
            / Math.max(1, options.sourceTriangles),
        ),
      );
      const simplified = await simplifyGeometry(
        input.positions,
        input.indices,
        {
          targetTriangles: target,
          minimumTriangles: 1,
          ...(input.colors ? { vertexColors: input.colors } : {}),
        },
      );
      const geometryKey = [
        'curve',
        options.unitId,
        String(sampleIndex),
        primitive.sourceKey,
      ].join(':');
      await options.workspace.write(geometryKey, {
        positions: simplified.positions,
        indices: simplified.indices,
        ...(simplified.colors ? { colors: simplified.colors } : {}),
      });
      primitives.push({
        sourceKey: primitive.sourceKey,
        geometryKey,
      });
      actualTriangles += simplified.triangleCount;
      errorMeters = Math.max(
        errorMeters,
        simplified.errorMeters * options.worldScale,
      );
      preservedSource ||= simplified.preservedSource;
    }

    pushParetoSample(samples, {
      targetTriangles,
      actualTriangles,
      errorMeters,
      preservedSource,
      primitives,
    });
  }
  if (samples.length === 0) {
    throw new Error('ICE3_TOOL_LOD_INVALID: unit curve has no valid samples');
  }

  return {
    unitId: options.unitId,
    sourceTriangles: options.sourceTriangles,
    samples,
  };
}

function pushParetoSample(
  samples: ICELodCurveSample[],
  next: ICELodCurveSample,
): void {
  while (
    samples.length > 0
    && next.actualTriangles <= samples.at(-1)!.actualTriangles
    && next.errorMeters <= samples.at(-1)!.errorMeters
  ) {
    samples.pop();
  }
  const previous = samples.at(-1);
  if (
    !previous
    || (
      next.actualTriangles > previous.actualTriangles
      && next.errorMeters < previous.errorMeters
    )
  ) {
    samples.push(next);
  }
}

function validateOptions(options: ICELodUnitCurveOptions): void {
  if (
    !options.unitId.trim()
    || !Number.isInteger(options.sourceTriangles)
    || options.sourceTriangles < 1
    || options.primitives.length === 0
    || !Number.isInteger(options.minimumTriangles)
    || options.minimumTriangles < 1
    || !Number.isFinite(options.worldScale)
    || options.worldScale <= 0
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: unit curve input is invalid');
  }
  const keys = new Set<string>();
  for (const primitive of options.primitives) {
    if (
      !primitive.sourceKey
      || !primitive.workspaceKey
      || keys.has(primitive.sourceKey)
      || !Number.isInteger(primitive.triangleCount)
      || primitive.triangleCount < 1
    ) {
      throw new Error('ICE3_TOOL_LOD_INVALID: unit curve primitive is invalid');
    }
    keys.add(primitive.sourceKey);
  }
}

export type {
  ICELodCurvePrimitive,
  ICELodCurveSample,
  ICELodUnitCurve,
  ICELodUnitPrimitive,
} from './types.js';
