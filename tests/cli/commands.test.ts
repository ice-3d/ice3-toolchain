import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'node-test';
import { runCli } from '../../packages/cli/src/commands.js';
import { createCompressedFixture } from '../fixtures/createCompressedFixture.js';
import { createPartitionSource } from '../partition/createPartitionSource.js';

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const writePartitionGLTF = (path: string): void => {
  const document = createPartitionSource();
  writeFileSync(path, JSON.stringify({
    ...document.json,
    buffers: [{
      byteLength: 42,
      uri: `data:application/octet-stream;base64,${
        Buffer.from(document.buffers[0]!).toString('base64')
      }`,
    }],
  }));
};

test('build writes a prepared GLB atomically', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const output = join(directory, 'prepared.glb');

  const code = await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--asset-id',
    'sample',
  ]);

  expect(code).toBe(0);
  expect(existsSync(output)).toBe(true);
  expect(readFileSync(output).subarray(0, 4).toString('ascii')).toBe('glTF');
});

test('build returns non-zero for unsupported input without leaving output', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const unsupported = join(directory, 'unsupported.gltf');
  writeFileSync(
    join(directory, 'minimal.bin'),
    readFileSync('tests/fixtures/minimal.bin'),
  );
  const document = JSON.parse(
    readFileSync('tests/fixtures/minimal.gltf', 'utf8'),
  ) as Record<string, unknown>;
  document.animations = [{}];
  writeFileSync(unsupported, JSON.stringify(document));
  const output = join(directory, 'prepared.glb');

  expect(await runCli(['build', unsupported, '--output', output])).toBe(1);
  expect(existsSync(output)).toBe(false);
});

test('inspect emits machine-readable source statistics', async () => {
  const output: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value));
  });

  const code = await runCli([
    'inspect',
    resolve('tests/fixtures/minimal.gltf'),
    '--json',
  ]);
  const report = JSON.parse(output.at(-1)!) as {
    errors: string[];
    stats: { triangleCount: number };
  };

  expect(code).toBe(0);
  expect(report.errors).toEqual([]);
  expect(report.stats.triangleCount).toBe(1);
});

test('validate accepts a generated profile', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const output = join(directory, 'prepared.glb');
  await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--asset-id',
    'sample',
  ]);

  expect(await runCli(['validate', output])).toBe(0);
});

test('inspect reports a prepared ICE3 profile', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const output = join(directory, 'prepared.glb');
  await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--asset-id',
    'sample',
  ]);
  const messages: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    messages.push(String(value));
  });

  expect(await runCli(['inspect', output, '--json'])).toBe(0);
  const report = JSON.parse(messages.at(-1)!) as {
    errors: string[];
    stats: { triangleCount: number };
  };
  expect(report.errors).toEqual([]);
  expect(report.stats.triangleCount).toBe(1);
});

test('inspect decodes an ordinary compressed source GLB', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const source = join(directory, 'compressed.glb');
  await createCompressedFixture(source);
  const messages: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    messages.push(String(value));
  });

  expect(await runCli(['inspect', source, '--json'])).toBe(0);
  const report = JSON.parse(messages.at(-1)!) as {
    errors: string[];
    stats: { triangleCount: number };
  };
  expect(report.errors).toEqual([]);
  expect(report.stats.triangleCount).toBe(1);
});

test('build accepts a no-edge preview option', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-'));
  directories.push(directory);
  const output = join(directory, 'preview.glb');

  const code = await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--asset-id',
    'sample',
    '--skip-edges',
  ]);

  expect(code).toBe(0);
  const messages: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    messages.push(String(value));
  });
  await runCli(['inspect', output, '--json']);
  const report = JSON.parse(messages.at(-1)!) as {
    stats: { edgeSegmentCount: number };
  };
  expect(report.stats.edgeSegmentCount).toBe(0);
});

test('build writes a report and rejects hard budgets before publishing GLB', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-budget-'));
  directories.push(directory);
  const output = join(directory, 'asset.glb');
  const reportPath = join(directory, 'asset.report.json');
  const code = await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    output,
    '--report',
    reportPath,
    '--budget',
    'interactive-desktop-v1',
    '--json',
  ]);
  expect(code).toBe(0);
  expect(existsSync(output)).toBe(true);
  expect(JSON.parse(readFileSync(reportPath, 'utf8')).kind)
    .toBe('ice3-asset-report');

  const rejectedOutput = join(directory, 'rejected.glb');
  const tinyHardBudgetPath = join(directory, 'tiny-budget.json');
  writeFileSync(tinyHardBudgetPath, JSON.stringify({
    id: 'tiny',
    limits: [{
      id: 'triangleCount',
      label: 'Triangles',
      softLimit: 0,
      hardLimit: 0,
    }],
  }));
  expect(await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    rejectedOutput,
    '--budget',
    tinyHardBudgetPath,
    '--json',
  ])).toBe(1);
  expect(existsSync(rejectedOutput)).toBe(false);
});

test('partition writes tileset and numbered GLBs without partial output', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');

  const code = await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'demo',
    '--max-triangles',
    '1',
  ]);

  expect(code).toBe(0);
  expect(existsSync(join(output, 'tileset.json'))).toBe(true);
  expect(readdirSync(join(output, 'parts'))).toHaveLength(4);
});

