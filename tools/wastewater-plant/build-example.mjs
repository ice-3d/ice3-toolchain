import { spawnSync } from 'node:child_process';
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
  const result = spawnSync(command, args, {
    cwd: toolchainRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `ICE3_WWTP_ARTIFACT_INVALID: command failed: ${command}`,
    );
  }
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
    run(process.execPath, [
      '--import',
      'tsx',
      join(toolDirectory, 'build-blender-source.ts'),
      '--output',
      source,
    ]);
    run(process.execPath, [
      join(toolchainRoot, 'packages', 'cli', 'dist', 'main.js'),
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
    ]);
    run(process.execPath, [
      join(toolchainRoot, 'packages', 'cli', 'dist', 'main.js'),
      'validate',
      prepared,
    ]);
    run(process.execPath, [
      join(toolchainRoot, 'packages', 'cli', 'dist', 'main.js'),
      'partition',
      source,
      '--output',
      join(staging, 'tiled'),
      '--asset-id',
      'ice3-virtual-wwtp',
      '--max-triangles',
      '6000',
      '--max-bytes',
      '1048576',
      '--lod',
      '--lod-ratio',
      '0.5',
      '--lod-allocation',
      'adaptive',
      '--lod-max-triangles',
      '24000',
      '--lod-min-unit-triangles',
      '8',
      '--semantic-proxy',
      'auto',
      '--render-batch',
      'static',
      '--coarse-chunk-max-bytes',
      '524288',
      '--crease-angle',
      '45',
    ]);
    run(process.execPath, [
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
