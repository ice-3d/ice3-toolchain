import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  canonicalizeObjGlb,
} from '../../packages/obj-importer/src/canonicalizeObjGlb.js';
import {
  convertObjToGlb,
} from '../../packages/obj-importer/src/convertObjToGlb.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('preserves OBJ names, materials and display colors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-canonical-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const outputPath = join(root, 'source.glb');
    const converted = await convertObjToGlb(
      resolve('tests/fixtures/obj/synthetic-plant.obj'),
      rawGlbPath,
    );
    const stats = await canonicalizeObjGlb(rawGlbPath, outputPath, {
      assetId: 'synthetic-obj',
      warnings: converted.warnings,
    });
    const source = await readSource(outputPath);
    const names = source.json.nodes?.map((node) => node.name) ?? [];
    expect(names).toEqual(expect.arrayContaining([
      'PrimaryPump',
      'BufferTank',
    ]));
    expect(stats.triangleCount).toBe(24);
    expect(stats.warnings).toContain(
      'ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS',
    );
    const materials = source.json.materials ?? [];
    const pumpMaterial = materials.find(
      (material) => material.name === 'PumpBlue',
    ) as {
      pbrMetallicRoughness?: {
        baseColorFactor?: number[];
        metallicFactor?: number;
        roughnessFactor?: number;
      };
    };
    expect(pumpMaterial.pbrMetallicRoughness?.baseColorFactor)
      ?.toEqual(expect.arrayContaining([
        expect.closeTo(0.12, 5),
        expect.closeTo(0.38, 5),
        expect.closeTo(0.68, 5),
      ]));
    expect(pumpMaterial.pbrMetallicRoughness?.metallicFactor).toBe(0);
    expect(pumpMaterial.pbrMetallicRoughness?.roughnessFactor ?? 1).toBe(1);
    const pump = source.json.nodes?.find(
      (node) => node.name === 'PrimaryPump',
    ) as ObjNodeMetadata;
    expect(pump.extras?.ice3?.obj).toMatchObject({
      objectType: 'MESH',
      sourceName: 'PrimaryPump',
      materialNames: ['PumpBlue'],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses one local origin for georeferenced OBJ', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-origin-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const outputPath = join(root, 'source.glb');
    const converted = await convertObjToGlb(
      resolve('tests/fixtures/obj/large-origin.obj'),
      rawGlbPath,
    );
    await canonicalizeObjGlb(rawGlbPath, outputPath, {
      assetId: 'large-obj',
      warnings: converted.warnings,
    });
    const source = await readSource(outputPath);
    const ice3 = source.json.asset?.extras?.ice3 as {
      obj?: {
        sourceOrigin?: number[];
      };
    };
    expect(ice3.obj?.sourceOrigin?.[0]).toBeGreaterThan(1_000_000);

    const positions: number[] = [];
    for (const mesh of source.json.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        const accessor = source.json.accessors?.[
          primitive.attributes?.POSITION ?? -1
        ];
        if (accessor?.min && accessor.max) {
          positions.push(...accessor.min, ...accessor.max);
        }
      }
    }
    expect(positions.length).toBeGreaterThan(0);
    expect(Math.max(...positions.map(Math.abs))).toBeLessThan(20);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects OBJ without triangle Geometry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-empty-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const outputPath = join(root, 'source.glb');
    const converted = await convertObjToGlb(
      resolve('tests/fixtures/obj/empty.obj'),
      rawGlbPath,
    );
    await expect(canonicalizeObjGlb(rawGlbPath, outputPath, {
      assetId: 'empty-obj',
      warnings: converted.warnings,
    })).rejects.toThrow('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

interface ObjNodeMetadata {
  readonly extras?: {
    readonly ice3?: {
      readonly obj?: {
        readonly objectType?: string;
        readonly sourceName?: string;
        readonly materialNames?: readonly string[];
      };
    };
  };
}
