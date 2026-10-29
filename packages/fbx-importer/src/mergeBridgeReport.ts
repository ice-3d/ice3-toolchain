import type {
  IFbxBridgeObject,
  IFbxBridgeReport,
} from './types.js';

export interface IFbxInstanceMetadata {
  readonly groups: ReadonlyMap<string, string>;
  readonly instanceNodeCount: number;
}

export function mergeBridgeReport(
  report: IFbxBridgeReport,
): ReadonlyMap<string, IFbxBridgeObject> {
  return new Map(report.objects.map((object) => [object.name, object] as const));
}

export function createInstanceMetadata(
  objects: readonly IFbxBridgeObject[],
): IFbxInstanceMetadata {
  const byMeshData = new Map<string, number>();
  for (const object of objects) {
    if (!object.meshData) continue;
    byMeshData.set(object.meshData, (byMeshData.get(object.meshData) ?? 0) + 1);
  }
  const sorted = [...byMeshData.keys()].sort();
  const groups = new Map(
    sorted.map((meshData, index) => [
      meshData,
      `fbx/mesh-data/${index}`,
    ] as const),
  );
  const instanceNodeCount = [...byMeshData.values()]
    .reduce((total, count) => total + Math.max(0, count - 1), 0);
  return { groups, instanceNodeCount };
}
