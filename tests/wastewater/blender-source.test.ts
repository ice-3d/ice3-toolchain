import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { NodeIO, type Node } from '@gltf-transform/core';
import { expect } from '#test-expect';
import { createWastewaterSceneSpec } from
  '../../tools/wastewater-plant/scene-spec.js';

let sourceRoot = '';
let sourceGlb = '';

before(async () => {
  sourceRoot = await mkdtemp(join(tmpdir(), 'ice3-wwtp-blender-'));
  sourceGlb = join(sourceRoot, 'source.glb');
  const result = spawnSync(process.execPath, [
    '--import',
    'tsx',
    'tools/wastewater-plant/build-blender-source.ts',
    '--output',
    sourceGlb,
  ], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
});

after(async () => {
  await rm(sourceRoot, { recursive: true, force: true });
});

function buildSourceForTest(): string {
  return sourceGlb;
}

interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

function worldBounds(node: Node): Bounds | undefined {
  const mesh = node.getMesh();
  if (!mesh) return undefined;
  const matrix = node.getWorldMatrix();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    if (!position) continue;
    const localMin = position.getMin([]);
    const localMax = position.getMax([]);
    for (let corner = 0; corner < 8; corner += 1) {
      const local = [
        (corner & 1) === 0 ? localMin[0]! : localMax[0]!,
        (corner & 2) === 0 ? localMin[1]! : localMax[1]!,
        (corner & 4) === 0 ? localMin[2]! : localMax[2]!,
      ];
      const world = [
        matrix[0]! * local[0]! + matrix[4]! * local[1]!
          + matrix[8]! * local[2]! + matrix[12]!,
        matrix[1]! * local[0]! + matrix[5]! * local[1]!
          + matrix[9]! * local[2]! + matrix[13]!,
        matrix[2]! * local[0]! + matrix[6]! * local[1]!
          + matrix[10]! * local[2]! + matrix[14]!,
      ];
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, world[axis]!);
        max[axis] = Math.max(max[axis]!, world[axis]!);
      }
    }
  }
  return min.every(Number.isFinite)
    ? { min: min as [number, number, number], max: max as [number, number, number] }
    : undefined;
}

function mergeBounds(items: readonly Bounds[]): Bounds {
  return {
    min: [0, 1, 2].map((axis) => (
      Math.min(...items.map((item) => item.min[axis]!))
    )) as [number, number, number],
    max: [0, 1, 2].map((axis) => (
      Math.max(...items.map((item) => item.max[axis]!))
    )) as [number, number, number],
  };
}

function overlaps(left: Bounds, right: Bounds): boolean {
  return [0, 1, 2].every((axis) => (
    Math.min(left.max[axis]!, right.max[axis]!)
      - Math.max(left.min[axis]!, right.min[axis]!)
    > 0.01
  ));
}

function buildingBounds(document: Awaited<ReturnType<NodeIO['read']>>): Map<string, Bounds> {
  const names = [
    'Administration',
    'ChemicalDosing',
    'Blower',
    'Dewatering',
    'Headworks',
  ];
  return new Map(names.map((name) => {
    const parts = document.getRoot().listNodes()
      .filter((node) => (
        node.getName() === `${name}.ExternalStairs`
        || node.getName().startsWith(`${name}.`)
      ))
      .flatMap((node) => {
        const bounds = worldBounds(node);
        return bounds ? [bounds] : [];
      });
    return [name, mergeBounds(parts)] as const;
  }));
}

test('exports a valid source GLB with stable equipment roots', async () => {
  const source = await readFile(buildSourceForTest());
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(
    source.subarray(20, 20 + jsonLength).toString('utf8'),
  ) as { asset: { generator?: string } };
  expect(json.asset.generator).toBe('ICE3 authored wastewater pipeline');
  const document = await new NodeIO().read(buildSourceForTest());
  const ids = document.getRoot().listNodes().flatMap((node) => {
    const value = node.getExtras().ice3 as
      | { selectionId?: string }
      | undefined;
    return value?.selectionId ? [value.selectionId] : [];
  });
  expect(new Set(ids).size).toBe(65);
});

