import { spawn } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import type {
  IFbxBridgeOptions,
  IFbxBridgeProcessResult,
  IFbxBridgeReport,
  IFbxBridgeRequest,
  IFbxBridgeRunner,
} from './types.js';
import { SUPPORTED_BLENDER_VERSION } from './blenderRuntime.js';

const OUTPUT_LIMIT = 64 * 1024;

export async function runFbxBridge(
  request: IFbxBridgeRequest,
  options: IFbxBridgeOptions,
): Promise<IFbxBridgeReport> {
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
    await Promise.all([
      rm(request.outputPath, { force: true }),
      rm(request.reportPath, { force: true }),
    ]);
    throw new Error('ICE3_TOOL_FBX_TIMEOUT');
  }
  if (result.code !== 0) {
    await Promise.all([
      rm(request.outputPath, { force: true }),
      rm(request.reportPath, { force: true }),
    ]);
    throw new Error('ICE3_TOOL_FBX_IMPORT_FAILED');
  }
  let report: IFbxBridgeReport;
  try {
    report = JSON.parse(await readFile(request.reportPath, 'utf8'));
  } catch {
    throw new Error('ICE3_TOOL_FBX_IMPORT_FAILED');
  }
  if (
    report.success !== true
    || report.converter !== 'blender'
    || report.toolVersion !== SUPPORTED_BLENDER_VERSION
    || !Array.isArray(report.objects)
  ) {
    throw new Error('ICE3_TOOL_FBX_IMPORT_FAILED');
  }
  try {
    const output = await stat(request.outputPath);
    if (!output.isFile() || output.size <= 20) {
      throw new Error('ICE3_TOOL_FBX_EXPORT_FAILED');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ICE3_TOOL_')) {
      throw error;
    }
    throw new Error('ICE3_TOOL_FBX_EXPORT_FAILED');
  }
  return report;
}

const defaultRunner: IFbxBridgeRunner = async (args, options) => (
  new Promise<IFbxBridgeProcessResult>((resolve, reject) => {
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
    }, options.timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, ...(timedOut ? { timedOut } : {}) });
    });
  })
);
