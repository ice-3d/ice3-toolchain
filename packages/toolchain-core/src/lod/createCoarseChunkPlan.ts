export interface ICECoarseChunkUnit {
  readonly unitId: string;
  readonly bytes: number;
}

export interface ICECoarseChunk {
  readonly unitIds: readonly string[];
  readonly bytes: number;
  readonly oversized: boolean;
}

export function createCoarseChunkPlan(
  units: readonly ICECoarseChunkUnit[],
  options: { readonly maxBytes: number },
): readonly ICECoarseChunk[] {
  if (!Number.isInteger(options.maxBytes) || options.maxBytes < 1) {
    throw new Error('ICE3_TOOL_LOD_INVALID: maxBytes must be a positive integer');
  }
  const ids = new Set<string>();
  for (const unit of units) {
    if (!unit.unitId || !Number.isFinite(unit.bytes) || unit.bytes < 0 || ids.has(unit.unitId)) {
      throw new Error('ICE3_TOOL_LOD_INVALID: coarse chunk units are invalid');
    }
    ids.add(unit.unitId);
  }
  const sorted = [...units].sort((left, right) => (
    left.unitId.localeCompare(right.unitId, 'en')
  ));
  const chunks: ICECoarseChunk[] = [];
  let current: ICECoarseChunkUnit[] = [];
  let bytes = 0;
  const flush = (): void => {
    if (current.length === 0) return;
    chunks.push({
      unitIds: current.map((unit) => unit.unitId),
      bytes,
      oversized: bytes > options.maxBytes,
    });
    current = [];
    bytes = 0;
  };
  for (const unit of sorted) {
    if (unit.bytes > options.maxBytes) {
      flush();
      current = [unit];
      bytes = unit.bytes;
      flush();
      continue;
    }
    if (current.length > 0 && bytes + unit.bytes > options.maxBytes) flush();
    current.push(unit);
    bytes += unit.bytes;
  }
  flush();
  return chunks;
}
