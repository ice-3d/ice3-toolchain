import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  buildIfcSourceGlb,
} from '../../packages/ifc-importer/src/buildIfcSourceGlb.js';
import {
  createIfcApi,
  openIfcDocument,
} from '../../packages/ifc-importer/src/ifcApi.js';
import {
  readIfcMetadata,
} from '../../packages/ifc-importer/src/readIfcMetadata.js';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('converts IFC geometry and hierarchy to a y-up meter source GLB', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-ifc-source-'));
  const api = await createIfcApi();
  const document = await openIfcDocument(
    api,
    'tests/fixtures/ifc/synthetic-plant.ifc',
  );
  try {
    const metadata = await readIfcMetadata(document, 'synthetic-ifc');
    const outputPath = join(root, 'source.glb');
    const stats = await buildIfcSourceGlb(document, metadata, outputPath);

    expect(stats.outputPath).toBe(outputPath);
    expect(stats.triangleCount).toBeGreaterThan(0);
    expect(stats.productCount).toBe(2);
    const source = await readSource(outputPath);
    expect(source.json.nodes?.map((node) => node.name))
      .toEqual(expect.arrayContaining([
        'Synthetic IFC Plant',
        'Primary Pump',
        'Buffer Tank',
      ]));
    expect(source.json.materials?.length).toBeGreaterThanOrEqual(2);
    const ice3 = source.json.asset?.extras?.ice3 as {
      coordinateSystem?: Record<string, string>;
      ifc?: {
        sourceOrigin?: number[];
      };
    };
    expect(ice3.coordinateSystem).toMatchObject({
      handedness: 'right',
      upAxis: 'y',
      linearUnit: 'meter',
    });
    expect(ice3.ifc?.sourceOrigin?.every(Number.isFinite)).toBe(true);
    expect(source.json.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Primary Pump',
        extras: {
          ice3: expect.objectContaining({
            equipmentTag: 'P-101',
            ifc: expect.objectContaining({
              ifcType: 'IFCPUMP',
              propertySets: expect.arrayContaining([
                expect.objectContaining({ name: 'Pset_PumpTypeCommon' }),
              ]),
            }),
          }),
        },
      }),
    ]));
  } finally {
    document.api.CloseModel(document.modelID);
    document.api.Dispose();
    await rm(root, { recursive: true, force: true });
  }
});
