import type { IfcAPI } from 'web-ifc';
import type { IIfcOpenDocument } from './ifcApi.js';
import {
  normalizeIfcString,
  parseIfcValue,
} from './parseIfcValues.js';
import type {
  IIfcPrimitive,
  IIfcMetadata,
  IIfcMetadataNode,
  IIfcProductMetadata,
  IIfcPropertySetMetadata,
  IIfcSystemMetadata,
  IIfcSystemReference,
} from './types.js';

const SPATIAL_TYPES = new Set([
  'IFCPROJECT',
  'IFCSITE',
  'IFCBUILDING',
  'IFCBUILDINGSTOREY',
  'IFCSPACE',
]);

interface SpatialNode {
  readonly expressID: number;
  readonly type: string;
  readonly children: readonly SpatialNode[];
}

export async function readIfcMetadata(
  document: IIfcOpenDocument,
  assetId: string,
): Promise<IIfcMetadata> {
  const { api, modelID } = document;
  const spatial = (
    await api.properties.getSpatialStructure(modelID, false)
  ) as SpatialNode;
  const nodes: IIfcMetadataNode[] = [];
  const products: IIfcProductMetadata[] = [];
  const systemMembers = new Map<number, Set<string>>();
  const usedSelectionIds = new Set<string>();
  const warnings: string[] = [];

  function visit(node: SpatialNode): void {
    const line = api.GetLine(modelID, node.expressID);
    const ifcType = normalizedType(node.type);
    nodes.push({
      expressId: node.expressID,
      ifcType,
      name: nodeName(line, ifcType, node.expressID),
      children: node.children.map((child) => child.expressID),
    });
    if (api.IsIfcElement(line.type) && !SPATIAL_TYPES.has(ifcType)) {
      products.push(readProduct(
        api,
        modelID,
        node.expressID,
        ifcType,
        assetId,
        usedSelectionIds,
        systemMembers,
        warnings,
      ));
    }
    for (const child of node.children) visit(child);
  }

  visit(spatial);
  products.sort((left, right) => left.expressId - right.expressId);
  const systems = [...readSystems(api, modelID, systemMembers)]
    .sort((left, right) => (
      left.globalId?.localeCompare(right.globalId ?? '')
        ?? left.expressId - right.expressId
    ));
  return {
    projectId: spatial.expressID,
    nodes,
    products,
    systems,
    warnings: [...new Set(warnings)].sort(),
  };
}

function readProduct(
  api: IfcAPI,
  modelID: number,
  expressID: number,
  ifcType: string,
  assetId: string,
  usedSelectionIds: Set<string>,
  systemMembers: Map<number, Set<string>>,
  warnings: string[],
): IIfcProductMetadata {
  const line = api.GetLine(modelID, expressID, false, true);
  const globalId = normalizeIfcString(line.GlobalId);
  let selectionId = globalId
    ? `${assetId}/ifc/${globalId}`
    : `${assetId}/ifc/express/${expressID}`;
  if (usedSelectionIds.has(selectionId)) {
    warnings.push(`IFC_DUPLICATE_GLOBAL_ID:${expressID}`);
    selectionId = `${selectionId}/express/${expressID}`;
  }
  usedSelectionIds.add(selectionId);

  const propertySets = readPropertySets(
    api,
    modelID,
    line.IsDefinedBy,
    expressID,
    warnings,
  );
  const systems: IIfcSystemReference[] = [];
  for (const reference of values(line.HasAssignments)) {
    const relation = api.GetLine(modelID, reference);
    const groupId = referenceValue(relation.RelatingGroup);
    if (!Number.isInteger(groupId)) continue;
    const system = api.GetLine(modelID, groupId);
    if (!api.GetNameFromTypeCode(system.type).toUpperCase().includes('SYSTEM')) {
      continue;
    }
    const systemGlobalId = normalizeIfcString(system.GlobalId);
    const systemReference: IIfcSystemReference = {
      ...(systemGlobalId
        ? { globalId: systemGlobalId }
        : {}),
      name: normalizeIfcString(system.Name) ?? `IFC System ${groupId}`,
      ifcType: api.GetNameFromTypeCode(system.type).toUpperCase(),
    };
    systems.push(systemReference);
    const members = systemMembers.get(groupId) ?? new Set<string>();
    members.add(selectionId);
    systemMembers.set(groupId, members);
  }
  systems.sort(compareSystem);

  const description = normalizeIfcString(line.Description);
  const objectType = normalizeIfcString(line.ObjectType);
  const predefinedType = normalizeIfcString(line.PredefinedType);
  const tag = normalizeIfcString(line.Tag);
  return {
    expressId: expressID,
    ifcType,
    ...(globalId ? { globalId } : {}),
    selectionId,
    name: nodeName(line, ifcType, expressID),
    ...(description ? { description } : {}),
    ...(objectType ? { objectType } : {}),
    ...(predefinedType ? { predefinedType } : {}),
    ...(tag ? { tag } : {}),
    propertySets,
    systems,
  };
}

