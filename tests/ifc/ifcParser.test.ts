import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createIfcApi,
  openIfcDocument,
} from '../../packages/ifc-importer/src/ifcApi.js';
import {
  createIfcImporter,
} from '../../packages/ifc-importer/src/index.js';

test('opens the synthetic IFC4X3 fixture', async () => {
  const constructor = createIfcImporter();
  expect(constructor.id).toBe('ifc');
  expect(constructor.extensions).toEqual(['.ifc']);
  expect(constructor.capabilities).toEqual({
    hierarchy: true,
    vertexColors: false,
    materialColors: true,
    instances: false,
    semanticMetadata: true,
  });

  const api = await createIfcApi();
  const document = await openIfcDocument(
    api,
    'tests/fixtures/ifc/synthetic-plant.ifc',
  );
  try {
    expect(document.schema).toMatch(/^IFC4X3/);
    expect(document.api.GetMaxExpressID(document.modelID)).toBeGreaterThan(0);
  } finally {
    document.api.CloseModel(document.modelID);
    document.api.Dispose();
  }
});

test('rejects a length unit that cannot be normalized to meters', async () => {
  const api = await createIfcApi();
  try {
    await expect(openIfcDocument(
      api,
      'tests/fixtures/ifc/unsupported-unit.ifc',
    )).rejects.toThrow('ICE3_TOOL_IFC_UNIT_UNSUPPORTED');
  } finally {
    api.Dispose();
  }
});
