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

  expect(spec.connections.length).toBeGreaterThanOrEqual(90);
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
      'utilityWater',
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

test('routes process pipes as orthogonal or short 45-degree runs', () => {
  const spec = createWastewaterSceneSpec();
  for (const connection of spec.connections) {
    expect(connection.routePoints.length).toBeGreaterThanOrEqual(3);
    const start = connection.routePoints[0]!;
    const end = connection.routePoints.at(-1)!;
    const fromPort = spec.equipment
      .find((item) => connection.from.startsWith(`${item.tag}:`))!
      .ports.find((port) => connection.from.endsWith(`:${port.id}`))!;
    const toPort = spec.equipment
      .find((item) => connection.to.startsWith(`${item.tag}:`))!
      .ports.find((port) => connection.to.endsWith(`:${port.id}`))!;
    expect(start).toEqual(fromPort.position);
    expect(end).toEqual(toPort.position);

    for (let index = 1; index < connection.routePoints.length; index += 1) {
      const before = connection.routePoints[index - 1]!;
      const after = connection.routePoints[index]!;
      const deltas = after.map((value, axis) => (
        Math.abs(value - before[axis]!)
      ));
      const movingAxes = deltas.filter((value) => value > 0.001);
      expect(movingAxes.length).toBeGreaterThan(0);
      expect(movingAxes.length).toBeLessThanOrEqual(2);
      if (movingAxes.length === 2) {
        expect(Math.abs(movingAxes[0]! - movingAxes[1]!)).toBeLessThan(0.001);
      }
    }
  }
});
