import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  canonicalizeJtGlb,
} from '../../packages/jt-importer/src/canonicalizeJtGlb.js';
import {
  runJtConverter,
} from '../../packages/jt-importer/src/runConverter.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('preserves JT hierarchy, instances, materials and metadata', async () => {
  const root = await temporaryDirectory();
  try {
    const raw = join(root, 'raw.glb');
    const output = join(root, 'source.glb');
    await convert('tests/fixtures/jt/synthetic-contract.jt', raw);
    const stats = await canonicalizeJtGlb(raw, output, {
      assetId: 'synthetic-jt',
    });
    expect(stats.instanceNodeCount).toBe(1);
    const source = await readSource(output);
    const names = source.json.nodes?.map((node) => node.name) ?? [];
    expect(names).toEqual(expect.arrayContaining([
      'TreatmentLine',
      'PrimaryPump',
      'PumpInstanceA',
      'BufferTank',
    ]));
    const pump = source.json.nodes?.find(
      (node) => node.name === 'PrimaryPump',
    ) as JtNodeMetadata;
    const instance = source.json.nodes?.find(
      (node) => node.name === 'PumpInstanceA',
    ) as JtNodeMetadata;
    expect(pump.mesh).toBe(instance.mesh);
    expect(pump.extras?.ice3?.jt).toMatchObject({
      objectId: 'JT-PUMP-101',
      assemblyPath: '/Plant/TreatmentLine/PrimaryPump',
      customProperties: { EquipmentTag: 'P-101' },
    });
    expect(instance.extras?.ice3?.jt?.instanceGroup).toBeDefined();
    const pumpMaterial = source.json.materials?.find(
      (material) => material.name === 'PumpBlue',
    ) as MaterialMetadata;
    expect(pumpMaterial.pbrMetallicRoughness?.baseColorFactor)
      ?.toEqual(expect.arrayContaining([
        expect.closeTo(0.12, 5),
        expect.closeTo(0.38, 5),
        expect.closeTo(0.68, 5),
      ]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rebases georeferenced JT through one shared root origin', async () => {
  const root = await temporaryDirectory();
  try {
    const raw = join(root, 'raw.glb');
    const output = join(root, 'source.glb');
    await convert('tests/fixtures/jt/large-origin.jt', raw);
    await canonicalizeJtGlb(raw, output, { assetId: 'large-jt' });
    const source = await readSource(output);
    const ice3 = source.json.asset?.extras?.ice3 as {
      jt?: { sourceOrigin?: number[] };
    };
    expect(ice3.jt?.sourceOrigin?.[0]).toBeGreaterThan(1_000_000);
    const rootNode = source.json.nodes?.find(
      (node) => node.name === 'TreatmentLine',
    );
    expect(Math.abs(rootNode?.translation?.[0] ?? Infinity)).toBeLessThan(20);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function convert(fixture: string, outputPath: string): Promise<void> {
  await runJtConverter({
    inputPath: resolve(fixture),
    outputPath,
  }, {
    converterBinary: resolve('tests/fixtures/jt/fake-converter.mjs'),
  });
}

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ice3-jt-canonical-'));
}

interface JtNodeMetadata {
  readonly mesh?: number;
  readonly translation?: number[];
  readonly extras?: {
    readonly ice3?: {
      readonly jt?: {
        readonly objectId?: string;
        readonly assemblyPath?: string;
        readonly instanceGroup?: string;
        readonly customProperties?: Record<string, unknown>;
      };
    };
  };
}

interface MaterialMetadata {
  readonly pbrMetallicRoughness?: {
    readonly baseColorFactor?: number[];
  };
}
