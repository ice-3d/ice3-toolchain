import { spawn } from 'node:child_process';
import {
  accessSync,
  constants,
} from 'node:fs';
import {
  readFile,
  rm,
  stat,
} from 'node:fs/promises';

const OUTPUT_LIMIT = 64 * 1024;

export interface IJtConverterRequest {
  readonly inputPath: string;
  readonly outputPath: string;
}

export interface IJtConverterProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export type IJtConverterRunner = (
  args: readonly string[],
  options: Readonly<{ timeoutMs: number }>,
) => Promise<IJtConverterProcessResult>;

export interface IJtConverterOptions {
  readonly converterBinary: string;
  readonly timeoutMs?: number;
  readonly runner?: IJtConverterRunner;
}

export function resolveJtConverter(
  explicitPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const candidate = explicitPath?.trim() || env.ICE3_JT_CONVERTER?.trim();
  if (!candidate) throw new Error('ICE3_TOOL_JT_CONVERTER_UNAVAILABLE');
  try {
    accessSync(candidate, constants.X_OK);
  } catch {
    throw new Error('ICE3_TOOL_JT_CONVERTER_UNAVAILABLE');
  }
  return candidate;
}

export async function runJtConverter(
  request: IJtConverterRequest,
  options: IJtConverterOptions,
): Promise<void> {
  const converter = resolveJtConverter(options.converterBinary, {});
  const timeoutMs = options.timeoutMs ?? 300_000;
  const args = [
    converter,
    '--input',
    request.inputPath,
    '--output',
    request.outputPath,
  ] as const;
  const result = await (options.runner ?? defaultRunner)(args, { timeoutMs });
  if (result.timedOut) {
    await rm(request.outputPath, { force: true });
    throw new Error('ICE3_TOOL_JT_TIMEOUT');
  }
  if (result.code !== 0) {
    await rm(request.outputPath, { force: true });
    throw new Error('ICE3_TOOL_JT_CONVERT_FAILED');
  }
  try {
    const metadata = await stat(request.outputPath);
    const header = await readFile(request.outputPath);
    if (
      !metadata.isFile()
      || metadata.size <= 20
      || header.subarray(0, 4).toString('ascii') !== 'glTF'
    ) {
      throw new Error('ICE3_TOOL_JT_EXPORT_INVALID');
    }
  } catch (error) {
    await rm(request.outputPath, { force: true });
    if (error instanceof Error && error.message.startsWith('ICE3_TOOL_')) {
      throw error;
    }
    throw new Error('ICE3_TOOL_JT_EXPORT_INVALID');
  }
}

const defaultRunner: IJtConverterRunner = async (args, options) => (
  new Promise<IJtConverterProcessResult>((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const append = (current: string, chunk: Buffer) => (
      (current + chunk.toString('utf8')).slice(-OUTPUT_LIMIT)
    );
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 1_000).unref();
    }, options.timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, ...(timedOut ? { timedOut } : {}) });
    });
  })
);
