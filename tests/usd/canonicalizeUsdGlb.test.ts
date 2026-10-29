import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  canonicalizeUsdGlb,
} from '../../packages/usd-importer/src/canonicalizeUsdGlb.js';
import {
  resolveUsdBlenderBinary,
} from '../../packages/usd-importer/src/blenderRuntime.js';
import {
  runUsdBridge,
} from '../../packages/usd-importer/src/runBridge.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('canonicalizes USD hierarchy, instances and properties', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-canonical-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const reportPath = join(root, 'bridge.json');
    const bridgeReport = await runBridge(rawGlbPath, reportPath);
    const outputPath = join(root, 'source.glb');
    const stats = await canonicalizeUsdGlb(rawGlbPath, outputPath, {
      assetId: 'synthetic-usd',
      bridgeReport,
    });

    expect(stats.instanceNodeCount).toBe(1);
    expect(stats.triangleCount).toBeGreaterThan(0);
    const source = await readSource(outputPath);
    const names = source.json.nodes?.map((node) => node.name) ?? [];
    expect(names).toEqual(expect.arrayContaining([
      'TreatmentLine',
      'PrimaryPump',
      'PumpInstanceA',
      'BufferTank',
    ]));
    const pump = source.json.nodes?.find(
      (node) => node.name === 'PrimaryPump',
    ) as UsdNodeMetadata;
    const instance = source.json.nodes?.find(
      (node) => node.name === 'PumpInstanceA',
    ) as UsdNodeMetadata;
    expect(pump.mesh).toBe(instance.mesh);
    expect(pump.extras?.ice3?.usd?.customProperties)
      .toMatchObject({ EquipmentTag: 'P-101' });
    expect(pump.extras?.ice3?.usd?.usdPrimPath)
      .toBe('/Plant/TreatmentLine/PrimaryPump');
    expect(instance.extras?.ice3?.usd?.instanceGroup).toBeDefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses one local origin for georeferenced USD', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-origin-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const reportPath = join(root, 'bridge.json');
    const bridgeReport = await runBridge(
      rawGlbPath,
      reportPath,
      'tests/fixtures/usd/large-origin.usda',
    );
    const outputPath = join(root, 'source.glb');
    await canonicalizeUsdGlb(rawGlbPath, outputPath, {
      assetId: 'large-usd',
      bridgeReport,
    });
    const source = await readSource(outputPath);
    const ice3 = source.json.asset?.extras?.ice3 as {
      usd?: {
        sourceOrigin?: number[];
      };
    };
    expect(ice3.usd?.sourceOrigin?.[0]).toBeGreaterThan(1_000_000);

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

test('omits complex and oversized USD properties deterministically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-properties-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const reportPath = join(root, 'bridge.json');
    const bridgeReport = await runBridge(rawGlbPath, reportPath);
    const pump = bridgeReport.objects.find(
      (object) => object.name === 'PrimaryPump',
    )!;
    const outputPath = join(root, 'source.glb');
    await canonicalizeUsdGlb(rawGlbPath, outputPath, {
      assetId: 'synthetic-usd',
      bridgeReport: {
        ...bridgeReport,
        objects: bridgeReport.objects.map((object) => (
          object.name === pump.name
            ? {
                ...object,
                customProperties: {
                  Safe: [1, 'value', true],
                  Nested: { unsupported: true },
                  Oversized: Array.from({ length: 257 }, () => 1),
                },
              }
            : object
        )),
      },
    });
    const source = await readSource(outputPath);
    const node = source.json.nodes?.find(
      (candidate) => candidate.name === 'PrimaryPump',
    ) as UsdNodeMetadata;
    const properties = node.extras?.ice3?.usd?.customProperties;

    expect(properties?.Safe).toEqual([1, 'value', true]);
    expect(properties).not.toHaveProperty('Nested');
    expect(properties).not.toHaveProperty('Oversized');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function runBridge(
  rawGlbPath: string,
  reportPath: string,
  source = 'tests/fixtures/usd/synthetic-plant.usda',
) {
  return runUsdBridge({
    inputPath: resolve(source),
    outputPath: rawGlbPath,
    reportPath,
  }, {
    blenderBinary: resolveUsdBlenderBinary(),
    scriptPath: resolve('packages/usd-importer/scripts/usd-to-glb.py'),
  });
}

interface UsdNodeMetadata {
  readonly mesh?: number;
  readonly extras?: {
    readonly ice3?: {
      readonly usd?: {
        readonly customProperties?: Record<string, unknown>;
        readonly instanceGroup?: string;
        readonly usdPrimPath?: string;
      };
    };
  };
}
