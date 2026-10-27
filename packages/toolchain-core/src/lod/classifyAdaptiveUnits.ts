export function classifyAdaptiveUnits(
  unitIds: readonly string[],
  ratios: readonly number[],
): readonly string[] {
  if (unitIds.length !== ratios.length || ratios.length === 0) {
    throw new Error('ICE3_TOOL_LOD_INVALID: adaptive ratio classification is invalid');
  }
  const counts = new Map<number, number>();
  for (const ratio of ratios) {
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      throw new Error('ICE3_TOOL_LOD_INVALID: adaptive ratio is invalid');
    }
    const key = Math.round(ratio * 10_000);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const maximumCount = Math.max(...counts.values());
  const dominant = maximumCount > 1
    ? [...counts]
      .filter((entry) => entry[1] === maximumCount)
      .sort((left, right) => left[0] - right[0])[0]![0] / 10_000
    : [...counts.keys()]
      .sort((left, right) => left - right)
      .at(Math.floor((counts.size - 1) / 2))! / 10_000;
  return unitIds.filter((_unitId, index) => (
    Math.abs(ratios[index]! - dominant) > 0.01
  ));
}
