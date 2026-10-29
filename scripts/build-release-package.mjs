import { build } from 'esbuild';
import {
  cp,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageRoot = join(root, 'packages', 'cli');
const releaseRoot = join(root, 'release');
const outputRoot = join(releaseRoot, 'toolchain');
const outputDist = join(outputRoot, 'dist');

const runtimeDependencies = {
  '@gltf-transform/core': '4.5.1',
  '@gltf-transform/extensions': '4.5.1',
  '@gltf-transform/functions': '4.5.1',
  'assimpjs': '0.0.10',
  'draco3dgltf': '1.5.9',
  'meshoptimizer': '1.3.0',
  'occt-import-js': '0.0.23',
  'web-ifc': '0.0.78',
};

export function createPublicPackageManifest() {
  return {
    name: '@ice3/toolchain',
    version: '0.1.0',
    description: 'Offline industrial GLB preparation and tiling CLI',
    license: 'MIT',
    type: 'module',
    engines: {
      node: '>=24.0.0',
    },
    bin: {
      'ice3-tool': 'dist/main.js',
    },
    exports: {
      '.': {
        types: './dist/main.d.ts',
        import: './dist/main.js',
      },
    },
    files: [
      'dist/**/*.js',
      'dist/**/*.d.ts',
      'dist/**/*.map',
      'dist/fbx/*.py',
      'dist/usd/*.py',
      'THIRD_PARTY_NOTICES.md',
    ],
    dependencies: runtimeDependencies,
    repository: {
      type: 'git',
      url: 'git+https://github.com/ice-3d/ice3-toolchain.git',
      directory: 'packages/cli',
    },
    homepage: 'https://github.com/ice-3d/ice3-toolchain#readme',
    bugs: {
      url: 'https://github.com/ice-3d/ice3-toolchain/issues',
    },
    keywords: [
      'ice3',
      'glb',
      'tileset',
      '3d-tiles',
      'industrial',
      'cli',
    ],
    publishConfig: {
      access: 'public',
    },
  };
}

export async function buildReleasePackage() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputDist, { recursive: true });
  await mkdir(join(outputDist, 'fbx'), { recursive: true });
  await mkdir(join(outputDist, 'usd'), { recursive: true });
  await cp(
    join(packageRoot, 'README.md'),
    join(outputRoot, 'README.md'),
  );
  await cp(
    join(root, 'packages', 'fbx-importer', 'scripts', 'fbx-to-glb.py'),
    join(outputDist, 'fbx', 'fbx-to-glb.py'),
  );
  await cp(
    join(root, 'packages', 'usd-importer', 'scripts', 'usd-to-glb.py'),
    join(outputDist, 'usd', 'usd-to-glb.py'),
  );
  await cp(
    join(root, 'LICENSE'),
    join(outputRoot, 'LICENSE'),
  );
  await cp(
    join(root, 'THIRD_PARTY_NOTICES.md'),
    join(outputRoot, 'THIRD_PARTY_NOTICES.md'),
  );
  for (const file of [
    'main.d.ts',
    'main.d.ts.map',
    'commands.d.ts',
    'commands.d.ts.map',
  ]) {
    await cp(
      join(packageRoot, 'dist', file),
      join(outputDist, file),
    );
  }

  await build({
    entryPoints: [join(packageRoot, 'src', 'main.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    outfile: join(outputDist, 'main.js'),
    sourcemap: true,
    legalComments: 'eof',
    external: [
      '@gltf-transform/core',
      '@gltf-transform/extensions',
      '@gltf-transform/functions',
      'assimpjs',
      'draco3dgltf',
      'meshoptimizer',
      'occt-import-js',
      'web-ifc',
    ],
  });

  await writeFile(
    join(outputRoot, 'package.json'),
    `${JSON.stringify(createPublicPackageManifest(), null, 2)}\n`,
  );
}

const directEntry = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;
if (directEntry) {
  await buildReleasePackage();
}
