import type { IIfcPrimitive } from './types.js';

export interface IIfcValueResult {
  readonly value?: IIfcPrimitive | readonly IIfcPrimitive[];
  readonly omitted: number;
}

export function parseIfcValue(
  input: unknown,
  depth = 0,
): IIfcValueResult {
  if (depth > 8) return { omitted: 1 };
  if (
    typeof input === 'string'
    || typeof input === 'boolean'
  ) {
    return { value: input, omitted: 0 };
  }
  if (typeof input === 'number') {
    return Number.isFinite(input)
      ? { value: input, omitted: 0 }
      : { omitted: 1 };
  }
  if (Array.isArray(input)) {
    if (input.length > 256) return { omitted: 1 };
    const values: IIfcPrimitive[] = [];
    let omitted = 0;
    for (const item of input) {
      const parsed = parseIfcValue(item, depth + 1);
      omitted += parsed.omitted;
      if (parsed.value === undefined) {
        continue;
      } else if (typeof parsed.value === 'object') {
        omitted += 1;
      } else {
        values.push(parsed.value);
      }
    }
    return omitted > 0
      ? { omitted }
      : { value: values, omitted: 0 };
  }
  if (!input || typeof input !== 'object') {
    return { omitted: 1 };
  }
  const record = input as Record<string, unknown>;
  if (record._representationValue !== undefined) {
    return parseIfcValue(record._representationValue, depth + 1);
  }
  if (record.value !== undefined) {
    return parseIfcValue(record.value, depth + 1);
  }
  return { omitted: 1 };
}

export function normalizeIfcString(value: unknown): string | undefined {
  const parsed = parseIfcValue(value);
  if (typeof parsed.value === 'string') {
    const normalized = parsed.value.trim();
    return normalized && normalized !== '$' ? normalized : undefined;
  }
  if (typeof parsed.value === 'number' || typeof parsed.value === 'boolean') {
    return String(parsed.value);
  }
  return undefined;
}
