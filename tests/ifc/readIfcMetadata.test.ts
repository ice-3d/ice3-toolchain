import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createIfcApi,
  openIfcDocument,
} from '../../packages/ifc-importer/src/ifcApi.js';
import {
  readIfcMetadata,
} from '../../packages/ifc-importer/src/readIfcMetadata.js';

test('reads spatial hierarchy, product properties and systems', async () => {
  const api = await createIfcApi();
  const document = await openIfcDocument(
    api,
    'tests/fixtures/ifc/synthetic-plant.ifc',
  );
  try {
    const metadata = await readIfcMetadata(document, 'synthetic-ifc');

    expect(metadata.nodes.map((node) => node.ifcType)).toEqual(
      expect.arrayContaining([
        'IFCPROJECT',
        'IFCSITE',
        'IFCBUILDING',
        'IFCBUILDINGSTOREY',
      ]),
    );
    expect(metadata.products).toHaveLength(2);
    expect(metadata.products.map((product) => product.name)).toEqual(
      expect.arrayContaining(['Primary Pump', 'Buffer Tank']),
    );
    const pump = metadata.products.find(
      (product) => product.name === 'Primary Pump',
    )!;
    expect(pump.propertySets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Pset_PumpTypeCommon',
        properties: expect.objectContaining({
          FlowRate: 12.5,
        }),
      }),
      expect.objectContaining({
        name: 'Qto_PumpBaseQuantities',
        properties: expect.objectContaining({
          GrossWeight: 480,
        }),
      }),
    ]));
    expect(pump.systems).toEqual([
      expect.objectContaining({
        name: 'Sludge Transfer',
        ifcType: 'IFCDISTRIBUTIONSYSTEM',
      }),
    ]);
    expect(pump.selectionId).toMatch(/^synthetic-ifc\/ifc\//u);
  } finally {
    document.api.CloseModel(document.modelID);
    document.api.Dispose();
  }
});
