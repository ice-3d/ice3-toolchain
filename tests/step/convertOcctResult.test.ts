import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import {
  convertOcctResult,
} from '../../packages/step-importer/src/convertOcctResult.js';

test('maps OCCT hierarchy, meshes and colors into ICE3 source GLB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-step-convert-'));
  try {
    const output = join(root, 'source.glb');
    const stats = await convertOcctResult({
      success: true,
      root: {
        name: 'root',
        meshes: [],
        children: [{
          name: 'Pump A',
          meshes: [0],
          children: [],
        }],
      },
      meshes: [{
        name: 'Pump A Body',
        color: [0.2, 0.4, 0.6],
        attributes: {
          position: {
            array: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          },
        },
        index: { array: [0, 1, 2] },
      }],
    }, output);

    expect(stats.triangleCount).toBe(1);
    expect(stats.nodeCount).toBeGreaterThanOrEqual(2);
    const source = await readSource(output);
    expect(source.json.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Pump A' }),
      expect.objectContaining({ name: 'Pump A Body' }),
    ]));
    expect(source.json.materials?.[0]?.pbrMetallicRoughness?.baseColorFactor)
      .toEqual([0.2, 0.4, 0.6, 1]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects successful STEP results with no triangle geometry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-step-empty-'));
  try {
    await expect(convertOcctResult({
      success: true,
      root: { name: 'empty', meshes: [], children: [] },
      meshes: [],
    }, join(root, 'empty.glb'))).rejects.toThrow(
      'ICE3_TOOL_IMPORT_EMPTY_GEOMETRY',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preserves distinct per-face colors as separate source primitives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-step-faces-'));
  try {
    const output = join(root, 'source.glb');
    await convertOcctResult({
      success: true,
      root: {
        name: 'root',
        meshes: [],
        children: [{ name: 'ColoredFacePair', meshes: [0], children: [] }],
      },
      meshes: [{
        name: 'ColoredFacePair',
        attributes: {
          position: {
            array: [
              0, 0, 0, 1, 0, 0, 0, 1, 0,
              1, 1, 0, 2, 1, 0, 1, 2, 0,
            ],
          },
        },
        index: { array: [0, 1, 2, 3, 4, 5] },
        brep_faces: [
          { first: 0, last: 0, color: [1, 0, 0] },
          { first: 1, last: 1, color: [0, 1, 0] },
        ],
      }],
    }, output);

    const source = await readSource(output);
    expect(source.json.meshes?.[0]?.primitives).toHaveLength(2);
    const colors = source.json.materials
      ?.map((material) => material.pbrMetallicRoughness?.baseColorFactor);
    expect(colors).toEqual(expect.arrayContaining([
      [1, 0, 0, 1],
      [0, 1, 0, 1],
    ]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('gives unnamed and duplicate hierarchy nodes stable names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-step-names-'));
  try {
    const output = join(root, 'source.glb');
    await convertOcctResult({
      success: true,
      root: {
        name: '',
        meshes: [],
        children: [
          { name: 'Repeated', meshes: [0], children: [] },
          { name: 'Repeated', meshes: [1], children: [] },
          { name: '', meshes: [2], children: [] },
        ],
      },
      meshes: [
        triangle('Repeated Mesh'),
        triangle('Repeated Mesh'),
        triangle(''),
      ],
    }, output);

    const source = await readSource(output);
    const names = source.json.nodes?.map((node) => node.name);
    expect(names).toEqual(expect.arrayContaining([
      'step/node/0',
      'Repeated',
      'Repeated[1]',
      'step/node/3',
      'Repeated Mesh',
      'Repeated Mesh[1]',
      'step/node/6',
    ]));
    expect(new Set(names).size).toBe(names?.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function triangle(name: string) {
  return {
    name,
    attributes: {
      position: {
        array: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      },
    },
    index: { array: [0, 1, 2] },
  };
}
