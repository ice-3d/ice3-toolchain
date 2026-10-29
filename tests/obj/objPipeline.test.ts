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

test('preserves OBJ metadata through partition and batching', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-obj-pipeline-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const tiles = join(root, 'tiles');
  expect(await runCli([
    'partition',
    'tests/fixtures/obj/synthetic-plant.obj',
    '--output',
    tiles,
    '--asset-id',
    'synthetic-obj',
    '--max-triangles',
    '1',
    '--render-batch',
    'static',
  ])).toBe(0);
  const files = await readdir(join(tiles, 'parts'));
  const nodes = await Promise.all(files.map(async (file) => (
    readGlbJson(await readFile(join(tiles, 'parts', file))).nodes ?? []
  )));
  const pump = nodes.flat().find((node) => node.name === 'PrimaryPump');

  expect(pump?.extras?.ice3?.obj?.sourceName).toBe('PrimaryPump');
  expect(pump?.extras?.ice3?.obj?.materialNames).toContain('PumpBlue');
});

interface NodeMetadata {
  readonly name: string;
  readonly extras?: {
    readonly ice3?: {
      readonly obj?: {
        readonly sourceName?: string;
        readonly materialNames?: readonly string[];
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
