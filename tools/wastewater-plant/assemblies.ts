import type {
  ICEWWTPEquipmentSpec,
  ICEWWTPMeshData,
} from './types.js';
import { WASTEWATER_PALETTE } from './palette.js';
import {
  createBox,
  createCylinder,
  createFrustum,
  createOpenCylinder,
  createPipeSegment,
  createRing,
} from './primitives.js';

export type MaterialKey = keyof typeof WASTEWATER_PALETTE;

export interface GeometryPart {
  readonly data: ICEWWTPMeshData;
  readonly material: MaterialKey;
}

type Point = readonly [number, number, number];

function translated(data: ICEWWTPMeshData, offset: Point): ICEWWTPMeshData {
  const positions = new Float32Array(data.positions);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = positions[index]! + offset[0];
    positions[index + 1] = positions[index + 1]! + offset[1];
    positions[index + 2] = positions[index + 2]! + offset[2];
  }
  return Object.freeze({
    positions,
    normals: new Float32Array(data.normals),
    indices: new Uint32Array(data.indices),
  });
}

export function boxPart(
  width: number,
  height: number,
  depth: number,
  offset: Point,
  material: MaterialKey,
): GeometryPart {
  return {
    data: translated(createBox(width, height, depth), offset),
    material,
  };
}

function cylinderPart(
  radius: number,
  height: number,
  offset: Point,
  material: MaterialKey,
  open = false,
  segmentCount = 20,
): GeometryPart {
  return {
    data: translated(
      open
        ? createOpenCylinder(radius, height, segmentCount)
        : createCylinder(radius, height, segmentCount),
      offset,
    ),
    material,
  };
}

function frustumPart(
  bottomRadius: number,
  topRadius: number,
  height: number,
  offset: Point,
  material: MaterialKey,
  segmentCount = 24,
): GeometryPart {
  return {
    data: translated(
      createFrustum(bottomRadius, topRadius, height, segmentCount),
      offset,
    ),
    material,
  };
}

function ringPart(
  outerRadius: number,
  innerRadius: number,
  height: number,
  offset: Point,
  material: MaterialKey,
  segmentCount = 32,
): GeometryPart {
  return {
    data: translated(
      createRing(outerRadius, innerRadius, height, segmentCount),
      offset,
    ),
    material,
  };
}

export function pipePart(
  from: Point,
  to: Point,
  radius: number,
  material: MaterialKey,
  segmentCount = 12,
): GeometryPart {
  return {
    data: createPipeSegment(from, to, radius, Math.max(8, segmentCount)),
    material,
  };
}

function railingLine(
  from: readonly [number, number],
  to: readonly [number, number],
  baseY: number,
): GeometryPart[] {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const postCount = Math.max(2, Math.ceil(length / 1.5) + 1);
  const parts: GeometryPart[] = [];
  for (let index = 0; index < postCount; index += 1) {
    const ratio = index / (postCount - 1);
    parts.push(boxPart(
      0.07,
      0.95,
      0.07,
      [from[0] + dx * ratio, baseY + 0.475, from[1] + dz * ratio],
      'safety',
    ));
  }
  parts.push(pipePart(
    [from[0], baseY + 0.94, from[1]],
    [to[0], baseY + 0.94, to[1]],
    0.04,
    'safety',
    8,
  ));
  parts.push(pipePart(
    [from[0], baseY + 0.55, from[1]],
    [to[0], baseY + 0.55, to[1]],
    0.025,
    'safety',
    8,
  ));
  return parts;
}

function railingRectangle(
  width: number,
  depth: number,
  baseY: number,
): GeometryPart[] {
  const x = width / 2;
  const z = depth / 2;
  return [
    ...railingLine([-x, z], [x, z], baseY),
    ...railingLine([x, z], [x, -z], baseY),
    ...railingLine([x, -z], [-x, -z], baseY),
    ...railingLine([-x, -z], [-x, z], baseY),
  ];
}

function ladderParts(
  x: number,
  z: number,
  baseY: number,
  height: number,
): GeometryPart[] {
  const parts: GeometryPart[] = [
    boxPart(0.07, height, 0.07, [x - 0.25, baseY + height / 2, z], 'safety'),
    boxPart(0.07, height, 0.07, [x + 0.25, baseY + height / 2, z], 'safety'),
  ];
  for (let step = 0; step < Math.floor(height / 0.32); step += 1) {
    parts.push(boxPart(
      0.5,
      0.035,
      0.06,
      [x, baseY + 0.25 + step * 0.32, z],
      'safety',
    ));
  }
  return parts;
}

function walkwayParts(
  width: number,
  depth: number,
  baseY: number,
): GeometryPart[] {
  return [
    boxPart(width, 0.16, depth, [0, baseY, 0], 'concreteLight'),
    ...railingLine(
      [-width / 2, depth / 2],
      [width / 2, depth / 2],
      baseY + 0.08,
    ),
    ...railingLine(
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      baseY + 0.08,
    ),
  ];
}

