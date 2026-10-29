import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';

const original = process.env.ICE3_JT_CONVERTER;
const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  if (original === undefined) delete process.env.ICE3_JT_CONVERTER;
  else process.env.ICE3_JT_CONVERTER = original;
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('preserves JT metadata through partition and batching', async () => {
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/fake-converter.mjs',
  );
  const root = await mkdtemp(join(tmpdir(), 'ice3-jt-pipeline-'));
  directories.push(root);
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const tiles = join(root, 'tiles');
  expect(await runCli([
    'partition',
    'tests/fixtures/jt/synthetic-contract.jt',
    '--output',
    tiles,
    '--asset-id',
    'synthetic-jt',
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

  expect(pump?.extras?.ice3?.jt?.objectId).toBe('JT-PUMP-101');
  expect(pump?.extras?.ice3?.jt?.customProperties?.EquipmentTag).toBe('P-101');
});

interface NodeMetadata {
  readonly name: string;
  readonly extras?: {
    readonly ice3?: {
      readonly jt?: {
        readonly objectId?: string;
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
