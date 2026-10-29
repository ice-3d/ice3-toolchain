import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createBlenderSourceCacheKey,
  resolveBlenderSourceCacheRoot,
  restoreCachedBlenderSource,
  storeCachedBlenderSource,
} from '../../tools/wastewater-plant/blender-source-cache.js';

test('derives a stable cache key from generator inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-source-cache-'));
  const tools = join(root, 'tools');
  const spec = join(root, 'scene.json');
  try {
    await mkdir(tools);
    for (const file of [
      'build-blender-source.ts',
      'blender-runtime.ts',
      'equipment.ts',
      'finalize-source-glb.ts',
      'layout.ts',
      'scene-spec.ts',
      'topology.ts',
      'types.ts',
    ]) {
      await writeFile(join(tools, file), `// ${file}\n`);
    }
    await mkdir(join(tools, 'blender'));
    await writeFile(join(tools, 'blender', 'generate.py'), 'print("one")\n');
    await writeFile(join(root, 'package-lock.json'), '{}\n');
    await writeFile(spec, '{"assetId":"demo"}\n');
    const options = {
      toolDirectory: tools,
      toolchainRoot: root,
      specPath: spec,
      blenderVersion: '5.2.3',
    };

    const first = await createBlenderSourceCacheKey(options);
    expect(await createBlenderSourceCacheKey(options)).toBe(first);
    await writeFile(join(tools, 'blender', 'generate.py'), 'print("two")\n');
    expect(await createBlenderSourceCacheKey(options)).not.toBe(first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restores a cached source GLB without rewriting it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-source-cache-'));
  const cache = join(root, 'cache');
  const output = join(root, 'output', 'source.glb');
  const bytes = Buffer.alloc(24);
  bytes.write('glTF', 0, 'ascii');
  try {
    const source = join(root, 'source.glb');
    await writeFile(source, bytes);
    await storeCachedBlenderSource(cache, 'source-key', source);

    expect(await restoreCachedBlenderSource(cache, 'source-key', output))
      .toBe(true);
    expect(await readFile(output)).toEqual(bytes);
    expect(await restoreCachedBlenderSource(cache, 'missing', output))
      .toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('supports disabling or redirecting the source cache', () => {
  expect(resolveBlenderSourceCacheRoot({ ICE3_BLENDER_SOURCE_CACHE: '0' }))
    .toBeUndefined();
  expect(resolveBlenderSourceCacheRoot(
    { ICE3_BLENDER_CACHE_DIR: '/tmp/ice3-cache' },
    'linux',
    '/home/tester',
  )).toBe('/tmp/ice3-cache');
});