function rectangularTankParts(
  width: number,
  depth: number,
  height: number,
  water = true,
): GeometryPart[] {
  return [
    boxPart(width, 0.22, depth, [0, 0.11, 0], 'concreteDark'),
    boxPart(0.32, height, depth, [-width / 2, height / 2, 0], 'concrete'),
    boxPart(0.32, height, depth, [width / 2, height / 2, 0], 'concrete'),
    boxPart(width, height, 0.32, [0, height / 2, -depth / 2], 'concrete'),
    boxPart(width, height, 0.32, [0, height / 2, depth / 2], 'concrete'),
    ...(water
      ? [boxPart(
        width - 0.55,
        0.05,
        depth - 0.55,
        [0, height * 0.68, 0],
        'water',
      )]
      : []),
    ...railingRectangle(width + 0.7, depth + 0.7, height),
  ];
}

function inletParts(): GeometryPart[] {
  return [
    boxPart(9.5, 0.25, 3.2, [0, 0.125, 0], 'concreteDark'),
    boxPart(9.5, 1.5, 0.28, [0, 0.75, -1.6], 'concrete'),
    boxPart(9.5, 1.5, 0.28, [0, 0.75, 1.6], 'concrete'),
    boxPart(9.2, 0.06, 2.7, [0, 0.86, 0], 'water'),
    boxPart(0.8, 1.8, 3.4, [-4.6, 0.9, 0], 'concrete'),
    boxPart(0.8, 1.8, 3.4, [4.6, 0.9, 0], 'concrete'),
    ...railingLine([-4.5, 1.8], [4.5, 1.8], 1.5),
    ...ladderParts(4.9, 0, 0, 1.6),
    boxPart(0.18, 1.3, 2.5, [3.9, 1.05, 0], 'steelDark'),
  ];
}

function barScreenParts(fine: boolean): GeometryPart[] {
  const parts = [
    ...rectangularTankParts(6.4, 2.8, 1.45),
    boxPart(4.9, 0.3, 0.36, [0, 2.45, 0.3], 'steel'),
    boxPart(0.8, 0.7, 0.65, [1.55, 2.75, 0.3], 'equipmentDark'),
    boxPart(0.6, 0.35, 0.55, [2.25, 2.75, 0.3], 'equipment'),
    boxPart(0.9, 0.45, 0.8, [2.95, 1.4, 1.55], 'steelDark'),
    boxPart(0.85, 0.8, 0.75, [3.35, 0.4, 2.25], 'equipmentDark'),
  ];
  const barCount = fine ? 18 : 10;
  for (let index = 0; index < barCount; index += 1) {
    const x = -2.25 + index * (4.5 / (barCount - 1));
    parts.push(pipePart(
      [x, 0.42, -0.82],
      [x, 2.25, 0.75],
      fine ? 0.025 : 0.045,
      'steel',
      6,
    ));
  }
  for (const y of [0.7, 1.35, 2]) {
    parts.push(pipePart(
      [-2.45, y, -0.82 + (y - 0.42) / 1.83 * 1.57],
      [2.45, y, -0.82 + (y - 0.42) / 1.83 * 1.57],
      0.045,
      'steelDark',
      8,
    ));
  }
  parts.push(boxPart(4.8, 0.1, 1.75, [0, 0.75, -0.82], 'concreteDark'));
  return parts;
}

function pumpParts(): GeometryPart[] {
  return [
    boxPart(3.2, 0.22, 2.15, [0, 0.11, 0], 'concreteDark'),
    boxPart(2.8, 0.18, 0.18, [0, 0.31, -0.75], 'steelDark'),
    boxPart(2.8, 0.18, 0.18, [0, 0.31, 0.75], 'steelDark'),
    cylinderPart(0.52, 0.95, [-0.35, 0.78, 0], 'equipment'),
    cylinderPart(0.43, 0.72, [0.55, 0.72, 0], 'equipmentDark'),
    boxPart(0.38, 0.35, 0.42, [0.1, 0.9, 0], 'instrument'),
    pipePart([-0.35, 0.4, 0], [-1.55, 0.4, 0], 0.16, 'waterPipe'),
    pipePart([1.0, 0.4, 0], [1.75, 0.4, 0], 0.16, 'waterPipe'),
    pipePart([-1.55, 0.4, 0], [-1.55, 1.55, 0], 0.16, 'waterPipe'),
    pipePart([1.75, 0.4, 0], [1.75, 1.55, 0], 0.16, 'waterPipe'),
    boxPart(0.42, 0.42, 0.5, [-0.1, 1.18, 0], 'steelDark'),
    boxPart(0.36, 0.22, 0.36, [1.02, 1.45, 0], 'instrument'),
    ...railingRectangle(2.9, 2.1, 0.25),
  ];
}

function gritBasinParts(): GeometryPart[] {
  const parts = rectangularTankParts(8.8, 5.2, 1.8);
  parts.push(
    boxPart(8.9, 0.16, 0.7, [0, 2.1, 0], 'concreteLight'),
    ...railingLine([-4.3, 0.32], [4.3, 0.32], 2.15),
    ...railingLine([-4.3, -0.32], [4.3, -0.32], 2.15),
    boxPart(0.65, 0.5, 0.8, [0, 2.35, 0], 'equipmentDark'),
    frustumPart(1.1, 0.45, 1.35, [3.2, 0.5, 0], 'concreteDark', 20),
    pipePart([-3.9, 2.6, -2.1], [3.9, 2.6, -2.1], 0.12, 'airPipe'),
    pipePart([3.9, 2.6, -2.1], [3.9, 0.75, -2.1], 0.12, 'airPipe'),
    ...ladderParts(-4.7, 0, 0, 1.8),
  );
  for (const x of [-2.6, 0, 2.6]) {
    parts.push(
      pipePart([x, 0.7, -2.1], [x, 0.7, 2.1], 0.07, 'airPipe', 8),
      boxPart(0.5, 0.22, 0.55, [x, 2.05, 0], 'steel'),
    );
  }
  return parts;
}

