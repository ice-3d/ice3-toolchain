import { test } from 'node:test';
import { expect } from '#test-expect';
import { createWastewaterPlantDocument } from
  '../../tools/wastewater-plant/scene.js';
import { equipmentArea } from '../../tools/wastewater-plant/layout.js';
import { WASTEWATER_EQUIPMENT } from
  '../../tools/wastewater-plant/equipment.js';

test('builds the complete synthetic treatment facility', () => {
  const { document, equipment } = createWastewaterPlantDocument();
  const scene = document.getRoot().listScenes()[0]!;

  expect(scene.getName()).toBe('SyntheticWastewaterPlant');
  expect(equipment.length).toBeGreaterThanOrEqual(60);
  expect(new Set(equipment.map((item) => item.tag)).size)
    .toBe(equipment.length);
  expect(document.getRoot().listTextures()).toHaveLength(0);
});

test('writes stable semantic identity to every selectable equipment node', () => {
  const { document, equipment } = createWastewaterPlantDocument();
  const selectable = document.getRoot().listNodes()
    .filter((node) => Boolean(node.getExtras().ice3));

  expect(selectable).toHaveLength(equipment.length);
  for (const node of selectable) {
    const identity = node.getExtras().ice3 as Record<string, unknown>;
    expect(identity.selectionId).toBe(
      `ice3-virtual-wwtp/equipment/${identity.equipmentTag}`,
    );
    expect(String(identity.processStage).length).toBeGreaterThan(0);
  }
});

test('covers all primary, auxiliary, and return-flow systems', () => {
  const { equipment } = createWastewaterPlantDocument();
  const tags = new Set(equipment.map((item) => item.tag));

  for (const tag of [
    'IN-001', 'GR-101', 'P-101', 'GR-102', 'GC-101', 'PC-101',
    'DW-101', 'AT-101', 'AX-101', 'AE-101', 'AT-201', 'AX-201',
    'AE-201', 'SC-101', 'SC-201', 'P-RAS-101', 'P-WAS-301',
    'P-LIFT-111', 'CO-101', 'FL-101', 'DT-101', 'AIT-COD-101',
    'FIT-101', 'OUT-101', 'ST-101', 'DWG-101', 'DRY-101',
    'SILO-101', 'PAC-101', 'PAM-101', 'NACLO-101', 'EQ-101',
  ]) {
    expect(tags.has(tag)).toBe(true);
  }
});

test('separates the two parallel biological treatment trains', () => {
  const trainA = WASTEWATER_EQUIPMENT
    .filter((item) => item.tag.endsWith('101'))
    .filter((item) => ['AT-101', 'AX-101', 'AE-101'].includes(item.tag));
  const trainB = WASTEWATER_EQUIPMENT
    .filter((item) => ['AT-201', 'AX-201', 'AE-201'].includes(item.tag));

  expect(trainA.map(equipmentArea)).toEqual([
    'BiologicalTrainA',
    'BiologicalTrainA',
    'BiologicalTrainA',
  ]);
  expect(trainB.map(equipmentArea)).toEqual([
    'BiologicalTrainB',
    'BiologicalTrainB',
    'BiologicalTrainB',
  ]);
});
