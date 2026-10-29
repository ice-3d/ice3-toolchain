import { readFile } from 'node:fs/promises';
import {
  IfcAPI,
  IFCCONVERSIONBASEDUNIT,
  IFCPROJECT,
  IFCSIUNIT,
  LogLevel,
} from 'web-ifc';

export interface IIfcOpenDocument {
  readonly api: IfcAPI;
  readonly modelID: number;
  readonly schema: string;
  readonly sourceBytes: Uint8Array;
}

export async function createIfcApi(): Promise<IfcAPI> {
  const api = new IfcAPI();
  await api.Init();
  api.SetLogLevel(LogLevel.LOG_LEVEL_ERROR);
  return api;
}

export async function openIfcDocument(
  api: IfcAPI,
  path: string,
): Promise<IIfcOpenDocument> {
  const bytes = new Uint8Array(await readFile(path));
  const text = new TextDecoder().decode(bytes);
  if (
    !/^\uFEFF?ISO-10303-21;/u.test(text)
    || !/END-ISO-10303-21;\s*$/u.test(text)
  ) {
    throw new Error('ICE3_TOOL_IFC_IMPORT_FAILED');
  }
  const modelID = api.OpenModel(bytes, {
    ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: false,
    COORDINATE_TO_ORIGIN: false,
    MEMORY_LIMIT: 512 * 1024 * 1024,
  });
  if (modelID < 0) {
    throw new Error('ICE3_TOOL_IFC_IMPORT_FAILED');
  }
  try {
    const schema = api.GetModelSchema(modelID);
    if (!/^IFC4X3(?:[_-]|$)/u.test(schema)) {
      throw new Error(`ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED: ${schema}`);
    }
    validateIfcLengthUnit(api, modelID);
    return { api, modelID, schema, sourceBytes: bytes };
  } catch (error) {
    api.CloseModel(modelID);
    throw error;
  }
}

export function validateIfcLengthUnit(
  api: IfcAPI,
  modelID: number,
): void {
  const projectIds = [...api.GetLineIDsWithType(modelID, IFCPROJECT)];
  if (projectIds.length !== 1) {
    throw new Error('ICE3_TOOL_IFC_UNIT_UNSUPPORTED');
  }
  const project = api.GetLine(modelID, projectIds[0]!);
  const assignmentId = project.UnitsInContext?.value;
  if (!Number.isInteger(assignmentId)) {
    throw new Error('ICE3_TOOL_IFC_UNIT_UNSUPPORTED');
  }
  const assignment = api.GetLine(modelID, assignmentId);
  const lengthUnits = (assignment.Units ?? [])
    .map((value: unknown) => referenceValue(value))
    .filter((id: number) => {
      const unit = api.GetLine(modelID, id);
      return unit.UnitType?.value === 'LENGTHUNIT';
    });
  if (lengthUnits.length !== 1) {
    throw new Error('ICE3_TOOL_IFC_UNIT_UNSUPPORTED');
  }
  const unitId = lengthUnits[0]!;
  const unitType = api.GetLineType(modelID, unitId);
  const metres = unitType === IFCSIUNIT
    ? siLengthUnitMeters(api.GetLine(modelID, unitId))
    : unitType === IFCCONVERSIONBASEDUNIT
      ? conversionLengthUnitMeters(
          api,
          modelID,
          api.GetLine(modelID, unitId),
        )
      : undefined;
  if (metres === undefined || !Number.isFinite(metres)) {
    throw new Error('ICE3_TOOL_IFC_UNIT_UNSUPPORTED');
  }
}

function siLengthUnitMeters(line: Record<string, any>): number | undefined {
  if (line.UnitType?.value !== 'LENGTHUNIT') return undefined;
  const name = line.Name?.value;
  if (name !== 'METRE') return undefined;
  const prefix = line.Prefix?.value ?? '';
  const scale: Readonly<Record<string, number>> = {
    '': 1,
    EXA: 1e18,
    PETA: 1e15,
    TERA: 1e12,
    GIGA: 1e9,
    MEGA: 1e6,
    KILO: 1e3,
    HECTO: 1e2,
    DECA: 1e1,
    DECI: 1e-1,
    CENTI: 1e-2,
    MILLI: 1e-3,
    MICRO: 1e-6,
    NANO: 1e-9,
    PICO: 1e-12,
    FEMTO: 1e-15,
    ATTO: 1e-18,
  };
  return scale[String(prefix)];
}

function conversionLengthUnitMeters(
  api: IfcAPI,
  modelID: number,
  line: Record<string, any>,
): number | undefined {
  if (line.UnitType?.value !== 'LENGTHUNIT') return undefined;
  const measure = line.ConversionFactor?.value;
  const measureValue = measure?.ValueComponent?.value;
  const unitRef = measure?.UnitComponent?.value;
  if (!Number.isFinite(measureValue) || !Number.isInteger(unitRef)) {
    return undefined;
  }
  return siLengthUnitMeters(api.GetLine(modelID, unitRef));
}

function referenceValue(value: unknown): number {
  const reference = value as { readonly value?: unknown } | undefined;
  return typeof reference?.value === 'number' ? reference.value : -1;
}