function gritClassifierParts(): GeometryPart[] {
  return [
    boxPart(3.8, 0.22, 2.4, [0, 0.11, 0], 'concreteDark'),
    frustumPart(1.3, 0.7, 1.4, [-1.45, 1.0, 0], 'steel', 20),
    pipePart([-1.35, 0.85, 0], [1.55, 2.45, 0], 0.45, 'steel', 16),
    boxPart(0.8, 0.65, 0.8, [1.75, 2.7, 0], 'equipmentDark'),
    cylinderPart(0.3, 0.8, [1.95, 0.9, 0], 'equipment'),
    boxPart(0.8, 0.8, 0.8, [-2.2, 0.6, 0], 'equipmentDark'),
    ...railingRectangle(3.7, 2.3, 0.25),
  ];
}

function rectangularClarifierParts(): GeometryPart[] {
  const parts = rectangularTankParts(10, 5.4, 2.1);
  parts.push(
    boxPart(9.2, 0.16, 0.8, [0, 2.45, 0], 'concreteLight'),
    ...railingLine([-4.6, 0.42], [4.6, 0.42], 2.5),
    ...railingLine([-4.6, -0.42], [4.6, -0.42], 2.5),
    boxPart(0.7, 0.7, 1.0, [0, 2.8, 0], 'equipmentDark'),
    boxPart(9.1, 0.16, 0.3, [0, 1.62, 2.74], 'concreteLight'),
    boxPart(9.1, 0.32, 0.28, [0, 1.47, 3.0], 'concreteDark'),
    frustumPart(0.95, 0.35, 1.1, [-4.1, 0.35, 0], 'concreteDark', 18),
    ...ladderParts(5.2, 0, 0, 2.1),
  );
  for (const x of [-3.2, 0, 3.2]) {
    parts.push(
      boxPart(0.09, 1.2, 4.5, [x, 0.72, 0], 'steelDark'),
      boxPart(2.8, 0.12, 0.18, [x, 0.45, 0], 'steel'),
    );
  }
  return parts;
}

function distributionWellParts(): GeometryPart[] {
  return [
    cylinderPart(2.4, 0.24, [0, 0.12, 0], 'concreteDark', false, 32),
    ringPart(2.4, 2.05, 1.8, [0, 0.9, 0], 'concrete', 32),
    cylinderPart(2.0, 0.05, [0, 1.08, 0], 'water', false, 32),
    cylinderPart(0.72, 1.35, [0, 1.55, 0], 'equipmentDark', true, 24),
    ...railingLine([-2.05, 2.05], [2.05, 2.05], 1.8),
    ...railingLine([2.05, 2.05], [2.05, -2.05], 1.8),
    ...railingLine([2.05, -2.05], [-2.05, -2.05], 1.8),
    ...railingLine([-2.05, -2.05], [-2.05, 2.05], 1.8),
    pipePart([2.0, 0.7, 0], [4.2, 0.7, 0], 0.28, 'waterPipe'),
    pipePart([-2.0, 0.9, 0], [-4.0, 0.9, 0], 0.25, 'waterPipe'),
    boxPart(0.45, 1.1, 0.25, [2.15, 1.35, 0], 'steelDark'),
  ];
}

function emergencyBasinParts(): GeometryPart[] {
  return [
    ...rectangularTankParts(8.4, 6.2, 2.3),
    ...walkwayParts(8.8, 0.9, 2.35),
    ...ladderParts(4.8, 0, 0, 2.3),
    pipePart([-3.8, 2.4, -2.5], [3.8, 2.4, -2.5], 0.16, 'waterPipe'),
  ];
}

