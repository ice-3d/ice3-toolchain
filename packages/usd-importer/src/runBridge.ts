import { spawn } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import type {
  IUsdBridgeOptions,
  IUsdBridgeProcessResult,
  IUsdBridgeReport,
  IUsdBridgeRequest,
  IUsdBridgeRunner,
} from './types.js';
import { SUPPORTED_USD_BLENDER_VERSION } from './blenderRuntime.js';

const OUTPUT_LIMIT = 64 * 1024;

export async function runUsdBridge(
  request: IUsdBridgeRequest,
  options: IUsdBridgeOptions,
): Promise<IUsdBridgeReport> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const args = [
    options.blenderBinary,
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    options.scriptPath,
    '--',
    '--input',
    request.inputPath,
    '--output',
    request.outputPath,
    '--report',
    request.reportPath,
  ] as const;
  const result = await (options.runner ?? defaultRunner)(args, { timeoutMs });
  if (result.timedOut) {
    await removeBridgeFiles(request);
    throw new Error('ICE3_TOOL_USD_TIMEOUT');
  }
  if (result.code !== 0) {
    await removeBridgeFiles(request);
    throw new Error('ICE3_TOOL_USD_IMPORT_FAILED');
  }
  let report: IUsdBridgeReport;
  try {
    report = JSON.parse(await readFile(request.reportPath, 'utf8'));
  } catch {
    await removeBridgeFiles(request);
    throw new Error('ICE3_TOOL_USD_IMPORT_FAILED');
  }
  if (
    report.success !== true
    || report.converter !== 'blender'
    || report.toolVersion !== SUPPORTED_USD_BLENDER_VERSION
    || report.blenderVersion !== SUPPORTED_USD_BLENDER_VERSION
    || !Array.isArray(report.objects)
  ) {
    await removeBridgeFiles(request);
    throw new Error('ICE3_TOOL_USD_IMPORT_FAILED');
  }
  try {
    const output = await stat(request.outputPath);
    if (!output.isFile() || output.size <= 20) {
      throw new Error('ICE3_TOOL_USD_EXPORT_FAILED');
    }
  } catch (error) {
    await removeBridgeFiles(request);
    if (error instanceof Error && error.message.startsWith('ICE3_TOOL_')) {
      throw error;
    }
    throw new Error('ICE3_TOOL_USD_EXPORT_FAILED');
  }
  return report;
}

async function removeBridgeFiles(request: IUsdBridgeRequest): Promise<void> {
  await Promise.all([
    rm(request.outputPath, { force: true }),
    rm(request.reportPath, { force: true }),
  ]);
}

const defaultRunner: IUsdBridgeRunner = async (args, options) => (
  new Promise<IUsdBridgeProcessResult>((resolve, reject) => {
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