test('partition rejects an existing output directory', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  mkdirSync(output);

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'demo',
  ])).toBe(1);
  expect(readdirSync(output)).toEqual([]);
});

test('partition writes hierarchical LOD content and aggregate stats', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  const printed: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    printed.push(String(value));
  });

  const code = await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'lod-demo',
    '--max-triangles',
    '1',
    '--lod',
    '--lod-ratio',
    '0.15',
    '--json',
  ]);
  const result = JSON.parse(printed.at(-1)!) as {
    stats: {
      coarseBytes: number;
      maxCoarseBytes: number;
      preservedCoarseUnits: number;
      overBudgetCoarseNodes: number;
    };
  };

  expect(code).toBe(0);
  expect(existsSync(join(output, 'tileset.json'))).toBe(true);
  expect(readdirSync(join(output, 'coarse')).length).toBeGreaterThan(0);
  expect(result.stats.coarseBytes).toBeGreaterThan(0);
  expect(result.stats.maxCoarseBytes).toBeGreaterThan(0);
  expect(result.stats.preservedCoarseUnits).toBe(4);
  expect(result.stats.overBudgetCoarseNodes).toBe(0);
});

test('partition writes static render batches and reports their reduction', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  const printed: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    printed.push(String(value));
  });

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'batch-demo',
    '--max-triangles',
    '16',
    '--render-batch',
    'static',
    '--json',
  ])).toBe(0);

  const result = JSON.parse(printed.at(-1)!) as {
    stats: {
      renderBatchMode: string;
      renderBatchCount: number;
      renderBatchInputPrimitives: number;
      renderBatchDrawReduction: number;
    };
  };
  expect(result.stats).toMatchObject({
    renderBatchMode: 'static',
    renderBatchCount: expect.any(Number),
    renderBatchInputPrimitives: 4,
  });
  expect(result.stats.renderBatchCount)
    .toBeLessThan(result.stats.renderBatchInputPrimitives);
  expect(result.stats.renderBatchDrawReduction).toBeGreaterThan(0);
});

test.each([
  [['--lod-ratio', '0']],
  [['--lod-ratio', '1']],
  [['--lod-max-triangles', '0']],
  [['--lod-min-unit-triangles', '9', '--lod-max-triangles', '8']],
])('partition rejects invalid LOD options %j', async (lodArguments) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'demo',
    '--lod',
    ...lodArguments,
  ])).toBe(1);
  expect(existsSync(output)).toBe(false);
});

test.each([
  [['--lod-allocation', 'adaptive'], 'adaptive'],
  [['--lod-allocation', 'proportional'], 'proportional'],
])('partition accepts allocation mode %j', async (arguments_, expected) => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  const printed: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    printed.push(String(value));
  });

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'adaptive-demo',
    '--lod',
    ...arguments_,
    '--json',
  ])).toBe(0);

  const result = JSON.parse(printed.at(-1)!) as {
    stats: { allocationMode: string };
  };
  expect(result.stats.allocationMode).toBe(expected);
});

test.each([
  [['--lod-allocation', 'unknown'], /must be proportional or adaptive/],
  [['--lod-curve-samples', '3'], /must be between 4 and 32/],
  [['--lod-curve-samples', '33'], /must be between 4 and 32/],
  [['--lod-curve-samples', '4.5'], /must be a positive integer/],
])('partition rejects invalid adaptive options %j', async (
  arguments_,
  expectedError,
) => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });

  expect(await runCli([
    'partition',
    source,
    '--output',
    join(directory, 'dist'),
    '--asset-id',
    'adaptive-demo',
    '--lod',
    ...arguments_,
  ])).toBe(1);
  expect(errors.at(-1)).toMatch(expectedError);
});

test.each([
  ['auto', 'adaptive'],
  ['off', 'adaptive'],
])('partition accepts semantic proxy mode %s with adaptive lod', async (
  semanticProxy,
  allocation,
) => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const printed: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    printed.push(String(value));
  });

  expect(await runCli([
    'partition',
    source,
    '--output',
    join(directory, 'dist'),
    '--asset-id',
    'proxy-demo',
    '--lod',
    '--lod-allocation',
    allocation,
    '--semantic-proxy',
    semanticProxy,
    '--json',
  ])).toBe(0);
  const result = JSON.parse(printed.at(-1)!) as {
    stats: {
      semanticProxyAcceptedUnits: number;
      semanticProxySelectedContents: number;
    };
  };
  expect(result.stats.semanticProxyAcceptedUnits).toBe(0);
  expect(result.stats.semanticProxySelectedContents).toBe(0);
});

test.each([
  [
    ['--semantic-proxy', 'auto'],
    /--semantic-proxy requires --lod/,
  ],
  [
    [
      '--lod',
      '--lod-allocation',
      'proportional',
      '--semantic-proxy',
      'auto',
    ],
    /auto requires --lod-allocation adaptive/,
  ],
  [
    [
      '--lod',
      '--lod-allocation',
      'adaptive',
      '--semantic-proxy',
      'unknown',
    ],
    /must be auto or off/,
  ],
])('partition rejects invalid semantic proxy options %j', async (
  arguments_,
  expectedError,
) => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'proxy-demo',
    ...arguments_,
  ])).toBe(1);
  expect(errors.at(-1)).toMatch(expectedError);
  expect(existsSync(output)).toBe(false);
});