function biologicalReactorParts(
  spec: ICEWWTPEquipmentSpec,
): GeometryPart[] {
  const openCell = signalForReactor(spec);
  const parts = [
    boxPart(10.4, 0.22, 4.8, [0, 0.11, 0], 'concreteDark'),
    boxPart(0.34, 2.2, 4.8, [-5.2, 1.1, 0], 'concrete'),
    boxPart(0.34, 2.2, 4.8, [5.2, 1.1, 0], 'concrete'),
    boxPart(10.4, 2.2, 0.34, [0, 1.1, -2.4], 'concrete'),
    boxPart(10.4, 2.2, 0.34, [0, 1.1, 2.4], 'concrete'),
    boxPart(0.24, 2.0, 4.4, [-1.7, 1.0, 0], 'concreteLight'),
    boxPart(0.24, 2.0, 4.4, [1.7, 1.0, 0], 'concreteLight'),
    ...(openCell
      ? [
          boxPart(3.0, 0.05, 4.4, [-3.35, 1.5, 0], 'water'),
          boxPart(3.0, 0.05, 4.4, [3.35, 1.5, 0], 'water'),
        ]
      : [boxPart(10, 0.05, 4.4, [0, 1.5, 0], 'water')]),
    ...walkwayParts(10.8, 0.95, 2.28),
    ...walkwayParts(0.9, 4.7, 2.28),
    ...ladderParts(-5.35, 0, 0, 2.2),
    ...railingLine([-5.1, 2.35], [5.1, 2.35], 2.2),
  ];
  for (const x of [-3.4, 0, 3.4]) {
    parts.push(
      boxPart(0.6, 0.35, 0.6, [x, 2.52, -1.3], 'equipmentDark'),
      cylinderPart(0.06, 1.7, [x, 1.0, -1.3], 'steel', false, 8),
      cylinderPart(0.27, 0.1, [x, 0.48, -1.3], 'steelDark', false, 12),
    );
  }
  for (let row = -1; row <= 1; row += 1) {
    for (let column = -3; column <= 3; column += 1) {
      parts.push(
        cylinderPart(
          0.11,
          0.08,
          [column * 1.05, 0.5, row * 1.15],
          'instrument',
          false,
          8,
        ),
      );
    }
    parts.push(pipePart(
      [-4.2, 0.38, row * 1.15],
      [4.2, 0.38, row * 1.15],
      0.055,
      'airPipe',
      8,
    ));
  }
  parts.push(
    pipePart([-4.1, 2.65, -2.1], [4.1, 2.65, -2.1], 0.14, 'airPipe'),
    pipePart([4.1, 2.65, -2.1], [4.1, 0.4, -2.1], 0.1, 'airPipe'),
  );
  return parts;
}

function signalForReactor(spec: ICEWWTPEquipmentSpec): boolean {
  return spec.tag === 'AE-201';
}

function circularClarifierParts(
  radius: number,
  thickener: boolean,
): GeometryPart[] {
  const wallOuter = radius + 0.28;
  const water = thickener ? 1.05 : 1.5;
  return [
    cylinderPart(wallOuter + 0.2, 0.24, [0, 0.12, 0], 'concreteDark', false, 36),
    ringPart(wallOuter, radius, thickener ? 1.8 : 2.2, [
      0,
      thickener ? 0.9 : 1.1,
      0,
    ], 'concrete', 36),
    cylinderPart(radius - 0.18, 0.05, [0, water, 0], 'water', false, 36),
    cylinderPart(0.95, 1.45, [0, 1.18, 0], 'concreteLight', true, 24),
    cylinderPart(0.4, 1.05, [0, 1.9, 0], 'equipmentDark', false, 20),
    boxPart(radius * 2.2, 0.18, 0.62, [0, 2.62, 0], 'steelDark'),
    ...railingLine([-radius * 1.05, 0.3], [radius * 1.05, 0.3], 2.7),
    ...railingLine([-radius * 1.05, -0.3], [radius * 1.05, -0.3], 2.7),
    ringPart(radius - 0.38, radius - 0.66, 0.28, [0, water + 0.2, 0], 'concreteLight', 36),
    ringPart(radius - 0.84, radius - 0.98, 0.42, [0, water + 0.18, 0], 'steel', 36),
    pipePart([0, 0.38, 0], [radius * 0.92, 0.38, 0], 0.09, 'sludgePipe'),
    pipePart([radius * 0.92, 0.38, 0], [radius + 0.75, 0.38, 0], 0.13, 'sludgePipe'),
    pipePart([-radius * 0.9, 2.45, 0], [radius * 0.9, 2.45, 0], 0.045, 'safety'),
    ...ladderParts(radius + 0.55, 0, 0, thickener ? 1.8 : 2.2),
  ];
}

function chemicalTankParts(): GeometryPart[] {
  return [
    boxPart(3.8, 0.2, 3.2, [0, 0.1, 0], 'concreteDark'),
    boxPart(3.5, 0.7, 0.16, [0, 0.35, -1.5], 'concrete'),
    boxPart(3.5, 0.7, 0.16, [0, 0.35, 1.5], 'concrete'),
    boxPart(0.16, 0.7, 3.2, [-1.75, 0.35, 0], 'concrete'),
    boxPart(0.16, 0.7, 3.2, [1.75, 0.35, 0], 'concrete'),
    cylinderPart(1.15, 3.8, [0, 2.2, 0], 'equipment', false, 24),
    frustumPart(1.15, 0.35, 0.52, [0, 4.36, 0], 'equipmentDark', 24),
    cylinderPart(0.28, 0.45, [0, 4.7, 0], 'steelDark', false, 12),
    cylinderPart(0.36, 0.14, [0.72, 0.3, 0.75], 'equipmentDark', false, 12),
    pipePart([0.72, 0.37, 0.75], [0.72, 1.8, 0.75], 0.07, 'chemicalPipe'),
    pipePart([0.72, 1.8, 0.75], [1.6, 1.8, 0.75], 0.07, 'chemicalPipe'),
    ...railingLine([-1.8, 1.6], [1.8, 1.6], 0.7),
    ...ladderParts(1.45, 0, 0.7, 3.8),
  ];
}

