import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';

export const SUPPORTED_BLENDER_VERSION = '5.2.3';

export function resolveBlenderBinary(explicitPath?: string): string {
  const candidate = explicitPath
    ?? process.env.BLENDER_BIN
    ?? '/Applications/Blender.app/Contents/MacOS/Blender';
  try {
    accessSync(candidate, constants.X_OK);
  } catch {
    throw new Error(
      `ICE3_WWTP_BLENDER_UNAVAILABLE: executable not found at ${candidate}`,
    );
  }
  return candidate;
}

export function readBlenderVersion(binary: string): {
  readonly version: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
} {
  const output = execFileSync(binary, ['--version'], { encoding: 'utf8' });
  const match = output.match(/Blender\s+(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error('ICE3_WWTP_BLENDER_VERSION_INVALID: unreadable version');
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return Object.freeze({
    version: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
  });
}

export function assertSupportedBlender(binary: string): void {
  const actual = readBlenderVersion(binary).version;
  if (actual !== SUPPORTED_BLENDER_VERSION) {
    throw new Error(
      `ICE3_WWTP_BLENDER_VERSION_INVALID: expected ${SUPPORTED_BLENDER_VERSION}, got ${actual}`,
    );
  }
}
