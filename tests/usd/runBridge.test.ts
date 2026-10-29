import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  assertUsdBlenderVersion,
  parseBlenderVersion,
} from '../../packages/usd-importer/src/blenderRuntime.js';
import {
  runUsdBridge,
} from '../../packages/usd-importer/src/runBridge.js';

test('parses and enforces the pinned USD Blender version', () => {
  expect(parseBlenderVersion('Blender 5.2.3 LTS')).toEqual({
    version: '5.2.3',
    major: 5,
    minor: 2,
    patch: 3,
  });
  expect(() => assertUsdBlenderVersion('5.2.2')).toThrow(
    'ICE3_TOOL_USD_BLENDER_VERSION_INVALID',
  );
});

test('passes paths as separate arguments and reads a private USD report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-bridge-'));
  try {
    const inputPath = join(root, 'source.usda');
    const outputPath = join(root, 'raw.glb');
    const reportPath = join(root, 'report.json');
    await writeFile(inputPath, '#usda 1.0\n');
    const calls: readonly string[][] = [];
    const report = await runUsdBridge({
      inputPath,
      outputPath,
      reportPath,
    }, {
      blenderBinary: '/tmp/Blender',
      scriptPath: '/repo/usd-to-glb.py',
      runner: async (args) => {
        (calls as string[][]).push(args);
        await writeFile(outputPath, Buffer.alloc(32));
        await writeFile(reportPath, JSON.stringify({
          success: true,
          converter: 'blender',
          toolVersion: '5.2.3',
          blenderVersion: '5.2.3',
          objects: [],
        }));
        return { code: 0, stdout: '', stderr: '' };
      },
    });

    expect(calls[0]).toEqual(expect.arrayContaining([
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--report',
      reportPath,
    ]));
    expect(calls[0]).not.toContain('user expression');
    expect(report.blenderVersion).toBe('5.2.3');
    expect((await readFile(outputPath)).byteLength).toBe(32);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('maps USD timeout without leaking process output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-timeout-'));
  try {
    await expect(runUsdBridge({
      inputPath: join(root, 'source.usda'),
      outputPath: join(root, 'raw.glb'),
      reportPath: join(root, 'report.json'),
    }, {
      blenderBinary: '/tmp/Blender',
      scriptPath: '/repo/usd-to-glb.py',
      timeoutMs: 1,
      runner: async () => ({
        code: null,
        stdout: '',
        stderr: 'private absolute path',
        timedOut: true,
      }),
    })).rejects.toThrow('ICE3_TOOL_USD_TIMEOUT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('force-kills a USD bridge process that ignores SIGTERM', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-usd-kill-'));
  try {
    const executable = join(root, 'stubborn-blender');
    await writeFile(
      executable,
      '#!/bin/sh\ntrap "" TERM\nsleep 5\n',
    );
    await chmod(executable, 0o755);
    const started = Date.now();
    await expect(runUsdBridge({
      inputPath: join(root, 'source.usda'),
      outputPath: join(root, 'raw.glb'),
      reportPath: join(root, 'report.json'),
    }, {
      blenderBinary: executable,
      scriptPath: '/repo/usd-to-glb.py',
      timeoutMs: 50,
    })).rejects.toThrow('ICE3_TOOL_USD_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(1_500);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