function filterCellParts(): GeometryPart[] {
  const parts = rectangularTankParts(8.2, 4.4, 1.8);
  parts.push(
    boxPart(0.24, 1.35, 3.8, [-2.3, 0.8, 0], 'concreteLight'),
    boxPart(0.24, 1.35, 3.8, [0, 0.8, 0], 'concreteLight'),
    boxPart(0.24, 1.35, 3.8, [2.3, 0.8, 0], 'concreteLight'),
    ...walkwayParts(8.4, 0.75, 1.9),
    ...ladderParts(4.2, 0, 0, 1.8),
    pipePart([-3.8, 2.05, -2.0], [3.8, 2.05, -2.0], 0.13, 'waterPipe'),
  );
  for (const x of [-3.1, -0.8, 1.5, 3.8]) {
    parts.push(boxPart(0.18, 1.0, 1.9, [x, 0.3, 0], 'steelDark'));
  }
  return parts;
}

function contactBasinParts(): GeometryPart[] {
  const parts = rectangularTankParts(9.2, 4.8, 2.1, false);
  parts.push(
    boxPart(0.2, 1.9, 4.4, [-2.6, 0.95, 0], 'concreteLight'),
    boxPart(0.2, 1.9, 4.4, [2.6, 0.95, 0], 'concreteLight'),
    boxPart(5.0, 0.05, 1.35, [-1.5, 1.43, 1.42], 'water'),
    boxPart(5.0, 0.05, 1.35, [1.5, 1.43, -1.42], 'water'),
    ...walkwayParts(9.0, 0.8, 2.2),
    pipePart([-4.1, 2.3, -2.0], [4.1, 2.3, -2.0], 0.14, 'chemicalPipe'),
    ...ladderParts(4.6, 0, 0, 2.1),
  );
  return parts;
}

function membraneBasinParts(): GeometryPart[] {
  const parts = rectangularTankParts(8.8, 4.8, 2.0);
  for (const x of [-2.4, 0, 2.4]) {
    parts.push(
      boxPart(0.12, 1.2, 3.9, [x, 0.65, 0], 'steelDark'),
      boxPart(0.12, 1.2, 3.9, [x + 0.8, 0.65, 0], 'steelDark'),
      ...Array.from({ length: 7 }, (_, index) => pipePart(
        [x, 0.6, -1.7 + index * 0.56],
        [x + 0.8, 0.6, -1.7 + index * 0.56],
        0.045,
        'instrument',
        6,
      )),
    );
  }
  parts.push(
    ...walkwayParts(8.8, 0.7, 2.0),
    pipePart([-4, 2.15, -2.0], [4, 2.15, -2.0], 0.12, 'waterPipe'),
    ...ladderParts(4.4, 0, 0, 2.0),
  );
  return parts;
}

function blowerParts(): GeometryPart[] {
  return [
    boxPart(4.2, 0.25, 2.7, [0, 0.125, 0], 'concreteDark'),
    boxPart(3.8, 1.8, 2.35, [0, 1.15, 0], 'equipment'),
    boxPart(0.08, 1.45, 0.8, [-1.91, 1.18, -0.55], 'steelDark'),
    boxPart(0.08, 1.45, 0.8, [1.91, 1.18, -0.55], 'steelDark'),
    cylinderPart(0.5, 1.2, [-1.0, 1.45, 1.15], 'equipmentDark', false, 16),
    cylinderPart(0.36, 0.82, [0.2, 1.35, 1.12], 'equipment', false, 16),
    boxPart(0.5, 0.42, 0.3, [1.15, 1.48, 1.18], 'instrument'),
    boxPart(0.65, 0.7, 0.48, [-1.95, 1.35, 1.0], 'steelDark'),
    pipePart([-1.0, 1.0, 1.15], [-1.0, 0.55, 1.75], 0.16, 'airPipe'),
    pipePart([0.2, 0.95, 1.5], [0.2, 0.45, 2.0], 0.12, 'airPipe'),
    ...railingRectangle(3.9, 2.5, 0.25),
  ];
}

function sludgeDewateringParts(): GeometryPart[] {
  return [
    boxPart(7.5, 0.22, 4.0, [0, 0.11, 0], 'concreteDark'),
    frustumPart(1.45, 0.5, 1.15, [-2.7, 0.75, 0], 'equipment', 20),
    cylinderPart(1.45, 1.1, [-2.7, 1.75, 0], 'equipment', true, 20),
    boxPart(1.65, 1.2, 1.65, [-0.7, 0.82, 0], 'steel'),
    boxPart(1.2, 1.05, 1.2, [0.5, 0.75, 0], 'equipment'),
    cylinderPart(0.78, 1.5, [1.75, 0.9, 0], 'steel', false, 20),
    boxPart(0.5, 0.48, 0.42, [1.75, 1.82, 0], 'equipmentDark'),
    cylinderPart(0.34, 0.62, [2.55, 0.55, 0.75], 'equipmentDark', false, 14),
    pipePart([-2.7, 0.4, 0], [-0.7, 0.4, 0], 0.13, 'sludgePipe'),
    pipePart([-0.7, 0.65, 0], [1.75, 1.25, 0], 0.12, 'sludgePipe'),
    pipePart([2.55, 0.35, 0.75], [3.5, 0.35, 0.75], 0.06, 'chemicalPipe'),
    boxPart(1.65, 0.16, 0.35, [3.1, 0.75, 0], 'steelDark'),
    ...railingRectangle(7.2, 3.8, 0.25),
    ...ladderParts(3.1, 1.8, 0, 1.4),
  ];
}

