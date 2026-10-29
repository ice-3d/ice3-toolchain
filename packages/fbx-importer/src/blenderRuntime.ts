import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';

export const SUPPORTED_BLENDER_VERSION = '5.2.3';

export interface IResolveBlenderOptions {
  readonly explicitPath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

export interface IBlenderVersion {
  readonly version: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function resolveBlenderBinary(
  options: IResolveBlenderOptions = {},
): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const candidate = env.BLENDER_BIN?.trim()
    || options.explicitPath
    || (platform === 'darwin'
      ? '/Applications/Blender.app/Contents/MacOS/Blender'
      : undefined);
  if (!candidate) {
    throw new Error('ICE3_TOOL_FBX_BLENDER_UNAVAILABLE: BLENDER_BIN is required');
  }
  try {
    accessSync(candidate, constants.X_OK);
  } catch {
    throw new Error('ICE3_TOOL_FBX_BLENDER_UNAVAILABLE');
  }
  return candidate;
}

export function parseBlenderVersion(output: string): IBlenderVersion {
  const match = output.match(/Blender\s+(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error('ICE3_TOOL_FBX_BLENDER_VERSION_INVALID');
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return {
    version: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
  };
}

export function assertBlenderVersion(version: string): void {
  if (version !== SUPPORTED_BLENDER_VERSION) {
    throw new Error('ICE3_TOOL_FBX_BLENDER_VERSION_INVALID');
  }
}

export function assertSupportedBlender(
  binary: string,
  readVersion: (path: string) => string = defaultReadVersion,
): string {
  const version = parseBlenderVersion(readVersion(binary)).version;
  assertBlenderVersion(version);
  return version;
}

function defaultReadVersion(binary: string): string {
  return execFileSync(binary, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
}
