import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import {
  buildPreparedGLB,
  readSource,
  validatePreparedGLB,
  validateSource,
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
  const report = validateSource(source);
  if (report.errors.length > 0) {
    throw new Error(`ICE3_TOOL_SOURCE_UNSUPPORTED: ${report.errors.join(', ')}`);
  }
  const assetId = args.values.get('--asset-id') ?? defaultAssetId(outputPath);
  const creaseAngleDegrees = Number(args.values.get('--crease-angle') ?? 30);
  const built = buildPreparedGLB(source, { assetId, creaseAngleDegrees });
  const validation = validatePreparedGLB(built.bytes);
  if (validation.errors.length > 0) {
    throw new Error(`ICE3_TOOL_OUTPUT_INVALID: ${validation.errors.join(', ')}`);
  }

  const temporary = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, built.bytes);
    await rename(temporary, outputPath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  printResult(args, {
    command: 'build',
    output: outputPath,
    errors: [],
    warnings: report.warnings,
    stats: built.stats,
  });
}

async function inspectCommand(args: ParsedArguments): Promise<void> {
  const sourcePath = requiredPositional(args, 0, 'source');
  const source = await readSource(sourcePath);
  const report = validateSource(source);
  let stats = { nodeCount: 0, meshCount: 0, triangleCount: 0, edgeSegmentCount: 0 };
  if (report.errors.length === 0) {
    stats = buildPreparedGLB(source, {
      assetId: args.values.get('--asset-id') ?? defaultAssetId(sourcePath),
      creaseAngleDegrees: Number(args.values.get('--crease-angle') ?? 30),
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
  const valued = new Set(['--output', '--asset-id', '--crease-angle']);
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