function sludgeDryerParts(): GeometryPart[] {
  return [
    boxPart(5.0, 0.24, 3.0, [0, 0.12, 0], 'concreteDark'),
    cylinderPart(0.9, 3.4, [0, 1.6, 0], 'equipment', false, 20),
    boxPart(0.75, 0.75, 0.75, [-1.95, 0.75, 0], 'equipmentDark'),
    boxPart(0.55, 0.35, 0.5, [1.75, 1.25, 0], 'instrument'),
    pipePart([-1.6, 0.65, 0], [-0.7, 0.65, 0], 0.13, 'sludgePipe'),
    pipePart([0.8, 0.45, 0], [1.9, 0.45, 0], 0.13, 'sludgePipe'),
    pipePart([-0.4, 2.9, 0.65], [-1.6, 2.9, 0.65], 0.1, 'airPipe'),
    ...railingRectangle(4.8, 2.8, 0.25),
    ...ladderParts(2.2, 0, 0, 1.8),
  ];
}

function sludgeStorageParts(): GeometryPart[] {
  return [
    cylinderPart(2.2, 0.22, [0, 0.11, 0], 'concreteDark', false, 28),
    frustumPart(0.6, 1.85, 1.2, [0, 0.8, 0], 'steel', 28),
    cylinderPart(1.85, 3.2, [0, 3.0, 0], 'equipment', false, 28),
    frustumPart(1.85, 0.35, 0.7, [0, 4.95, 0], 'equipmentDark', 28),
    cylinderPart(0.38, 0.4, [0, 5.45, 0], 'steelDark', false, 12),
    cylinderPart(0.16, 0.5, [0, -0.15, 0], 'steelDark', false, 12),
    pipePart([1.4, 0.55, 0], [3.0, 0.55, 0], 0.16, 'sludgePipe'),
    ...plainLadder(1.95, 0, 0.3, 4.2),
  ];
}

function plainLadder(
  x: number,
  z: number,
  baseY: number,
  height: number,
): GeometryPart[] {
  const parts = [
    boxPart(0.08, height, 0.08, [x, baseY + height / 2, z - 0.22], 'fence'),
    boxPart(0.08, height, 0.08, [x, baseY + height / 2, z + 0.22], 'fence'),
    pipePart([x, baseY + height, z], [x, baseY + height + 0.8, z], 0.04, 'safety'),
    pipePart([x, baseY, z], [x, baseY + 0.8, z], 0.04, 'safety'),
  ];
  for (let step = 0; step < Math.floor(height / 0.35); step += 1) {
    parts.push(boxPart(
      0.08,
      0.04,
      0.5,
      [x, baseY + 0.25 + step * 0.35, z],
      'fence',
    ));
  }
  return parts;
}

function conveyorParts(): GeometryPart[] {
  return [
    boxPart(6.2, 0.18, 1.1, [0, 0.1, 0], 'concreteDark'),
    boxPart(5.4, 0.55, 0.95, [0, 1.15, 0], 'equipmentDark'),
    pipePart([-2.6, 0.9, 0], [2.6, 1.8, 0], 0.34, 'steel', 14),
    boxPart(0.65, 0.55, 0.65, [2.9, 1.95, 0], 'equipment'),
    boxPart(0.45, 0.32, 0.45, [-2.95, 0.75, 0], 'equipmentDark'),
    pipePart([-2.6, 0.8, 0.7], [-2.6, 1.8, 0.7], 0.04, 'fence'),
    pipePart([2.6, 1.55, 0.7], [2.6, 2.55, 0.7], 0.04, 'fence'),
  ];
}

function digesterParts(): GeometryPart[] {
  return [
    cylinderPart(3.2, 0.3, [0, 0.15, 0], 'concreteDark', false, 32),
    cylinderPart(2.9, 7.0, [0, 3.75, 0], 'concrete', false, 32),
    frustumPart(2.9, 1.1, 1.6, [0, 8.05, 0], 'equipmentDark', 32),
    cylinderPart(0.18, 0.8, [0, 9.05, 0], 'steel', false, 10),
    ringPart(3.02, 2.86, 0.16, [0, 7.2, 0], 'steel', 32),
    pipePart([2.5, 7.2, 0], [2.5, 8.7, 0], 0.1, 'airPipe'),
    pipePart([2.5, 8.7, 0], [4.4, 8.7, 0], 0.1, 'airPipe'),
    pipePart([-2.9, 0.65, 0], [-4.8, 0.65, 0], 0.2, 'sludgePipe'),
    ...plainLadder(3.0, 0, 0.3, 7.1),
    cylinderPart(3.05, 0.08, [0, 8.18, 0], 'safety', true, 32),
    cylinderPart(3.05, 0.05, [0, 7.72, 0], 'safety', true, 32),
    ...Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2;
      return pipePart(
        [Math.cos(angle) * 3.05, 7.3, Math.sin(angle) * 3.05],
        [Math.cos(angle) * 3.05, 8.2, Math.sin(angle) * 3.05],
        0.035,
        'safety',
        8,
      );
    }),
  ];
}

