import type { ICESourceDocument } from '../source/readSource.js';
import type { ICEBounds } from '../partition/types.js';
import {
  bakeLocalMatrix,
  type ICEMatrix4Tuple,
} from './bakeMatrix.js';

type JSONRecord = Record<string, unknown>;

export function multiplyMatrices(
  parent: ICEMatrix4Tuple,
  local: ICEMatrix4Tuple,
): ICEMatrix4Tuple {
  const output = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        const offset = column * 4 + row;
        output[offset] = (output[offset] ?? 0)
          + parent[index * 4 + row]! * local[column * 4 + index]!;
      }
    }
  }
  return output as unknown as ICEMatrix4Tuple;
}

export function collectNodeWorldMatrices(
  source: ICESourceDocument,
): readonly ICEMatrix4Tuple[] {
  const nodes = records(source.json.nodes);
  const matrices = new Array<ICEMatrix4Tuple>(nodes.length);
  const parent = new Array<number>(nodes.length).fill(-1);
  for (const [index, node] of nodes.entries()) {
    for (const child of integers(node.children)) {
      parent[child] = index;
    }
  }
  const visit = (index: number, inherited: ICEMatrix4Tuple): void => {
    const node = nodes[index]!;
    const local = bakeLocalMatrix(
      numbers(node.matrix, 16),
      numbers(node.translation, 3),
      numbers(node.rotation, 4),
      numbers(node.scale, 3),
    );
    const world = multiplyMatrices(inherited, local);
    matrices[index] = world;
    for (const child of integers(node.children)) {
      visit(child, world);
    }
  };
  for (let index = 0; index < nodes.length; index += 1) {
    if (parent[index]! < 0) {
      visit(index, identity());
    }
  }
  return matrices;
}

export function transformBounds(
  bounds: ICEBounds,
  matrix: ICEMatrix4Tuple,
): ICEBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const point = transformPoint(matrix, x, y, z);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis]!, point[axis]!);
          max[axis] = Math.max(max[axis]!, point[axis]!);
        }
      }
    }
  }
  return { min, max };
}

function transformPoint(
  matrix: ICEMatrix4Tuple,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function identity(): ICEMatrix4Tuple {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function records(value: unknown): JSONRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JSONRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
    : [];
}

function integers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => Number.isInteger(entry))
    : [];
}

function numbers(
  value: unknown,
  length: number,
): number[] | undefined {
  return Array.isArray(value)
    && value.length === length
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    ? value as number[]
    : undefined;
}
