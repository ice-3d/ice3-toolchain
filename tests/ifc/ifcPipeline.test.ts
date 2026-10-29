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

test('preserves IFC metadata through partition publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-ifc-pipeline-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const tiles = join(root, 'tiles');
  expect(await runCli([
    'partition',
    'tests/fixtures/ifc/synthetic-plant.ifc',
    '--output',
    tiles,
    '--asset-id',
    'synthetic-ifc',
    '--max-triangles',
    '10',
    '--render-batch',
    'static',
  ])).toBe(0);
  const files = await readdir(join(tiles, 'parts'));
  const nodes = await Promise.all(files.map(async (file) => (
    readGlbJson(await readFile(join(tiles, 'parts', file))).nodes ?? []
  )));
  const pump = nodes.flat().find((node) => node.name === 'Primary Pump');

  expect(pump?.extras?.ice3?.ifc?.ifcType).toBe('IFCPUMP');
  expect(pump?.extras?.ice3?.equipmentTag).toBe('P-101');
});

interface NodeMetadata {
  readonly name: string;
  readonly extras?: {
    readonly ice3?: {
      readonly equipmentTag?: string;
      readonly ifc?: {
        readonly ifcType?: string;
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
