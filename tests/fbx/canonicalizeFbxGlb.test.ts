import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  canonicalizeFbxGlb,
} from '../../packages/fbx-importer/src/canonicalizeFbxGlb.js';
import {
  resolveBlenderBinary,
} from '../../packages/fbx-importer/src/blenderRuntime.js';
import {
  runFbxBridge,
} from '../../packages/fbx-importer/src/runBridge.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('canonicalizes FBX hierarchy, instances and custom properties', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-canonical-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const reportPath = join(root, 'bridge.json');
    const bridgeReport = await runFbxBridge({
      inputPath: resolve('tests/fixtures/fbx/synthetic-binary.fbx'),
      outputPath: rawGlbPath,
      reportPath,
    }, {
      blenderBinary: resolveBlenderBinary(),
      scriptPath: resolve('packages/fbx-importer/scripts/fbx-to-glb.py'),
    });
    const outputPath = join(root, 'source.glb');
    const stats = await canonicalizeFbxGlb(rawGlbPath, outputPath, {
      assetId: 'synthetic-fbx',
      bridgeReport,
    });

    expect(stats.instanceNodeCount).toBe(2);
    expect(stats.triangleCount).toBeGreaterThan(0);
    const source = await readSource(outputPath);
    expect(source.json.nodes?.map((node) => node.name))
      .toEqual(expect.arrayContaining([
        'TreatmentLine',
        'Equipment',
        'Primary Pump',
        'Buffer Tank',
      ]));
    const pump = source.json.nodes?.find(
      (node) => node.name === 'Primary Pump',
    ) as {
      extras?: {
        ice3?: {
          fbx?: {
            customProperties?: Record<string, unknown>;
            instanceGroup?: string;
          };
        };
      };
    };
    expect(pump.extras?.ice3?.fbx?.customProperties)
      .toMatchObject({ EquipmentTag: 'P-101' });
    expect(pump.extras?.ice3?.fbx?.instanceGroup).toBeDefined();
    const pumpNode = source.json.nodes?.find(
      (node) => node.name === 'Primary Pump',
    );
    const instanceNode = source.json.nodes?.find(
      (node) => node.name === 'Pump Instance A',
    );
    expect(pumpNode?.mesh).toBe(instanceNode?.mesh);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('omits complex and oversized custom properties deterministically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-properties-'));
  try {
    const rawGlbPath = join(root, 'raw.glb');
    const reportPath = join(root, 'bridge.json');
    const bridgeReport = await runFbxBridge({
      inputPath: resolve('tests/fixtures/fbx/synthetic-binary.fbx'),
      outputPath: rawGlbPath,
      reportPath,
    }, {
      blenderBinary: resolveBlenderBinary(),
      scriptPath: resolve('packages/fbx-importer/scripts/fbx-to-glb.py'),
    });
    const first = bridgeReport.objects[0]!;
    const outputPath = join(root, 'source.glb');
    await canonicalizeFbxGlb(rawGlbPath, outputPath, {
      assetId: 'synthetic-fbx',
      bridgeReport: {
        ...bridgeReport,
        objects: [{
          ...first,
          customProperties: {
            Safe: [1, 'value', true],
            Nested: { unsupported: true },
            Oversized: Array.from({ length: 257 }, () => 1),
          },
        }, ...bridgeReport.objects.slice(1)],
      },
    });
    const source = await readSource(outputPath);
    const node = source.json.nodes?.find(
      (candidate) => candidate.name === first.name,
    ) as {
      extras?: {
        ice3?: {
          fbx?: {
            customProperties?: Record<string, unknown>;
          };
        };
      };
    };

    const properties = node.extras?.ice3?.fbx?.customProperties;
    expect(properties?.Safe).toEqual([1, 'value', true]);
    expect(properties).not.toHaveProperty('Nested');
    expect(properties).not.toHaveProperty('Oversized');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