test('creates the complete site envelope and process infrastructure', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const names = document.getRoot().listNodes().map((node) => node.getName());
  expect(names).toEqual(expect.arrayContaining([
    'Site',
    'RoadNetwork',
    'Buildings',
    'ProcessPipes',
    'Perimeter',
  ]));
  const primitives = document.getRoot().listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
  expect(primitives.length).toBeGreaterThan(100);
});

test('places every selectable equipment root inside the site ground', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const nodes = document.getRoot().listNodes();
  const ground = nodes.find((node) => node.getName() === 'Ground.Slab');
  expect(ground).toBeDefined();
  const groundMatrix = ground!.getWorldMatrix();
  const groundPrimitive = ground!.getMesh()!.listPrimitives()[0]!;
  const groundMin = groundPrimitive.getAttribute('POSITION')!.getMin([]);
  const groundMax = groundPrimitive.getAttribute('POSITION')!.getMax([]);
  const corners = [groundMin, groundMax].flatMap((minimum, index) => {
    const maximum = index === 0 ? groundMax : groundMin;
    return [0, 1, 2, 3, 4, 5, 6, 7].map((corner) => [
      (corner & 1) === 0 ? minimum[0]! : maximum[0]!,
      (corner & 2) === 0 ? minimum[1]! : maximum[1]!,
      (corner & 4) === 0 ? minimum[2]! : maximum[2]!,
      1,
    ]).map((point) => [
      groundMatrix[0]! * point[0]! + groundMatrix[4]! * point[1]!
        + groundMatrix[8]! * point[2]! + groundMatrix[12]!,
      groundMatrix[1]! * point[0]! + groundMatrix[5]! * point[1]!
        + groundMatrix[9]! * point[2]! + groundMatrix[13]!,
      groundMatrix[2]! * point[0]! + groundMatrix[6]! * point[1]!
        + groundMatrix[10]! * point[2]! + groundMatrix[14]!,
    ]);
  });
  const min = [0, 1, 2].map((axis) => (
    Math.min(...corners.map((point) => point[axis]!))
  ));
  const max = [0, 1, 2].map((axis) => (
    Math.max(...corners.map((point) => point[axis]!))
  ));

  expect(min[0]).toBeLessThanOrEqual(-24);
  expect(max[0]).toBeGreaterThanOrEqual(294);
  expect(min[2]).toBeLessThanOrEqual(-68);
  expect(max[2]).toBeGreaterThanOrEqual(112);
  const outside = nodes.filter((node) => {
    const profile = node.getExtras().ice3 as
      | { equipmentTag?: string }
      | undefined;
    if (!profile?.equipmentTag) return false;
    const matrix = node.getWorldMatrix();
    const x = matrix[12]!;
    const z = matrix[14]!;
    return x < min[0]! || x > max[0]! || z < min[2]! || z > max[2]!;
  }).map((node) => node.getName());
  expect(outside).toEqual([]);
});

