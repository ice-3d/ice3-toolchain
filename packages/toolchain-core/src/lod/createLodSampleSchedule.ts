export interface ICELodSampleScheduleOptions {
  readonly sourceTriangles: number;
  readonly minimumTriangles: number;
  readonly sampleCount: number;
}

export function createLodSampleSchedule(
  options: ICELodSampleScheduleOptions,
): readonly number[] {
  const { sourceTriangles, minimumTriangles, sampleCount } = options;
  if (
    !Number.isInteger(sourceTriangles)
    || sourceTriangles < 1
    || !Number.isInteger(minimumTriangles)
    || minimumTriangles < 1
    || minimumTriangles > sourceTriangles
    || !Number.isInteger(sampleCount)
    || sampleCount < 4
    || sampleCount > 32
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: LOD sample schedule is invalid');
  }
  if (sourceTriangles === minimumTriangles) return [sourceTriangles];
  const logMinimum = Math.log(minimumTriangles);
  const logRange = Math.log(sourceTriangles) - logMinimum;
  const values = Array.from({ length: sampleCount }, (_value, index) => (
    Math.round(Math.exp(
      logMinimum + logRange * index / (sampleCount - 1),
    ))
  ));
  values[0] = minimumTriangles;
  values[values.length - 1] = sourceTriangles;
  return [...new Set(values)];
}
