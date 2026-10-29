import type { IUsdBridgeObject } from './types.js';

export interface IUsdInstanceMetadata {
  readonly groups: ReadonlyMap<string, string>;
  readonly instanceNodeCount: number;
}

export function mergeBridgeReport(
  objects: readonly IUsdBridgeObject[],
): ReadonlyMap<string, IUsdBridgeObject> {
  const result = new Map<string, IUsdBridgeObject>();
  for (const object of objects) result.set(object.name, object);
  return result;
}

export function createInstanceMetadata(
  objects: readonly IUsdBridgeObject[],
): IUsdInstanceMetadata {
  const groups = new Map<string, IUsdBridgeObject[]>();
  for (const object of objects) {
    if (!object.meshData) continue;
    const group = groups.get(object.meshData) ?? [];
    group.push(object);
    groups.set(object.meshData, group);
  }
  const groupIds = new Map<string, string>();
  let instanceNodeCount = 0;
  for (const [meshData, members] of [...groups.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (members.length < 2) continue;
    const id = `usd/instance/${slug(meshData)}`;
    groupIds.set(meshData, id);
    instanceNodeCount += members.length - 1;
  }
  for (const object of objects) {
    if (object.meshData && groups.get(object.meshData)?.length === 1) {
      groupIds.delete(object.meshData);
    }
  }
  return {
    groups: groupIds,
    instanceNodeCount,
  };
}

function slug(value: string): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '');
  return normalized || 'mesh';
}