test('separates overlapping ground layers to prevent depth flicker', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const nodes = document.getRoot().listNodes();
  const bounds = (name: string) => {
    const node = nodes.find((candidate) => candidate.getName() === name);
    const primitive = node?.getMesh()?.listPrimitives()[0];
    if (!node || !primitive) throw new Error(`missing site surface: ${name}`);
    const offset = node.getTranslation();
    const min = primitive.getAttribute('POSITION')!.getMin([]);
    const max = primitive.getAttribute('POSITION')!.getMax([]);
    return {
      x: [min[0]! + offset[0], max[0]! + offset[0]] as const,
      y: [min[1]! + offset[1], max[1]! + offset[1]] as const,
      z: [min[2]! + offset[2], max[2]! + offset[2]] as const,
    };
  };

  const ground = bounds('Ground.Slab');
  const padNodes = nodes
    .map((node) => node.getName())
    .filter((name) => name.startsWith('SitePads.'));
  const pads = padNodes.map(bounds);
  const roads = nodes
    .map((node) => node.getName())
    .filter((name) => (
      name.startsWith('RoadNetwork.') && name.split('.').length === 2
    ))
    .map(bounds);
  const padTop = Math.max(...pads.map(({ y }) => y[1]));
  for (const pad of pads) {
    expect(pad.y[0]).toBeGreaterThan(ground.y[1] + 0.005);
    expect(pad.y[1] - ground.y[1]).toBeGreaterThanOrEqual(0.3);
  }
  for (const road of roads) {
    expect(road.y[0]).toBeGreaterThan(padTop + 0.02);
  }
  const overlappingPads: string[] = [];
  for (let left = 0; left < pads.length; left += 1) {
    for (let right = left + 1; right < pads.length; right += 1) {
      const a = pads[left]!;
      const b = pads[right]!;
      const overlapX = Math.min(a.x[1], b.x[1]) - Math.max(a.x[0], b.x[0]);
      const overlapZ = Math.min(a.z[1], b.z[1]) - Math.max(a.z[0], b.z[0]);
      if (overlapX > 0.001 && overlapZ > 0.001) {
        overlappingPads.push(
          `${padNodes[left]} / ${padNodes[right]}: `
          + `${overlapX.toFixed(6)} x ${overlapZ.toFixed(6)}`,
        );
      }
    }
  }
  expect(overlappingPads).toEqual([]);
});

test('models distinct process equipment with presentation-grade detail', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const nodes = new Map(
    document.getRoot().listNodes().map((node) => [node.getName(), node]),
  );
  const triangleCount = (name: string) => nodes.get(name)?.getMesh()
    ?.listPrimitives().reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0) ?? 0;
  expect(triangleCount('SC-101')).toBeGreaterThan(1600);
  expect(triangleCount('AE-101')).toBeGreaterThan(1200);
  expect(triangleCount('GR-102')).toBeGreaterThan(600);
  expect(triangleCount('BLW-101')).toBeGreaterThan(600);
});

test('keeps decorative buildings clear of process equipment and each other', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const buildings = buildingBounds(document);
  const equipment = document.getRoot().listNodes().flatMap((node) => {
    const profile = node.getExtras().ice3 as
      | { equipmentTag?: string }
      | undefined;
    const bounds = worldBounds(node);
    return profile?.equipmentTag && bounds
      ? [{ tag: profile.equipmentTag, bounds }]
      : [];
  });
  const collisions: string[] = [];
  for (const [name, bounds] of buildings) {
    for (const item of equipment) {
      if (overlaps(bounds, item.bounds)) {
        collisions.push(`${name} / ${item.tag}`);
      }
    }
  }
  const entries = [...buildings];
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      if (overlaps(entries[left]![1], entries[right]![1])) {
        collisions.push(`${entries[left]![0]} / ${entries[right]![0]}`);
      }
    }
  }
  expect(collisions).toEqual([]);
});

test('routes process pipes clear of decorative building volumes', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const buildings = buildingBounds(document);
  const intersections: string[] = [];
  for (const connection of createWastewaterSceneSpec().connections) {
    for (let index = 0; index < connection.routePoints.length - 1; index += 1) {
      const start = connection.routePoints[index]!;
      const end = connection.routePoints[index + 1]!;
      for (const [name, bounds] of buildings) {
        let tMin = 0;
        let tMax = 1;
        let intersects = true;
        for (const axis of [0, 1, 2] as const) {
          const delta = end[axis] - start[axis];
          if (Math.abs(delta) < 1e-9) {
            intersects = start[axis] >= bounds.min[axis]!
              && start[axis] <= bounds.max[axis]!;
          } else {
            const first = (bounds.min[axis]! - start[axis]) / delta;
            const second = (bounds.max[axis]! - start[axis]) / delta;
            tMin = Math.max(tMin, Math.min(first, second));
            tMax = Math.min(tMax, Math.max(first, second));
            intersects = tMin <= tMax;
          }
          if (!intersects) break;
        }
        if (intersects) {
          intersections.push(`${connection.id} / ${name}`);
        }
      }
    }
  }
  expect([...new Set(intersections)]).toEqual([]);
});

