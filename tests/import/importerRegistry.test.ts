import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createImporterRegistry,
} from '../../packages/toolchain-core/src/import/createImporterRegistry.js';
import type {
  ICESourceImporter,
} from '../../packages/toolchain-core/src/import/types.js';

const importer: ICESourceImporter = {
  id: 'fake',
  extensions: ['.step', '.stp'],
  capabilities: {
    hierarchy: true,
    vertexColors: true,
    materialColors: true,
    instances: true,
    semanticMetadata: false,
  },
  import: async () => ({
    adapterId: 'fake',
    sourceFormat: 'step',
    sourceGlbPath: '/tmp/source.glb',
    warnings: [],
  }),
};

test('selects an importer by normalized extension', () => {
  expect(createImporterRegistry([importer]).resolve('/tmp/gear.STP').id)
    .toBe('fake');
});

test('rejects an unsupported format and mismatched explicit adapter', () => {
  const registry = createImporterRegistry([importer]);

  expect(() => registry.resolve('/tmp/model.ifc')).toThrow(
    'ICE3_TOOL_IMPORT_UNSUPPORTED',
  );
  expect(() => registry.resolve('/tmp/model.step', 'other')).toThrow(
    'ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE',
  );
});

test('dispatches import through the selected adapter', async () => {
  const registry = createImporterRegistry([importer]);

  const result = await registry.import({
    path: '/tmp/gear.step',
  }, {
    temporaryDirectory: '/tmp/work',
    assetId: 'gear',
  });

  expect(result.adapterId).toBe('fake');
  expect(result.sourceGlbPath).toBe('/tmp/source.glb');
});

test('rejects duplicate adapter identities and extensions', () => {
  const duplicateId = {
    ...importer,
    extensions: ['.ifc'],
  };
  const duplicateExtension = {
    ...importer,
    id: 'other',
  };

  expect(() => createImporterRegistry([importer, duplicateId])).toThrow(
    'duplicate importer id',
  );
  expect(() => createImporterRegistry([importer, duplicateExtension]))
    .toThrow('duplicate importer extension');
});
