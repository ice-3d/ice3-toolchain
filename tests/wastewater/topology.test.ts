import { test } from 'node:test';
import { expect } from '#test-expect';
import { createWastewaterSceneSpec } from
  '../../tools/wastewater-plant/scene-spec.js';

test('defines stable ports for every equipment unit', () => {
  const spec = createWastewaterSceneSpec();
  for (const equipment of spec.equipment) {
    expect(equipment.ports.length).toBeGreaterThan(0);
    expect(new Set(equipment.ports.map((port) => port.id)).size)
      .toBe(equipment.ports.length);
    for (const port of equipment.ports) {
      expect(port.position.every(Number.isFinite)).toBe(true);
      expect(port.direction).toHaveLength(3);
      expect(port.diameter).toBeGreaterThan(0);
    }
  }
});

test('connects every pipeline endpoint to an existing equipment port', () => {
  const spec = createWastewaterSceneSpec();
  const ports = new Map(spec.equipment.flatMap((equipment) => (
    equipment.ports.map((port) => (
      [`${equipment.tag}:${port.id}`, port] as const
    ))
  )));
  const ids = new Set<string>();

  expect(spec.connections.length).toBeGreaterThanOrEqual(45);
  for (const connection of spec.connections) {
    expect(ids.has(connection.id)).toBe(false);
    ids.add(connection.id);
    expect(ports.has(connection.from)).toBe(true);
    expect(ports.has(connection.to)).toBe(true);
    expect(connection.diameter).toBeGreaterThan(0);
  }
  expect([...new Set(spec.connections.map((connection) => connection.medium))])
    .toEqual(expect.arrayContaining([
      'wastewater',
      'sludge',
      'air',
      'chemical',
      'biogas',
      'backwash',
    ]));
  const connectedTags = new Set(spec.connections.flatMap((connection) => (
    [connection.from.split(':')[0]!, connection.to.split(':')[0]!]
  )));
  expect(spec.equipment.map((equipment) => equipment.tag)
    .filter((tag) => !connectedTags.has(tag))).toEqual([]);
  for (const equipment of spec.equipment) {
    expect(equipment.area.length).toBeGreaterThan(0);
    expect(equipment.connectionIds.length).toBeGreaterThan(0);
  }
});
