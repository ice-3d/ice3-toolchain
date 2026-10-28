import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { WASTEWATER_EQUIPMENT } from './equipment.js';
import {
  AREA_NAMES,
  equipmentArea,
  MAIN_FLOW_TAGS,
  RETURN_FLOW_ROUTES,
} from './layout.js';
import {
  equipmentPorts,
  processConnections,
  type ICEWWTPConnectionSpec,
  type ICEWWTPEquipmentSceneSpec,
} from './topology.js';

export interface ICEWastewaterSceneSpec {
  readonly schemaVersion: 1;
  readonly assetId: 'ice3-virtual-wwtp';
  readonly units: 'meters';
  readonly equipment: readonly ICEWWTPEquipmentSceneSpec[];
  readonly areas: readonly string[];
  readonly mainFlowTags: readonly string[];
  readonly returnFlows: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly material: string;
  }[];
  readonly connections: readonly ICEWWTPConnectionSpec[];
}

export function createWastewaterSceneSpec(): ICEWastewaterSceneSpec {
  const equipmentWithPorts = Object.freeze(WASTEWATER_EQUIPMENT.map((item) => (
    Object.freeze({ ...item, ports: equipmentPorts(item) })
  )));
  const connections = processConnections(equipmentWithPorts);
  const equipment = Object.freeze(equipmentWithPorts.map((item) => (
    Object.freeze({
      ...item,
      area: equipmentArea(item),
      connectionIds: Object.freeze(connections
        .filter(({ from, to }) => (
          from.startsWith(`${item.tag}:`) || to.startsWith(`${item.tag}:`)
        ))
        .map(({ id }) => id)),
    })
  )));
  return Object.freeze({
    schemaVersion: 1,
    assetId: 'ice3-virtual-wwtp',
    units: 'meters',
    equipment,
    areas: AREA_NAMES,
    mainFlowTags: MAIN_FLOW_TAGS,
    returnFlows: RETURN_FLOW_ROUTES,
    connections,
  });
}

export async function writeWastewaterSceneSpec(
  outputPath: string,
): Promise<void> {
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      temporary,
      `${JSON.stringify(createWastewaterSceneSpec(), null, 2)}\n`,
    );
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

if (process.argv[1]?.endsWith('scene-spec.ts')) {
  const index = process.argv.indexOf('--output');
  const output = process.argv[index + 1];
  if (index < 0 || !output) {
    throw new Error('usage: scene-spec --output <path>');
  }
  await writeWastewaterSceneSpec(output);
}
