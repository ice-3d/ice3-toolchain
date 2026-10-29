import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const CACHE_FORMAT_VERSION = '1';
const GENERATOR_INPUTS = [
  'build-blender-source.ts',
  'blender-runtime.ts',
  'equipment.ts',
  'finalize-source-glb.ts',
  'layout.ts',
  'scene-spec.ts',
  'topology.ts',
  'types.ts',
] as const;

export interface IBlenderSourceCacheKeyOptions {
  readonly toolDirectory: string;
  readonly toolchainRoot: string;
  readonly specPath: string;
  readonly blenderVersion: string;
}

export function resolveBlenderSourceCacheRoot(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homeDirectory = homedir(),
): string | undefined {
  if (env.ICE3_BLENDER_SOURCE_CACHE === '0') return undefined;
  const configured = env.ICE3_BLENDER_CACHE_DIR?.trim();
  if (configured) return resolve(configured);
  if (platform === 'darwin') {
    return join(homeDirectory, 'Library', 'Caches', 'ice3', 'blender-source');
  }
  const xdgCache = env.XDG_CACHE_HOME?.trim();
  if (xdgCache) return join(resolve(xdgCache), 'ice3', 'blender-source');
  return join(homeDirectory, '.cache', 'ice3', 'blender-source');
}

export async function createBlenderSourceCacheKey(
  options: IBlenderSourceCacheKeyOptions,
): Promise<string> {
  const hash = createHash('sha256');
  hash.update(`format:${CACHE_FORMAT_VERSION}\0`);
  hash.update(`blender:${options.blenderVersion}\0`);
  for (const path of await sourceFiles(options.toolDirectory)) {
    hash.update(`${relative(options.toolDirectory, path)}\0`);
    hash.update(await readFile(path));
    hash.update('\0');
  }
  hash.update('package-lock.json\0');
  hash.update(await readFile(join(options.toolchainRoot, 'package-lock.json')));
  hash.update('\0scene.json\0');
  hash.update(await readFile(options.specPath));
  return hash.digest('hex');
}

export async function restoreCachedBlenderSource(
  cacheRoot: string,
  cacheKey: string,
  outputPath: string,
): Promise<boolean> {
  const cachePath = join(cacheRoot, `${cacheKey}.glb`);
  try {
    const metadata = await stat(cachePath);
    if (metadata.size < 20) return false;
  } catch {
    return false;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await copyFile(cachePath, temporary, constants.COPYFILE_FICLONE);
    await rename(temporary, outputPath);
    return true;
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function storeCachedBlenderSource(
  cacheRoot: string,
  cacheKey: string,
  sourcePath: string,
): Promise<void> {
  await mkdir(cacheRoot, { recursive: true });
  const cachePath = join(cacheRoot, `${cacheKey}.glb`);
  const temporary = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await copyFile(sourcePath, temporary, constants.COPYFILE_FICLONE);
    await rename(temporary, cachePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (!(await pathExists(cachePath))) throw error;
  }
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files = GENERATOR_INPUTS.map((file) => join(directory, file));
  for (const entry of await readdir(join(directory, 'blender'), {
    withFileTypes: true,
  })) {
    if (entry.isFile() && entry.name.endsWith('.py')) {
      files.push(join(directory, 'blender', entry.name));
    }
  }
  return files.sort();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
