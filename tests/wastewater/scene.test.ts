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

test('builds a detailed plant-wide industrial scene', () => {
  const { document, equipment } = createWastewaterPlantDocument();
  const root = document.getRoot();
  const nodeNames = new Set(root.listNodes().map((node) => node.getName()));
  const primitiveCount = root.listMeshes().reduce(
    (total, mesh) => total + mesh.listPrimitives().length,
    0,
  );
  const triangleCount = root.listMeshes().reduce(
    (total, mesh) => total + mesh.listPrimitives().reduce(
      (meshTotal, primitive) => (
        meshTotal + (primitive.getIndices()?.getCount() ?? 0) / 3
      ),
      0,
    ),
    0,
  );
  const ground = root.listNodes().find((node) => node.getName() === 'SiteGround');
  const points = ground?.getMesh()?.listPrimitives()
    .flatMap((primitive) => [...primitive.getAttribute('POSITION')!.getArray()!]);

  expect(equipment.length).toBeGreaterThanOrEqual(65);
  expect(equipment.map((item) => item.tag)).toEqual(
    expect.arrayContaining(['UV-101', 'DIG-101', 'DIG-102', 'FLARE-101']),
  );
  for (const name of [
    'SiteGround',
    'RoadNetwork',
    'HeadworksBuilding',
    'BlowerBuilding',
    'DewateringBuilding',
    'AdministrationBuilding',
  ]) {
    expect(nodeNames.has(name)).toBe(true);
  }
  expect(points).toBeDefined();
  expect(Math.min(...(points ?? []).filter((_, index) => index % 3 === 0)))
    .toBeLessThan(0);
  expect(Math.max(...(points ?? []).filter((_, index) => index % 3 === 0)))
    .toBeGreaterThan(280);
  expect(triangleCount).toBeGreaterThanOrEqual(40_000);
  expect(primitiveCount).toBeLessThanOrEqual(550);
});

test('keeps equipment volumes spatially separated', () => {
  const { document, equipment } = createWastewaterPlantDocument();
  const nodes = new Map(
    document.getRoot().listNodes().map((node) => [node.getName(), node]),
  );
  const boxes = equipment.map((item) => {
    const node = nodes.get(item.tag);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const primitive of node?.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const low = position.getMin([]);
      const high = position.getMax([]);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(
          min[axis]!,
          low[axis]! + item.position[axis]!,
        );
        max[axis] = Math.max(
          max[axis]!,
          high[axis]! + item.position[axis]!,
        );
      }
    }
    return { tag: item.tag, min, max };
  });
  const collisions: string[] = [];
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left]!;
      const b = boxes[right]!;
      const overlap = [0, 1, 2].map(
        (axis) => Math.min(a.max[axis]!, b.max[axis]!)
          - Math.max(a.min[axis]!, b.min[axis]!),
      );
      if (overlap.every((value) => value > 0.15)) {
        collisions.push(`${a.tag} ↔ ${b.tag}`);
      }
    }
  }

  expect(collisions).toEqual([]);
});
