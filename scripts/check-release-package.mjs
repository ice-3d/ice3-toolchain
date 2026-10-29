import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
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