test('builds each external staircase around a continuous structural core', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const stairs = document.getRoot().listNodes()
    .filter((node) => node.getName().endsWith('.ExternalStairs'));
  expect(stairs).toHaveLength(5);
  for (const node of stairs) {
    const mesh = node.getMesh();
    expect(mesh).toBeDefined();
    const primitive = mesh!.listPrimitives()[0]!;
    const positions = primitive.getAttribute('POSITION')!.getArray()!;
    const indices = primitive.getIndices()!.getArray()!;
    const vertexIds = new Map<string, number>();
    const welded: number[] = [];
    const indexMap = new Uint32Array(indices.length);
    for (let offset = 0; offset < indices.length; offset += 1) {
      const source = indices[offset]! * 3;
      const key = [
        Math.round(positions[source]! * 1_000),
        Math.round(positions[source + 1]! * 1_000),
        Math.round(positions[source + 2]! * 1_000),
      ].join(',');
      let id = vertexIds.get(key);
      if (id === undefined) {
        id = vertexIds.size;
        vertexIds.set(key, id);
        welded.push(source);
      }
      indexMap[offset] = id;
    }
    const parent = new Uint32Array(vertexIds.size);
    for (let index = 0; index < parent.length; index += 1) parent[index] = index;
    const find = (value: number): number => {
      let current = value;
      while (parent[current] !== current) {
        parent[current] = parent[parent[current]!]!;
        current = parent[current]!;
      }
      return current;
    };
    const union = (left: number, right: number): void => {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent[b] = a;
    };
    for (let offset = 0; offset < indexMap.length; offset += 3) {
      union(indexMap[offset]!, indexMap[offset + 1]!);
      union(indexMap[offset]!, indexMap[offset + 2]!);
    }
    const triangleCounts = new Map<number, number>();
    for (let offset = 0; offset < indexMap.length; offset += 3) {
      const rootId = find(indexMap[offset]!);
      triangleCounts.set(rootId, (triangleCounts.get(rootId) ?? 0) + 1);
    }
    const largest = Math.max(...triangleCounts.values());
    const total = indices.length / 3;
    expect(largest / total).toBeGreaterThan(0.45);
  }
});

test('models advanced and sludge equipment with recognizable assemblies', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const nodes = new Map(
    document.getRoot().listNodes().map((node) => [node.getName(), node]),
  );
  for (const name of [
    'DIG-101',
    'DIG-102',
    'FLARE-101',
    'UV-101',
    'DWG-101',
    'FL-101',
    'OZ-101',
  ]) {
    expect(nodes.has(name)).toBe(true);
  }
  const triangleCount = (name: string) => nodes.get(name)?.getMesh()
    ?.listPrimitives().reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0) ?? 0;
  expect(triangleCount('DIG-101')).toBeGreaterThan(1300);
  expect(triangleCount('DWG-101')).toBeGreaterThan(900);
  expect(triangleCount('UV-101')).toBeGreaterThan(800);
  expect(triangleCount('FL-101')).toBeGreaterThan(1000);
  expect(triangleCount('OZ-101')).toBeGreaterThan(800);
  const total = document.getRoot().listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0);
  expect(total).toBeGreaterThanOrEqual(1_800_000);
});

test('exports connected pipe runs with semantic process metadata', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const pipes = document.getRoot().listNodes().flatMap((node) => {
    const profile = node.getExtras().ice3 as
      | {
          role?: string;
          connectionId?: string;
          from?: string;
          to?: string;
          medium?: string;
        }
      | undefined;
    return profile?.role === 'process-pipe' ? [{ node, profile }] : [];
  });
  expect(pipes.length).toBeGreaterThanOrEqual(90);
  expect(new Set(pipes.map(({ profile }) => profile.connectionId)).size)
    .toBe(pipes.length);
  for (const { node, profile } of pipes) {
    expect(node.getMesh()).toBeDefined();
    expect(profile.from).toMatch(/^[^:]+:[a-z-]+$/);
    expect(profile.to).toMatch(/^[^:]+:[a-z-]+$/);
    expect(String(profile.medium).length).toBeGreaterThan(0);
  }
});

