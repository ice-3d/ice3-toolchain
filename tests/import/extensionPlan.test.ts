import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';
import {
  createImporterRegistry,
  type ICESourceImporter,
} from '../../packages/toolchain-core/src/index.js';

const ifcImporter: ICESourceImporter = {
  id: 'ifc',
  extensions: ['.ifc'],
  capabilities: {
    hierarchy: true,
    vertexColors: false,
    materialColors: true,
    instances: true,
    semanticMetadata: true,
  },
  import: async () => ({
    adapterId: 'ifc',
    sourceFormat: 'ifc-4.3',
    sourceGlbPath: '/tmp/ifc-source.glb',
    warnings: [],
  }),
};

test('the public registry contract accepts a future format adapter', async () => {
  const registry = createImporterRegistry([ifcImporter]);
  const importer = registry.resolve('/tmp/spatial-model.IFC');
  expect(importer.id).toBe('ifc');
  expect(importer.capabilities.semanticMetadata).toBe(true);

  const result = await registry.import({
    path: '/tmp/spatial-model.ifc',
  }, {
    temporaryDirectory: '/tmp/work',
    assetId: 'spatial-model',
  });
  expect(result).toEqual({
    adapterId: 'ifc',
    sourceFormat: 'ifc-4.3',
    sourceGlbPath: '/tmp/ifc-source.glb',
    warnings: [],
  });
});

test('an unavailable optional adapter reports an installable extension point', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-import-extension-'));
  const output = join(root, 'unavailable.glb');
  const errors: string[] = [];
  mockApi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });
  try {
    const code = await runCli([
      'import',
      join(root, 'spatial-model.fbx'),
      '--output',
      output,
      '--asset-id',
      'spatial-model',
      '--adapter',
      'fbx',
    ]);

    expect(code).toBe(1);
    expect(errors.join('\n')).toContain(
      'ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE',
    );
    expect(errors.join('\n')).toContain('install');
    await expect(access(output)).rejects.toThrow();
  } finally {
    mockApi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  }
});
