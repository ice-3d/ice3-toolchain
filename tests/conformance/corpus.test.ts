import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';
import {
  validatePreparedGLB,
} from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { CONFORMANCE_CASES } from '../../tools/conformance/corpus.js';

const originalConverter = process.env.ICE3_JT_CONVERTER;

test('seven source format families produce valid deterministic Prepared GLB', async () => {
  process.env.ICE3_JT_CONVERTER = resolve(
    'tests/fixtures/jt/fake-converter.mjs',
  );
  mockApi.spyOn(console, 'log').mockImplementation(() => {});
  const root = await mkdtemp(join(tmpdir(), 'ice3-conformance-'));
  try {
    expect(CONFORMANCE_CASES).toHaveLength(7);
    for (const item of CONFORMANCE_CASES) {
      const first = join(root, `${item.id}-1.glb`);
      const second = join(root, `${item.id}-2.glb`);
      await runCase(item, first);
      await runCase(item, second);
      const bytes = await readFile(first);
      expect((await stat(first)).size).toBeGreaterThan(20);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
      expect(validatePreparedGLB(bytes).errors).toEqual([]);
      expect(await readFile(second)).toEqual(bytes);
      const json = readGlbJson(bytes);
      const names = json.nodes?.map((node) => node.name) ?? [];
      expect(names).toEqual(expect.arrayContaining(item.expectedNames));
      expect(json.meshes?.length ?? 0).toBeGreaterThan(0);
      expect(json.materials?.length ?? 0).toBeGreaterThan(0);
    }
  } finally {
    mockApi.restoreAllMocks();
    if (originalConverter === undefined) delete process.env.ICE3_JT_CONVERTER;
    else process.env.ICE3_JT_CONVERTER = originalConverter;
    await rm(root, { recursive: true, force: true });
  }
});

async function runCase(
  item: (typeof CONFORMANCE_CASES)[number],
  output: string,
): Promise<void> {
  const args = item.command === 'build'
    ? [
        'build',
        item.source,
        '--output',
        output,
        '--asset-id',
        `conformance-${item.id}`,
        '--json',
      ]
    : [
        'import',
        item.source,
        '--output',
        output,
        '--asset-id',
        `conformance-${item.id}`,
        '--adapter',
        item.adapter!,
        '--json',
      ];
  expect(await runCli(args)).toBe(0);
}

function readGlbJson(bytes: Buffer): {
  readonly nodes?: readonly { readonly name?: string }[];
  readonly meshes?: readonly unknown[];
  readonly materials?: readonly unknown[];
} {
  const length = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes.subarray(20, 20 + length).toString('utf8').trim(),
  );
}
