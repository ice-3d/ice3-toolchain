import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { WASTEWATER_EQUIPMENT } from './equipment.js';
import {
  AREA_NAMES,
  MAIN_FLOW_TAGS,
  RETURN_FLOW_ROUTES,
} from './layout.js';
import type { ICEWWTPEquipmentSpec } from './types.js';

export interface ICEWastewaterSceneSpec {
  readonly schemaVersion: 1;
  readonly assetId: 'ice3-virtual-wwtp';
  readonly units: 'meters';
  readonly equipment: readonly ICEWWTPEquipmentSpec[];
  readonly areas: readonly string[];
  readonly mainFlowTags: readonly string[];
  readonly returnFlows: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly material: string;
  }[];
}

export function createWastewaterSceneSpec(): ICEWastewaterSceneSpec {
  return Object.freeze({
    schemaVersion: 1,
    assetId: 'ice3-virtual-wwtp',
    units: 'meters',
    equipment: WASTEWATER_EQUIPMENT,
    areas: AREA_NAMES,
    mainFlowTags: MAIN_FLOW_TAGS,
    returnFlows: RETURN_FLOW_ROUTES,
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
