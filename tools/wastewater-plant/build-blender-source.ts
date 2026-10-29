import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSupportedBlender,
  resolveBlenderBinary,
  SUPPORTED_BLENDER_VERSION,
} from './blender-runtime.js';
import {
  createBlenderSourceCacheKey,
  resolveBlenderSourceCacheRoot,
  restoreCachedBlenderSource,
  storeCachedBlenderSource,
} from './blender-source-cache.js';
import { finalizeSourceGlb } from './finalize-source-glb.js';
import { writeWastewaterSceneSpec } from './scene-spec.js';

const outputIndex = process.argv.indexOf('--output');
const output = process.argv[outputIndex + 1];
if (outputIndex < 0 || !output) {
  throw new Error('usage: build-blender-source --output <glb-path>');
}

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const toolchainRoot = resolve(toolDirectory, '..', '..');
const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-build-'));
try {
  const spec = join(root, 'scene.json');
  const raw = join(root, 'source.raw.glb');
  await writeWastewaterSceneSpec(spec);
  const cacheRoot = resolveBlenderSourceCacheRoot();
  const cacheKey = cacheRoot
    ? await createBlenderSourceCacheKey({
        toolDirectory,
        toolchainRoot,
        specPath: spec,
        blenderVersion: SUPPORTED_BLENDER_VERSION,
      })
    : undefined;
  const cacheHit = Boolean(
    cacheRoot
    && cacheKey
    && await restoreCachedBlenderSource(
      cacheRoot,
      cacheKey,
      resolve(output),
    ),
  );
  if (cacheHit && cacheKey) {
    console.error(`ICE3_WWTP_SOURCE_CACHE_HIT: ${cacheKey.slice(0, 12)}`);
  } else {
    const blender = resolveBlenderBinary();
    assertSupportedBlender(blender);
    const result = spawnSync(blender, [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      resolve(toolDirectory, 'blender/generate.py'),
      '--',
      '--spec',
      spec,
      '--output',
      raw,
    ], { stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error('ICE3_WWTP_BLENDER_GENERATION_FAILED');
    }
    await finalizeSourceGlb(raw, resolve(output));
    if (cacheRoot && cacheKey) {
      await storeCachedBlenderSource(cacheRoot, cacheKey, resolve(output));
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
