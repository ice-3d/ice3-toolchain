import { spawn } from 'node:child_process';
import {
  mkdir,
  rm,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replaceAssetDirectory } from './replace-asset-directory.ts';

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const toolchainRoot = resolve(toolDirectory, '..', '..');
const engineRoot = resolve(
  process.env.ICE3_ENGINE_ROOT
    ?? join(toolchainRoot, '..', 'ice3-engine'),
);
const assetRoot = join(
  engineRoot,
  'examples',
  'm1',
  'assets',
  'wastewater-plant',
);
const staging = join(
  dirname(assetRoot),
  `.wastewater-plant.staging-${process.pid}`,
);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: toolchainRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(
          `ICE3_WWTP_ARTIFACT_INVALID: command failed: ${command}${
            signal ? ` (${signal})` : ''
          }`,
        ));
      }
    });
  });
}

async function main() {
  if (assetRoot.split('/').at(-1) !== 'wastewater-plant') {
    throw new Error('ICE3_WWTP_ARTIFACT_INVALID: unsafe asset root');
  }
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  const source = join(staging, 'source', 'wastewater-plant.glb');
  const prepared = join(staging, 'prepared', 'wastewater-plant.glb');
  const report = join(staging, 'prepared', 'wastewater-plant.report.json');
  await mkdir(dirname(prepared), { recursive: true });
  try {
    await run(process.execPath, [
      '--import',
      'tsx',
      join(toolDirectory, 'build-blender-source.ts'),
      '--output',
      source,
    ]);
    const cli = join(toolchainRoot, 'packages', 'cli', 'dist', 'main.js');
    const results = await Promise.allSettled([
      (async () => {
        await run(process.execPath, [
          cli,
          'build',
          source,
          '--output',
          prepared,
          '--report',
          report,
          '--budget',
          'unrestricted',
          '--asset-id',
          'ice3-virtual-wwtp',
          '--crease-angle',
          '45',
          '--skip-edges',
        ]);
        await run(process.execPath, [cli, 'validate', prepared]);
      })(),
      run(process.execPath, [
        cli,
        'partition',
        source,
        '--output',
        join(staging, 'tiled'),
        '--asset-id',
        'ice3-virtual-wwtp',
        '--max-triangles',
        '60000',
        '--max-bytes',
        '8388608',
        '--lod',
        '--lod-ratio',
        '0.5',
        '--lod-allocation',
        'adaptive',
        '--lod-max-triangles',
        '120000',
        '--lod-min-unit-triangles',
        '8',
        '--lod-max-memory-bytes',
        '536870912',
        '--semantic-proxy',
        'off',
        '--render-batch',
        'static',
        '--coarse-chunk-max-bytes',
        '4194304',
        '--crease-angle',
        '45',
        '--skip-edges',
      ]),
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    await run(process.execPath, [
      '--import',
      'tsx',
      join(toolDirectory, 'verify.ts'),
      staging,
    ]);
    await replaceAssetDirectory(staging, assetRoot);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

await main();
