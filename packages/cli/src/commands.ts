import { createHash } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import {
  BUDGET_PROFILES,
  buildPreparedGLB,
  createAssetReport,
  readSource,
  validatePreparedGLB,
  validateBudgetProfile,
  validateSource,
  type ICEBudgetProfile,
} from '@ice3/toolchain-core';

interface ParsedArguments {
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  try {
    const args = parseArguments(argv);
    if (!args.command) {
      throw new Error('ICE3_TOOL_INVALID_COMMAND: command is required');
    }
    if (args.command === 'build') {
      await buildCommand(args);
      return 0;
    }
    if (args.command === 'inspect') {
      await inspectCommand(args);
      return 0;
    }
    if (args.command === 'validate') {
      await validateCommand(args);
      return 0;
    }
    throw new Error(`ICE3_TOOL_INVALID_COMMAND: unknown command ${args.command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function buildCommand(args: ParsedArguments): Promise<void> {
  const sourcePath = requiredPositional(args, 0, 'source');
  const outputPath = resolve(requiredValue(args, '--output'));
  const source = await readSource(sourcePath);
  const sourceReport = validateSource(source);
  if (sourceReport.errors.length > 0) {
    throw new Error(`ICE3_TOOL_SOURCE_UNSUPPORTED: ${sourceReport.errors.join(', ')}`);
  }
  const assetId = args.values.get('--asset-id') ?? defaultAssetId(outputPath);
  const creaseAngleDegrees = Number(args.values.get('--crease-angle') ?? 30);
  const budget = await resolveBudget(args.values.get('--budget'));
  const built = buildPreparedGLB(source, {
    assetId,
    creaseAngleDegrees,
    edges: !args.flags.has('--skip-edges'),
    budget,
  });
  if (built.budget.status === 'error') {
    throw new Error(
      `ICE3_TOOL_BUDGET_EXCEEDED: ${budget.id}`,
    );
  }
  if (
    built.budget.status === 'warning'
    && args.flags.has('--warnings-as-errors')
  ) {
    throw new Error(`ICE3_TOOL_BUDGET_WARNING: ${budget.id}`);
  }
  const validation = validatePreparedGLB(built.bytes);
  if (validation.errors.length > 0) {
    throw new Error(`ICE3_TOOL_OUTPUT_INVALID: ${validation.errors.join(', ')}`);
  }

  const reportPath = args.values.get('--report');
  const report = reportPath
    ? createAssetReport({
        toolVersion: await readToolVersion(),
        sourceFormat: 'gltf-2.0',
        sourceDigest: `sha256:${
          createHash('sha256').update(await readFile(sourcePath)).digest('hex')
        }`,
        assetId,
        profileVersion: '1.0',
        contractVersion: '1.0',
        contentDigest: `sha256:${built.contentDigest}`,
        metrics: built.metrics,
        budget: built.budget,
        diagnostics: sourceReport.warnings.map((message) => ({
          code: 'ICE3_TOOL_RECOVERABLE_WARNING',
          severity: 'warning' as const,
          message,
        })),
      })
    : undefined;
  const temporary = `${outputPath}.${process.pid}.tmp`;
  const reportTemporary = reportPath
    ? `${reportPath}.${process.pid}.tmp`
    : undefined;
  try {
    if (reportPath && reportTemporary && report) {
      await writeFile(reportTemporary, `${JSON.stringify(report, null, 2)}\n`);
    }
    await writeFile(temporary, built.bytes);
    if (reportTemporary && reportPath) {
      await rename(reportTemporary, reportPath);
    }
    await rename(temporary, outputPath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (reportTemporary) {
      await unlink(reportTemporary).catch(() => {});
    }
    if (reportPath) {
      throw new Error(
        `ICE3_TOOL_REPORT_WRITE_FAILED: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    throw error;
  }
  printResult(args, {
    command: 'build',
    output: outputPath,
    ...(reportPath ? { report: reportPath } : {}),
    errors: [],
    warnings: sourceReport.warnings,
    stats: built.stats,
    budget: built.budget,
  });
}

async function inspectCommand(args: ParsedArguments): Promise<void> {
  const sourcePath = requiredPositional(args, 0, 'source');
  const sourceBytes = await readFile(sourcePath);
  if (hasPreparedProfile(sourceBytes)) {
    const report = validatePreparedGLB(sourceBytes);
    printResult(args, {
      command: 'inspect',
      source: sourcePath,
      errors: report.errors,
      warnings: report.warnings,
      stats: readProfileStats(sourceBytes),
    });
    if (report.errors.length > 0) {
      throw new Error(`ICE3_TOOL_PROFILE_INVALID: ${report.errors.join(', ')}`);
    }
    return;
  }
  const source = await readSource(sourcePath);
  const report = validateSource(source);
  let stats = { nodeCount: 0, meshCount: 0, triangleCount: 0, edgeSegmentCount: 0 };
  if (report.errors.length === 0) {
    stats = buildPreparedGLB(source, {
      assetId: args.values.get('--asset-id') ?? defaultAssetId(sourcePath),
      creaseAngleDegrees: Number(args.values.get('--crease-angle') ?? 30),
      edges: !args.flags.has('--skip-edges'),
    }).stats;
  }
  printResult(args, {
    command: 'inspect',
    source: sourcePath,
    errors: report.errors,
    warnings: report.warnings,
    stats,
  });
  if (report.errors.length > 0) {
    throw new Error(`ICE3_TOOL_SOURCE_UNSUPPORTED: ${report.errors.join(', ')}`);
  }
}

function hasPreparedProfile(bytes: Uint8Array): boolean {
  const buffer = Buffer.from(bytes);
  if (
    buffer.byteLength < 20
    || buffer.readUInt32LE(0) !== 0x46546c67
  ) {
    return false;
  }
  try {
    const jsonLength = buffer.readUInt32LE(12);
    const json = JSON.parse(
      buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
    ) as {
      asset?: { extras?: { ice3?: { profile?: string } } };
    };
    return json.asset?.extras?.ice3?.profile === 'ice3-prepared';
  } catch {
    return false;
  }
}

function readProfileStats(bytes: Uint8Array): {
  nodeCount: number;
  meshCount: number;
  triangleCount: number;
  edgeSegmentCount: number;
} {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as {
    asset?: {
      extras?: {
        ice3?: {
          stats?: Record<string, number>;
        };
      };
    };
  };
  const stats = json.asset?.extras?.ice3?.stats ?? {};
  return {
    nodeCount: Number(stats.nodeCount ?? 0),
    meshCount: Number(stats.meshCount ?? 0),
    triangleCount: Number(stats.triangleCount ?? 0),
    edgeSegmentCount: Number(stats.edgeSegmentCount ?? 0),
  };
}

async function validateCommand(args: ParsedArguments): Promise<void> {
  const path = requiredPositional(args, 0, 'file');
  const bytes = await readFile(path);
  const report = validatePreparedGLB(bytes);
  printResult(args, {
    command: 'validate',
    file: path,
    errors: report.errors,
    warnings: report.warnings,
  });
  if (report.errors.length > 0) {
    throw new Error(`ICE3_TOOL_PROFILE_INVALID: ${report.errors.join(', ')}`);
  }
}

function printResult(args: ParsedArguments, value: unknown): void {
  console.log(
    args.flags.has('--json') ? JSON.stringify(value) : JSON.stringify(value, null, 2),
  );
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valued = new Set([
    '--output',
    '--asset-id',
    '--crease-angle',
    '--report',
    '--budget',
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (valued.has(argument)) {
      const value = rest[index + 1];
      if (!value) throw new Error(`ICE3_TOOL_INVALID_OPTIONS: ${argument} needs a value`);
      values.set(argument, value);
      index += 1;
    } else if (argument.startsWith('--')) {
      flags.add(argument);
    } else {
      positionals.push(argument);
    }
  }
  return { command, positionals, values, flags };
}

function requiredPositional(
  args: ParsedArguments,
  index: number,
  name: string,
): string {
  const value = args.positionals[index];
  if (!value) throw new Error(`ICE3_TOOL_INVALID_OPTIONS: ${name} is required`);
  return value;
}

function requiredValue(args: ParsedArguments, name: string): string {
  const value = args.values.get(name);
  if (!value) throw new Error(`ICE3_TOOL_INVALID_OPTIONS: ${name} is required`);
  return value;
}

function defaultAssetId(path: string): string {
  return basename(path, extname(path))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

async function resolveBudget(value: string | undefined): Promise<ICEBudgetProfile> {
  const selected = value ?? 'interactive-desktop-v1';
  if (Object.hasOwn(BUDGET_PROFILES, selected)) {
    return BUDGET_PROFILES[selected]!;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolve(selected), 'utf8'));
  } catch {
    throw new Error(`ICE3_TOOL_INVALID_BUDGET: cannot read ${selected}`);
  }
  return validateBudgetProfile(parsed);
}

async function readToolVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(
    new URL('../../../package.json', import.meta.url),
    'utf8',
  )) as { version: string };
  return packageJson.version;
}
