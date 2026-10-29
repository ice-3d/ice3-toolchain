import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONFORMANCE_CASES } from './corpus.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const target = resolve(process.argv[2] ?? join(
  root,
  '..',
  'ice3-engine',
  'examples',
  'm2',
  'assets',
  'conformance',
));
const cli = join(root, 'packages', 'cli', 'src', 'main.ts');
const jtConverter = join(root, 'tests', 'fixtures', 'jt', 'fake-converter.mjs');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
const manifest = [];
for (const item of CONFORMANCE_CASES) {
  const output = join(target, `${item.id}.glb`);
  const report = join(tmpdir(), `ice3-conformance-${process.pid}-${item.id}.json`);
  const args = item.command === 'build'
    ? [
        cli,
        'build',
        join(root, item.source),
        '--output',
        output,
        '--report',
        report,
        '--asset-id',
        `conformance-${item.id}`,
        '--json',
      ]
    : [
        cli,
        'import',
        join(root, item.source),
        '--output',
        output,
        '--report',
        report,
        '--asset-id',
        `conformance-${item.id}`,
        '--adapter',
        item.adapter,
        '--json',
      ];
  const result = spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ICE3_JT_CONVERTER: jtConverter,
    },
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(
      `conformance generation failed for ${item.id}:\n${result.stderr}`,
    );
  }
  const reportDocument = JSON.parse(await readFile(report, 'utf8'));
  manifest.push({
    id: item.id,
    title: item.title,
    assetUrl: `/assets/conformance/${item.id}.glb`,
    expectedNames: item.expectedNames,
    expectedSemantics: item.expectedSemantics,
    adapter: reportDocument.adapter?.id ?? 'gltf',
    stats: reportDocument.stats,
    warnings: reportDocument.adapter?.warnings ?? [],
    ...(item.notes ? { notes: item.notes } : {}),
  });
  await rm(report, { force: true });
}
await writeFile(
  join(target, 'manifest.json'),
  `${JSON.stringify({ contractVersion: '1.0', cases: manifest }, null, 2)}\n`,
);