function flareParts(): GeometryPart[] {
  return [
    boxPart(4.0, 0.25, 4.0, [0, 0.125, 0], 'concreteDark'),
    cylinderPart(0.26, 10.5, [0, 5.4, 0], 'steelDark', false, 16),
    cylinderPart(0.38, 0.65, [0, 10.9, 0], 'safety', false, 16),
    pipePart([-1.5, 0.4, -1.5], [0, 7.0, 0], 0.09, 'steel', 8),
    pipePart([1.5, 0.4, -1.5], [0, 7.0, 0], 0.09, 'steel', 8),
    pipePart([-1.5, 0.4, 1.5], [0, 7.0, 0], 0.09, 'steel', 8),
    pipePart([1.5, 0.4, 1.5], [0, 7.0, 0], 0.09, 'steel', 8),
    pipePart([0, 1.2, 2.8], [0, 4.0, 0], 0.12, 'airPipe'),
    ...railingRectangle(3.8, 3.8, 0.25),
  ];
}

function uvParts(): GeometryPart[] {
  const parts = [
    boxPart(6.4, 0.22, 3.3, [0, 0.11, 0], 'concreteDark'),
    boxPart(6.4, 1.7, 0.25, [0, 0.85, -1.65], 'concrete'),
    boxPart(6.4, 1.7, 0.25, [0, 0.85, 1.65], 'concrete'),
    boxPart(0.28, 1.7, 3.3, [-3.2, 0.85, 0], 'concrete'),
    boxPart(0.28, 1.7, 3.3, [3.2, 0.85, 0], 'concrete'),
    boxPart(6.0, 0.06, 2.8, [0, 0.95, 0], 'water'),
    boxPart(0.75, 1.65, 0.75, [2.7, 1.0, 1.95], 'instrument'),
    ...walkwayParts(6.4, 0.7, 1.75),
    ...ladderParts(-3.35, 0, 0, 1.7),
  ];
  for (const x of [-2.0, 0, 2.0]) {
    parts.push(
      boxPart(0.12, 1.3, 2.75, [x, 1.2, 0], 'steelDark'),
      ...Array.from({ length: 5 }, (_, index) => pipePart(
        [x, 0.65 + index * 0.18, -1.2],
        [x, 0.65 + index * 0.18, 1.2],
        0.035,
        'instrument',
        6,
      )),
    );
  }
  return parts;
}

function valveParts(): GeometryPart[] {
  return [
    boxPart(1.8, 0.18, 1.8, [0, 0.09, 0], 'concreteDark'),
    cylinderPart(0.42, 0.9, [0, 0.58, 0], 'equipment'),
    boxPart(0.66, 0.58, 0.66, [0, 1.3, 0], 'equipmentDark'),
    cylinderPart(0.35, 0.08, [0, 1.66, 0], 'safety', false, 16),
    pipePart([-1.8, 0.55, 0], [1.8, 0.55, 0], 0.16, 'waterPipe'),
    pipePart([-0.8, 0.55, 0], [-0.8, 0.55, 1.3], 0.16, 'waterPipe'),
    boxPart(0.3, 0.42, 0.3, [1.25, 0.72, 0], 'instrument'),
  ];
}

function analyzerParts(): GeometryPart[] {
  return [
    boxPart(1.0, 0.15, 0.8, [0, 0.075, 0], 'concreteDark'),
    cylinderPart(0.07, 2.8, [-0.25, 1.5, 0], 'equipmentDark', false, 10),
    boxPart(1.0, 1.2, 0.5, [0, 2.05, 0], 'instrument'),
    boxPart(0.68, 0.38, 0.06, [0, 2.25, 0.28], 'glazing'),
    boxPart(0.14, 1.6, 0.14, [0.72, 0.85, 0], 'chemicalPipe'),
    pipePart([-0.25, 2.65, 0], [-0.25, 3.3, 0], 0.04, 'instrument'),
    cylinderPart(0.13, 0.45, [0.72, 0.25, 0], 'steel', false, 10),
  ];
}

function circularRadius(spec: ICEWWTPEquipmentSpec): number {
  if (spec.kind === 'sludge-thickener') return 3.2;
  if (spec.tag === 'CL-101') return 3.8;
  return 4.7;
}

export function equipmentParts(
  spec: ICEWWTPEquipmentSpec,
): GeometryPart[] {
  switch (spec.kind) {
    case 'inlet':
      return inletParts();
    case 'bar-screen':
      return barScreenParts(spec.tag === 'GR-102');
    case 'pump':
      return pumpParts();
    case 'valve':
      return valveParts();
    case 'grit-basin':
      return gritBasinParts();
    case 'grit-classifier':
      return gritClassifierParts();
    case 'rectangular-clarifier':
      return rectangularClarifierParts();
    case 'distribution-well':
      return distributionWellParts();
    case 'emergency-basin':
      return emergencyBasinParts();
    case 'biological-reactor':
      return biologicalReactorParts(spec);
    case 'circular-clarifier':
      return circularClarifierParts(circularRadius(spec), false);
    case 'coagulation-basin':
      return [
        ...rectangularTankParts(8.6, 5.0, 2.0),
        boxPart(0.18, 1.8, 4.6, [-1.5, 0.9, 0], 'concreteLight'),
        boxPart(0.18, 1.8, 4.6, [1.5, 0.9, 0], 'concreteLight'),
        ...walkwayParts(8.6, 0.8, 2.1),
        ...ladderParts(4.2, 0, 0, 2.0),
      ];
    case 'filter-cell':
      return filterCellParts();
    case 'contact-basin':
      return contactBasinParts();
    case 'membrane-basin':
      return membraneBasinParts();
    case 'chemical-tank':
      return chemicalTankParts();
    case 'blower':
      return blowerParts();
    case 'analyzer':
      return analyzerParts();
    case 'sludge-thickener':
      return circularClarifierParts(circularRadius(spec), true);
    case 'sludge-dewatering':
      return sludgeDewateringParts();
    case 'sludge-dryer':
      return sludgeDryerParts();
    case 'sludge-storage':
      return sludgeStorageParts();
    case 'conveyor':
      return conveyorParts();
    case 'digester':
      return digesterParts();
    case 'flare':
      return flareParts();
    case 'uv':
      return uvParts();
  }
}

