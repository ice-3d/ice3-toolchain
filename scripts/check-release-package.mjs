import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageRoot = join(root, 'release', 'toolchain');
const artifacts = join(root, 'release', 'artifacts');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result;
}

function assertSuccess(result, label) {
  if (result.status !== 0) {
    throw new Error(
      `${label} failed:\n${result.stdout}${result.stderr}`,
    );
  }
}

await mkdir(artifacts, { recursive: true });
const packedResult = run(
  'npm',
  ['pack', packageRoot, '--json', '--pack-destination', artifacts],
  root,
);
assertSuccess(packedResult, 'npm pack');
const packed = JSON.parse(packedResult.stdout);
const tarball = join(artifacts, packed[0].filename);
const consumer = await mkdtemp(join(tmpdir(), 'ice3-toolchain-consumer-'));
try {
  await writeFile(
    join(consumer, 'package.json'),
    '{"private":true,"type":"module"}\n',
  );
  assertSuccess(run(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
    consumer,
  ), 'npm install');
  assertSuccess(run(process.execPath, [
    '--input-type=module',
    '--eval',
    "import { runCli } from '@ice3/toolchain'; if (typeof runCli !== 'function') process.exit(1);",
  ], consumer), 'package import');
  const cli = run(
    join(consumer, 'node_modules', '.bin', 'ice3-tool'),
    [],
    consumer,
  );
  if (
    cli.status !== 1
    || !`${cli.stdout}${cli.stderr}`.includes('ICE3_TOOL_INVALID_COMMAND')
  ) {
    throw new Error('ICE3_RELEASE_CLI_INVALID');
  }
  const publishedSource = await readFile(
    join(consumer, 'node_modules', '@ice3', 'toolchain', 'dist', 'main.js'),
    'utf8',
  );
  if (publishedSource.includes('@ice3/toolchain-core')) {
    throw new Error('ICE3_RELEASE_PRIVATE_IMPORT');
  }
  if (
    !publishedSource.includes('ICE3_TOOL_STEP_IMPORT_FAILED')
    || !publishedSource.includes('step-ap242')
    || !publishedSource.includes('occt-import-js')
  ) {
    throw new Error('ICE3_RELEASE_STEP_ADAPTER_MISSING');
  }
  const fixture = join(root, 'tests', 'fixtures', 'step', 'synthetic-skid.step');
  const importedOutput = join(consumer, 'synthetic-skid.glb');
  const importedReport = join(consumer, 'synthetic-skid.report.json');
  assertSuccess(run(
    join(consumer, 'node_modules', '.bin', 'ice3-tool'),
    [
      'import',
      fixture,
      '--output',
      importedOutput,
      '--report',
      importedReport,
      '--asset-id',
      'synthetic-skid',
      '--json',
    ],
    consumer,
  ), 'published STEP import');
  const importedBytes = await readFile(importedOutput);
  if (importedBytes.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error('ICE3_RELEASE_STEP_OUTPUT_INVALID');
  }
  const adapterReport = JSON.parse(await readFile(importedReport, 'utf8'));
  if (adapterReport.adapter?.id !== 'step') {
    throw new Error('ICE3_RELEASE_STEP_REPORT_INVALID');
  }
  assertSuccess(run(
    join(consumer, 'node_modules', '.bin', 'ice3-tool'),
    ['validate', importedOutput, '--json'],
    consumer,
  ), 'published STEP output validation');
  const ifcFixture = join(
    root,
    'tests',
    'fixtures',
    'ifc',
    'synthetic-plant.ifc',
  );
  const ifcOutput = join(consumer, 'synthetic-plant.glb');
  const ifcReport = join(consumer, 'synthetic-plant.report.json');
  assertSuccess(run(
    join(consumer, 'node_modules', '.bin', 'ice3-tool'),
    [
      'import',
      ifcFixture,
      '--output',
      ifcOutput,
      '--report',
      ifcReport,
      '--asset-id',
      'synthetic-plant',
      '--json',
    ],
    consumer,
  ), 'published IFC import');
  const ifcReportDocument = JSON.parse(await readFile(ifcReport, 'utf8'));
  if (ifcReportDocument.adapter?.id !== 'ifc') {
    throw new Error('ICE3_RELEASE_IFC_REPORT_INVALID');
  }
  assertSuccess(run(
    join(consumer, 'node_modules', '.bin', 'ice3-tool'),
    ['validate', ifcOutput, '--json'],
    consumer,
  ), 'published IFC output validation');
  const ifcWasmRuntime = await stat(join(
    consumer,
    'node_modules',
    'web-ifc',
    'web-ifc-node.wasm',
  ));
  if (ifcWasmRuntime.size === 0) {
    throw new Error('ICE3_RELEASE_IFC_WASM_MISSING');
  }
  const fbxFixture = join(
    root,
    'tests',
    'fixtures',
    'fbx',
    'synthetic-binary.fbx',
  );
  const fbxOutput = join(consumer, 'synthetic-fbx.glb');
  const fbxReport = join(consumer, 'synthetic-fbx.report.json');
  assertSuccess(run(
    join(consumer, 'node_modules', '.bin', 'ice3-tool'),
    [
      'import',
      fbxFixture,
      '--output',
      fbxOutput,
      '--report',
      fbxReport,
      '--asset-id',
      'synthetic-fbx',
      '--json',
    ],
    consumer,
  ), 'published FBX import');
  const fbxReportDocument = JSON.parse(await readFile(fbxReport, 'utf8'));
  if (fbxReportDocument.adapter?.id !== 'fbx') {
    throw new Error('ICE3_RELEASE_FBX_REPORT_INVALID');
  }
  assertSuccess(run(
    join(consumer, 'node_modules', '.bin', 'ice3-tool'),
    ['validate', fbxOutput, '--json'],
    consumer,
  ), 'published FBX output validation');
  const assimpWasmRuntime = await stat(join(
    consumer,
    'node_modules',
    'assimpjs',
    'dist',
    'assimpjs.wasm',
  ));
  if (assimpWasmRuntime.size === 0) {
    throw new Error('ICE3_RELEASE_FBX_WASM_MISSING');
  }
  await stat(join(
    consumer,
    'node_modules',
    '@ice3',
    'toolchain',
    'dist',
    'fbx',
    'fbx-to-glb.py',
  ));
  const wasmRuntime = await stat(join(
    consumer,
    'node_modules',
    'occt-import-js',
    'dist',
    'occt-import-js.wasm',
  ));
  if (wasmRuntime.size === 0) {
    throw new Error('ICE3_RELEASE_STEP_WASM_MISSING');
  }
  const notices = await readFile(
    join(consumer, 'node_modules', '@ice3', 'toolchain', 'THIRD_PARTY_NOTICES.md'),
    'utf8',
  );
  if (
    !notices.includes('occt-import-js')
    || !notices.includes('LGPL-2.1')
    || !notices.includes('occt-import-js.wasm')
    || !notices.includes('web-ifc')
    || !notices.includes('MPL-2.0')
    || !notices.includes('web-ifc-node.wasm')
  ) {
    throw new Error('ICE3_RELEASE_SOURCE_NOTICE_INVALID');
  }
  await writeFile(
    join(consumer, 'index.ts'),
    "import { runCli } from '@ice3/toolchain';\nconst cli: typeof runCli = runCli;\nvoid cli;\n",
  );
  await writeFile(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
      },
      include: ['index.ts'],
    }, null, 2)}\n`,
  );
  assertSuccess(run(
    join(root, 'node_modules', '.bin', 'tsc'),
    ['--project', 'tsconfig.json'],
    consumer,
  ), 'TypeScript declaration check');
  console.info(`ICE3_RELEASE_OK: ${packed[0].filename}`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}