test('overlaps pipe ends into equipment collars and supports elevated runs', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const spec = createWastewaterSceneSpec();
  const ports = new Map(spec.equipment.flatMap((equipment) => (
    equipment.ports.map((port) => (
      [`${equipment.tag}:${port.id}`, port] as const
    ))
  )));
  const nodes = document.getRoot().listNodes();
  for (const connection of spec.connections) {
    const pipe = nodes.find((node) => {
      const profile = node.getExtras().ice3 as
        | { role?: string; connectionId?: string }
        | undefined;
      return profile?.role === 'process-pipe'
        && profile.connectionId === connection.id;
    });
    expect(pipe).toBeDefined();
    const bounds = worldBounds(pipe!);
    expect(bounds).toBeDefined();
    const firstPort = ports.get(connection.from)!;
    const lastPort = ports.get(connection.to)!;
    const firstInside = firstPort.position.map((value, axis) => (
      value - firstPort.direction[axis]! * 0.35
    ));
    const lastInside = lastPort.position.map((value, axis) => (
      value - lastPort.direction[axis]! * 0.35
    ));
    for (const point of [firstInside, lastInside]) {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(point[axis]).toBeGreaterThanOrEqual(bounds!.min[axis]! - 0.001);
        expect(point[axis]).toBeLessThanOrEqual(bounds!.max[axis]! + 0.001);
      }
    }
    const elevatedHorizontal = connection.layout !== 'buried'
      && connection.routePoints.some((point, index) => {
        const next = connection.routePoints[index + 1];
        return next !== undefined
          && Math.abs(point[1] - next[1]) < 0.01
          && Math.hypot(next[0] - point[0], next[2] - point[2]) > 6;
      });
    if (elevatedHorizontal) {
      expect(nodes.some((node) => (
        node.getName() === `Pipe.${connection.id}.Supports`
      ))).toBe(true);
    }
  }
});

test('exports equipment business context and connected port names', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const equipment = document.getRoot().listNodes().flatMap((node) => {
    const profile = node.getExtras().ice3 as
      | {
          equipmentTag?: string;
          area?: string;
          ports?: string[];
          connections?: string[];
        }
      | undefined;
    return profile?.equipmentTag ? [{ node, profile }] : [];
  });
  expect(equipment).toHaveLength(65);
  for (const { node, profile } of equipment) {
    expect(node.getName()).toBe(profile.equipmentTag);
    expect(profile.area?.length).toBeGreaterThan(0);
    expect(profile.ports?.length).toBeGreaterThan(0);
    expect(profile.connections?.length).toBeGreaterThan(0);
  }
});

test('keeps process media and structural surfaces visually distinct', async () => {
  const document = await new NodeIO().read(buildSourceForTest());
  const colors = new Map(document.getRoot().listMaterials().map((material) => (
    [material.getName(), material.getBaseColorFactor()]
  )));
  const required = [
    'Site.waterPipe',
    'Site.mixedLiquorPipe',
    'Site.sludgePipe',
    'Site.airPipe',
    'Site.chemicalPipe',
    'Site.biogasPipe',
    'Site.backwashPipe',
    'Site.filtratePipe',
    'Site.treatedPipe',
    'Equipment.concrete',
    'Equipment.steel',
    'Equipment.stage:biological',
  ];
  for (const name of required) expect(colors.has(name)).toBe(true);
  const pipeColors = required.slice(0, 9).map((name) => colors.get(name)!);
  for (const color of pipeColors) {
    const luminance = color[0]! * 0.2126 + color[1]! * 0.7152 + color[2]! * 0.0722;
    expect(luminance).toBeGreaterThan(0.08);
    expect(color.slice(0, 3).every((value) => value > 0.85)).toBe(false);
  }
  const distances = pipeColors.flatMap((left, leftIndex) => (
    pipeColors.slice(leftIndex + 1).map((right) => (
      Math.hypot(
        left[0]! - right[0]!,
        left[1]! - right[1]!,
        left[2]! - right[2]!,
      )
    ))
  ));
  expect(Math.min(...distances)).toBeGreaterThan(0.06);
});
