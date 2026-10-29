import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';

const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('preserves FBX metadata through partition and batching', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-pipeline-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const tiles = join(root, 'tiles');
  expect(await runCli([
    'partition',
    'tests/fixtures/fbx/synthetic-binary.fbx',
    '--output',
    tiles,
    '--asset-id',
    'synthetic-fbx',
    '--max-triangles',
    '1',
    '--render-batch',
    'static',
  ])).toBe(0);
  const files = await readdir(join(tiles, 'parts'));
  const nodes = await Promise.all(files.map(async (file) => (
    readGlbJson(await readFile(join(tiles, 'parts', file))).nodes ?? []
  )));
  const pump = nodes.flat().find((node) => node.name === 'Primary Pump');

  expect(pump?.extras?.ice3?.ifc).toBeUndefined();
  expect(pump?.extras?.ice3?.fbx?.customProperties?.EquipmentTag)
    .toBe('P-101');
  expect(pump?.extras?.ice3?.fbx?.instanceGroup).toBeDefined();
});

interface NodeMetadata {
  readonly name: string;
  readonly extras?: {
    readonly ice3?: {
      readonly ifc?: unknown;
      readonly fbx?: {
        readonly instanceGroup?: string;
        readonly customProperties?: Record<string, unknown>;
      };
    };
  };
}

function readGlbJson(bytes: Buffer): {
  readonly nodes?: readonly NodeMetadata[];
} {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').trim(),
  ) as { readonly nodes?: readonly NodeMetadata[] };
}
