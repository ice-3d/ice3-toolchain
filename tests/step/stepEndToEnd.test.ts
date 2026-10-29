import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';
import {
  validatePreparedGLB,
} from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';

const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('imports synthetic STEP geometry into an inspectable Prepared GLB', async () => {
  const root = await temporaryDirectory();
  const output = join(root, 'synthetic-skid.glb');

  expect(await importSilently([
    'tests/fixtures/step/synthetic-skid.step',
    output,
    'synthetic-skid',
    'step',
  ])).toBe(0);

  const bytes = await readFile(output);
  expect(validatePreparedGLB(bytes).errors).toEqual([]);
  const json = readGlbJson(bytes);
  expect(json.nodes.map((node) => node.name)).toEqual(expect.arrayContaining([
    'PrimaryTank',
    'TransferPump',
  ]));
  expect(json.asset.extras.ice3.coordinateSystem).toEqual({
    handedness: 'right',
    upAxis: 'y',
    linearUnit: 'meter',
  });
  expect(json.asset.extras.ice3.bounds.min.every(Number.isFinite)).toBe(true);
  expect(json.asset.extras.ice3.bounds.max.every(Number.isFinite)).toBe(true);
  expect(json.asset.extras.ice3.bounds.max[0]).toBeCloseTo(2.01, 1);
  expect(json.asset.extras.ice3.bounds.max[1]).toBeCloseTo(0.9, 1);
  expect(json.asset.extras.ice3.stats.triangleCount).toBeGreaterThan(0);
  expect(json.asset.extras.ice3.stats.selectionGroupCount).toBe(2);

  const materialColors = json.materials
    .map((material) => material.pbrMetallicRoughness?.baseColorFactor)
    .filter((color): color is number[] => Array.isArray(color));
  expect(materialColors.some((color) => (
    Math.abs(color[0]! - 0.16) < 0.02
    && Math.abs(color[1]! - 0.48) < 0.02
    && Math.abs(color[2]! - 0.72) < 0.02
  ))).toBe(true);
  expect(materialColors.some((color) => (
    Math.abs(color[0]! - 0.92) < 0.02
    && Math.abs(color[1]! - 0.56) < 0.02
    && Math.abs(color[2]! - 0.12) < 0.02
  ))).toBe(true);
});

test('reports stable failures and never publishes rejected STEP imports', async () => {
  const root = await temporaryDirectory();
  const emptyOutput = join(root, 'empty.glb');
  const emptyError = await importError([
    'tests/fixtures/step/empty-assembly.step',
    emptyOutput,
    'empty',
    'step',
  ]);
  expect(emptyError).toContain('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
  await expect(access(emptyOutput)).rejects.toThrow();

  const truncatedOutput = join(root, 'truncated.glb');
  const truncatedError = await importError([
    'tests/fixtures/step/truncated.step',
    truncatedOutput,
    'truncated',
    'step',
  ]);
  expect(truncatedError).toContain('ICE3_TOOL_STEP_IMPORT_FAILED');
  await expect(access(truncatedOutput)).rejects.toThrow();

  const mismatchOutput = join(root, 'mismatch.glb');
  const mismatchError = await importError([
    'tests/fixtures/minimal.glb',
    mismatchOutput,
    'mismatch',
    'step',
  ]);
  expect(mismatchError).toContain('ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE');
  await expect(access(mismatchOutput)).rejects.toThrow();
});

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ice3-step-e2e-'));
  directories.push(root);
  return root;
}

async function importSilently(args: readonly [
  source: string,
  output: string,
  assetId: string,
  adapter: string,
]): Promise<number> {
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  return runCli([
    'import',
    args[0],
    '--output',
    args[1],
    '--asset-id',
    args[2],
    '--adapter',
    args[3],
    '--json',
  ]);
}

async function importError(args: readonly [
  source: string,
  output: string,
  assetId: string,
  adapter: string,
]): Promise<string> {
  const errors: string[] = [];
  mockApi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });
  const code = await runCli([
    'import',
    args[0],
    '--output',
    args[1],
    '--asset-id',
    args[2],
    '--adapter',
    args[3],
    '--json',
  ]);
  expect(code).toBe(1);
  mockApi.restoreAllMocks();
  return errors.join('\n');
}

interface GlbNode {
  readonly name: string;
  readonly extras?: {
    readonly ice3?: {
      readonly id?: string;
    };
  };
}

interface GlbJson {
  readonly asset: {
    readonly extras: {
      readonly ice3: {
        readonly coordinateSystem: Record<string, string>;
        readonly bounds: {
          readonly min: number[];
          readonly max: number[];
        };
        readonly stats: {
          readonly triangleCount: number;
          readonly selectionGroupCount: number;
        };
      };
    };
  };
  readonly nodes: readonly GlbNode[];
  readonly materials: ReadonlyArray<{
    readonly pbrMetallicRoughness?: {
      readonly baseColorFactor?: number[];
    };
  }>;
}

function readGlbJson(bytes: Uint8Array): GlbJson {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').trim(),
  ) as GlbJson;
}
