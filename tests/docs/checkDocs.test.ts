import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { checkRepository } from '../../scripts/check-docs.mjs';

test('Chinese specifications do not require an English summary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-policy-'));
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'README.md'), [
      '# 测试文档',
      '',
      '> Document ID: ICE3-TOOL-RM-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: ICE3 Toolchain maintainers',
      '',
      '[文档索引](docs/README.md)',
      '',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'README.md'), [
      '# 测试文档索引',
      '',
      '> Document ID: ICE3-TOOL-IDX-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: ICE3 Toolchain maintainers',
      '',
      '- [仓库说明](../README.md)',
      '- [源模型导入规格](source-import.md)',
      '',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'source-import.md'), [
      '# 源模型导入规格',
      '',
      '> Document ID: ICE3-TOOL-SPEC-001',
      '>',
      '> Status: Approved',
      '>',
      '> Owner: ICE3 Toolchain maintainers',
      '',
      '## 目标',
      '',
      '本文档只使用中文正文。',
      '',
    ].join('\n'));

    const report = await checkRepository(root, {
      expectedArea: 'TOOL',
    });

    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