export function siteGroundParts(): GeometryPart[] {
  return [
    boxPart(318, 0.22, 196, [135, -0.11, 30], 'terrain'),
  ];
}

export function perimeterFenceParts(
  side: 'north' | 'east' | 'south' | 'west',
): GeometryPart[] {
  const [from, to] = {
    north: [[-12, -55], [284, -55]] as const,
    east: [[284, -55], [284, 123]] as const,
    south: [[284, 123], [-12, 123]] as const,
    west: [[-12, 123], [-12, -55]] as const,
  }[side];
  const parts: GeometryPart[] = [];
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  const posts = Math.ceil(length / 5) + 1;
  for (let index = 0; index < posts; index += 1) {
    const ratio = index / (posts - 1);
    parts.push(boxPart(
      0.1,
      2.3,
      0.1,
      [from[0] + dx * ratio, 1.15, from[1] + dz * ratio],
      'fence',
    ));
  }
  for (const y of [0.45, 1.4, 2.2]) {
    parts.push(pipePart(
      [from[0], y, from[1]],
      [to[0], y, to[1]],
      0.035,
      'fence',
      8,
    ));
  }
  return parts;
}

export function buildingParts(
  width: number,
  height: number,
  depth: number,
): GeometryPart[] {
  const parts: GeometryPart[] = [
    boxPart(width + 1.2, 0.22, depth + 1.2, [0, 0.11, 0], 'concreteDark'),
    boxPart(width, 0.35, depth, [0, 0.28, 0], 'concreteDark'),
    boxPart(0.28, height, depth, [-width / 2, height / 2, 0], 'concrete'),
    boxPart(0.28, height, depth, [width / 2, height / 2, 0], 'concrete'),
    boxPart(width, height, 0.28, [0, height / 2, -depth / 2], 'concrete'),
    boxPart((width - 2) / 2, height, 0.24, [-(width + 2) / 4, height / 2, depth / 2], 'concrete'),
    boxPart((width - 2) / 2, height, 0.24, [(width + 2) / 4, height / 2, depth / 2], 'concrete'),
    boxPart(width + 1.1, 0.28, depth + 1.0, [0, height + 0.12, 0], 'roof'),
    boxPart(width + 1.2, 0.3, 0.18, [0, height + 0.3, depth / 2 + 0.5], 'concreteLight'),
    boxPart(1.1, 2.15, 0.12, [0, 1.15, depth / 2 + 0.13], 'glazing'),
    boxPart(1.1, 0.14, 1.2, [0, 2.35, depth / 2 + 0.4], 'roof'),
    boxPart(1.5, 0.45, 1.3, [-width * 0.24, height + 0.52, 0], 'steelDark'),
    boxPart(0.7, 0.75, 0.7, [width * 0.25, height + 0.62, 0], 'instrument'),
  ];
  const windowCount = Math.max(2, Math.floor(width / 4));
  for (let index = 0; index < windowCount; index += 1) {
    const x = -width / 2 + 1.6 + index * ((width - 3.2) / (windowCount - 1));
    if (Math.abs(x) < 1.25) continue;
    parts.push(
      boxPart(1.25, 0.95, 0.08, [x, height * 0.65, depth / 2 + 0.13], 'glazing'),
      boxPart(1.42, 0.08, 0.15, [x, height * 0.65 - 0.52, depth / 2 + 0.16], 'steelDark'),
      boxPart(1.42, 0.08, 0.15, [x, height * 0.65 + 0.52, depth / 2 + 0.16], 'steelDark'),
    );
  }
  return parts;
}

export function utilityRackParts(): GeometryPart[] {
  const parts: GeometryPart[] = [];
  for (let x = 4; x <= 268; x += 14) {
    parts.push(
      boxPart(0.18, 4.4, 0.18, [x, 2.2, 5], 'steelDark'),
      boxPart(0.18, 4.4, 0.18, [x, 2.2, 8], 'steelDark'),
      boxPart(0.16, 0.16, 3.2, [x, 4.25, 6.5], 'steelDark'),
    );
  }
  for (const [z, material] of [
    [4.7, 'waterPipe'],
    [6.5, 'airPipe'],
    [8.3, 'sludgePipe'],
  ] as const) {
    parts.push(pipePart([0, 4.5, z], [272, 4.5, z], 0.11, material, 10));
  }
  return parts;
}