function readPropertySets(
  api: IfcAPI,
  modelID: number,
  definitions: unknown,
  productId: number,
  warnings: string[],
): readonly IIfcPropertySetMetadata[] {
  const propertySets: IIfcPropertySetMetadata[] = [];
  let omitted = 0;
  for (const relationId of values(definitions)) {
    const relation = api.GetLine(modelID, relationId);
    const definitionId = referenceValue(relation.RelatingPropertyDefinition);
    if (!Number.isInteger(definitionId)) continue;
    const definition = api.GetLine(modelID, definitionId);
    const properties: Record<
      string,
      IIfcPrimitive | readonly IIfcPrimitive[]
    > = {};
    const entries = definition.HasProperties ?? definition.Quantities ?? [];
    for (const propertyId of values(entries)) {
      const property = api.GetLine(modelID, propertyId);
      const name = normalizeIfcString(property.Name);
      if (!name) {
        omitted += 1;
        continue;
      }
      const valueInput = property.NominalValue
        ?? Object.entries(property)
          .find(([key, value]) => key.endsWith('Value') && value !== null)?.[1];
      const parsed = parseIfcValue(valueInput);
      omitted += parsed.omitted;
      if (parsed.value !== undefined) properties[name] = parsed.value;
    }
    const name = normalizeIfcString(definition.Name);
    if (!name || Object.keys(properties).length === 0) continue;
    propertySets.push({ name, properties });
  }
  if (omitted > 0) {
    warnings.push(`IFC_PROPERTY_OMITTED:${productId}:${omitted}`);
  }
  return propertySets.sort((left, right) => left.name.localeCompare(right.name));
}

function readSystems(
  api: IfcAPI,
  modelID: number,
  systemMembers: ReadonlyMap<number, ReadonlySet<string>>,
): readonly IIfcSystemMetadata[] {
  return [...systemMembers.entries()].map(([expressId, members]) => {
    const line = api.GetLine(modelID, expressId);
    const globalId = normalizeIfcString(line.GlobalId);
    return {
      expressId,
      ...(globalId ? { globalId } : {}),
      name: normalizeIfcString(line.Name) ?? `IFC System ${expressId}`,
      ifcType: api.GetNameFromTypeCode(line.type).toUpperCase(),
      members: [...members].sort(),
    };
  });
}

function values(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const reference = referenceValue(item);
    return Number.isInteger(reference) ? [reference] : [];
  });
}

function referenceValue(value: unknown): number {
  const reference = value as { readonly value?: unknown } | undefined;
  return typeof reference?.value === 'number' ? reference.value : -1;
}

function nodeName(
  line: Record<string, unknown>,
  ifcType: string,
  expressID: number,
): string {
  return normalizeIfcString(line.Name)
    ?? normalizeIfcString(line.ObjectType)
    ?? `ifc/${ifcType}/${expressID}`;
}

function normalizedType(value: string): string {
  return value.toUpperCase();
}

function compareSystem(
  left: IIfcSystemReference,
  right: IIfcSystemReference,
): number {
  return (left.globalId ?? '').localeCompare(right.globalId ?? '')
    || left.name.localeCompare(right.name)
    || left.ifcType.localeCompare(right.ifcType);
}
