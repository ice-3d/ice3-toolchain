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
  runFbxBridge,
} from '../../packages/fbx-importer/src/runBridge.js';

test('passes paths as separate arguments and reads a private report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-bridge-'));
  try {
    const inputPath = join(root, 'source.fbx');
    const outputPath = join(root, 'raw.glb');
    const reportPath = join(root, 'report.json');
    await writeFile(inputPath, 'synthetic');
    const calls: readonly string[][] = [];
    const report = await runFbxBridge({
      inputPath,
      outputPath,
      reportPath,
    }, {
      blenderBinary: '/tmp/Blender',
      scriptPath: '/repo/fbx-to-glb.py',
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

test('maps bridge timeout without leaking process output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-timeout-'));
  try {
    await expect(runFbxBridge({
      inputPath: join(root, 'source.fbx'),
      outputPath: join(root, 'raw.glb'),
      reportPath: join(root, 'report.json'),
    }, {
      blenderBinary: '/tmp/Blender',
      scriptPath: '/repo/fbx-to-glb.py',
      timeoutMs: 1,
      runner: async () => ({
        code: null,
        stdout: '',
        stderr: 'private absolute path',
        timedOut: true,
      }),
    })).rejects.toThrow('ICE3_TOOL_FBX_TIMEOUT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('force-kills a bridge process that ignores SIGTERM', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-fbx-kill-'));
  try {
    const executable = join(root, 'stubborn-blender');
    await writeFile(
      executable,
      '#!/bin/sh\ntrap "" TERM\nsleep 5\n',
    );
    await chmod(executable, 0o755);
    const started = Date.now();
    await expect(runFbxBridge({
      inputPath: join(root, 'source.fbx'),
      outputPath: join(root, 'raw.glb'),
      reportPath: join(root, 'report.json'),
    }, {
      blenderBinary: executable,
      scriptPath: '/repo/fbx-to-glb.py',
      timeoutMs: 50,
    })).rejects.toThrow('ICE3_TOOL_FBX_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(1_500);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
