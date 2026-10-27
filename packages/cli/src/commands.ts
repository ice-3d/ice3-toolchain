import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import {
  BUDGET_PROFILES,
  buildPreparedGLB,
  createAssetReport,
  partitionAsset,
  readSource,
  validatePreparedGLB,
  validateBudgetProfile,
  validateSource,
  type ICEBudgetProfile,
  type ICELodAllocationMode,
  type ICESemanticProxyMode,
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
    if (args.command === 'partition') {
      await partitionCommand(args);
      return 0;
    }
    throw new Error(`ICE3_TOOL_INVALID_COMMAND: unknown command ${args.command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function partitionCommand(args: ParsedArguments): Promise<void> {
  if (args.positionals.length !== 1) {
    throw new Error(
      'ICE3_TOOL_INVALID_OPTIONS: partition requires exactly one source',
    );
  }
  const sourcePath = requiredPositional(args, 0, 'source');
  const outputPath = resolve(requiredValue(args, '--output'));
  const assetId = requiredValue(args, '--asset-id').trim();
  if (!assetId) {
    throw new Error(
      'ICE3_TOOL_PARTITION_OPTIONS_INVALID: assetId must not be empty',
    );
  }
  const maxTriangles = positiveNumber(
    args.values.get('--max-triangles') ?? '500000',
    '--max-triangles',
  );
  const maxBytes = positiveNumber(
    args.values.get('--max-bytes') ?? '33554432',
    '--max-bytes',
  );
  if (
    args.values.has('--semantic-proxy')
    && !args.flags.has('--lod')
  ) {
    throw new Error(
      'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --semantic-proxy requires --lod',
    );
  }
  const lod = args.flags.has('--lod')
      ? (() => {
        const requestedAllocation = args.values.get('--lod-allocation')
          ?? 'proportional';
        if (
          requestedAllocation !== 'proportional'
          && requestedAllocation !== 'adaptive'
        ) {
          throw new Error(
            'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --lod-allocation must be proportional or adaptive',
          );
        }
        const allocation: ICELodAllocationMode = requestedAllocation;
        const requestedSemanticProxy = args.values.get('--semantic-proxy') ?? 'off';
        if (
          requestedSemanticProxy !== 'off'
          && requestedSemanticProxy !== 'auto'
        ) {
          throw new Error(
            'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --semantic-proxy must be auto or off',
          );
        }
        const semanticProxy: ICESemanticProxyMode = requestedSemanticProxy;
        if (semanticProxy === 'auto' && allocation !== 'adaptive') {
          throw new Error(
            'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --semantic-proxy auto requires --lod-allocation adaptive',
          );
        }
        const ratio = fractionNumber(
          args.values.get('--lod-ratio') ?? '0.15',
          '--lod-ratio',
        );
        const maxTrianglesPerProxy = positiveInteger(
          args.values.get('--lod-max-triangles') ?? '250000',
          '--lod-max-triangles',
        );
        const minTrianglesPerUnit = positiveInteger(
          args.values.get('--lod-min-unit-triangles') ?? '8',
          '--lod-min-unit-triangles',
        );
        const curveSamples = positiveInteger(
          args.values.get('--lod-curve-samples') ?? '8',
          '--lod-curve-samples',
        );
        if (curveSamples < 4 || curveSamples > 32) {
          throw new Error(
            'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --lod-curve-samples must be between 4 and 32',
          );
        }
        if (minTrianglesPerUnit > maxTrianglesPerProxy) {
          throw new Error(
            'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --lod-min-unit-triangles must not exceed --lod-max-triangles',
          );
        }
        const coarseChunkMaxBytes = positiveInteger(
          args.values.get('--coarse-chunk-max-bytes') ?? String(maxBytes),
          '--coarse-chunk-max-bytes',
        );
        return {
          allocation,
          semanticProxy,
          curveSamples,
          ratio,
          maxTrianglesPerProxy,
          minTrianglesPerUnit,
          coarseChunkMaxBytes,
        };
      })()
    : undefined;
  if (await pathExists(outputPath)) {
    throw new Error(
      'ICE3_TOOL_PARTITION_OUTPUT_EXISTS: output directory already exists',
    );
  }

  const source = await readSource(sourcePath);
  const sourceReport = validateSource(source);
  if (sourceReport.errors.length > 0) {
    throw new Error(`ICE3_TOOL_SOURCE_UNSUPPORTED: ${sourceReport.errors.join(', ')}`);
  }
  const budget = await resolveBudget(args.values.get('--budget'));
  const result = await partitionAsset(source, {
    assetId,
    maxTriangles,
    maxBytes,
    creaseAngleDegrees: Number(args.values.get('--crease-angle') ?? 30),
    edges: !args.flags.has('--skip-edges'),
    budget,
    ...(lod ? { lod } : {}),
  });
  const warnings = [...new Set([...sourceReport.warnings, ...result.warnings])];
  if (
    warnings.length > 0
    && args.flags.has('--warnings-as-errors')
  ) {
    throw new Error(`ICE3_TOOL_BUDGET_WARNING: ${warnings[0]}`);
  }

  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(temporary), { recursive: true });
  try {
    await mkdir(temporary);
    for (const file of result.files) {
      const validation = validatePreparedGLB(file.bytes);
      if (validation.errors.length > 0) {
        throw new Error(
          `ICE3_TOOL_TILESET_INVALID: ${validation.errors.join(', ')}`,
        );
      }
      const destination = join(temporary, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.bytes);
    }
    validateTilesetResult(result.tileset, result.files);
    await writeFile(
      join(temporary, 'tileset.json'),
      `${JSON.stringify(result.tileset, null, 2)}\n`,
    );
    await rename(temporary, outputPath);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }

  printResult(args, {
    command: 'partition',
    output: outputPath,
    partitionCount: result.partitionCount,
    errors: [],
    warnings,
    stats: result.stats,
  });
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
    '--max-triangles',
    '--max-bytes',
    '--lod-ratio',
    '--lod-max-triangles',
    '--lod-min-unit-triangles',
    '--lod-allocation',
    '--lod-curve-samples',
    '--semantic-proxy',
    '--coarse-chunk-max-bytes',
  ]);
  const knownFlags = new Set([
    '--json',
    '--skip-edges',
    '--warnings-as-errors',
    '--lod',
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]!;
    if (valued.has(argument)) {
      const value = rest[index + 1];
      if (!value) throw new Error(`ICE3_TOOL_INVALID_OPTIONS: ${argument} needs a value`);
      values.set(argument, value);
      index += 1;
    } else if (argument.startsWith('--') && knownFlags.has(argument)) {
      flags.add(argument);
    } else if (argument.startsWith('--')) {
      throw new Error(`ICE3_TOOL_INVALID_OPTIONS: unknown option ${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  return { command, positionals, values, flags };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function positiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `ICE3_TOOL_PARTITION_OPTIONS_INVALID: ${option} must be positive`,
    );
  }
  return parsed;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `ICE3_TOOL_PARTITION_OPTIONS_INVALID: ${option} must be a positive integer`,
    );
  }
  return parsed;
}

function fractionNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    throw new Error(
      `ICE3_TOOL_PARTITION_OPTIONS_INVALID: ${option} must be between zero and one`,
    );
  }
  return parsed;
}

function validateTilesetResult(
  tileset: unknown,
  files: readonly { readonly path: string }[],
): void {
  const document = tileset as {
    asset?: { version?: unknown };
    root?: unknown;
  };
  if (document.asset?.version !== '1.1' || !document.root) {
    throw new Error('ICE3_TOOL_TILESET_INVALID: invalid tileset document');
  }
  const contentUris: string[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const tile = value as {
      content?: { uri?: unknown };
      children?: unknown[];
    };
    if (typeof tile.content?.uri === 'string') {
      contentUris.push(tile.content.uri);
    }
    for (const child of tile.children ?? []) visit(child);
  };
  visit(document.root);
  const expected = new Set(files.map((file) => file.path));
  if (
    contentUris.length !== expected.size
    || new Set(contentUris).size !== contentUris.length
    || contentUris.some((uri) => !expected.has(uri))
  ) {
    throw new Error('ICE3_TOOL_TILESET_INVALID: content references are invalid');
  }
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
