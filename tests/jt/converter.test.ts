import {
  chmod,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  runJtConverter,
} from '../../packages/jt-importer/src/runConverter.js';

test('runs the configured JT converter with fixed arguments', async () => {
  const root = await temporaryDirectory();
  try {
    const output = join(root, 'raw.glb');
    await runJtConverter({
      inputPath: resolve('tests/fixtures/jt/synthetic-contract.jt'),
      outputPath: output,
    }, {
      converterBinary: resolve('tests/fixtures/jt/fake-converter.mjs'),
    });
    expect((await stat(output)).size).toBeGreaterThan(20);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports unavailable, failed and invalid JT converters', async () => {
  const root = await temporaryDirectory();
  try {
    await expect(runJtConverter(request(root), {
      converterBinary: join(root, 'missing'),
    })).rejects.toThrow('ICE3_TOOL_JT_CONVERTER_UNAVAILABLE');
    await expect(runJtConverter(request(root), {
      converterBinary: resolve('tests/fixtures/jt/failing-converter.sh'),
    })).rejects.toThrow('ICE3_TOOL_JT_CONVERT_FAILED');
    await expect(runJtConverter(request(root), {
      converterBinary: resolve('tests/fixtures/jt/invalid-converter.sh'),
    })).rejects.toThrow('ICE3_TOOL_JT_EXPORT_INVALID');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('kills a JT converter that ignores SIGTERM', async () => {
  const root = await temporaryDirectory();
  try {
    const converter = join(root, 'slow-converter');
    await writeFile(
      converter,
      '#!/bin/sh\ntrap "" TERM\nsleep 5\n',
    );
    await chmod(converter, 0o755);
    const started = Date.now();
    await expect(runJtConverter(request(root), {
      converterBinary: converter,
      timeoutMs: 50,
    })).rejects.toThrow('ICE3_TOOL_JT_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(1_500);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function request(root: string) {
  return {
    inputPath: resolve('tests/fixtures/jt/synthetic-contract.jt'),
    outputPath: join(root, 'raw.glb'),
  };
}

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ice3-jt-converter-'));
}
