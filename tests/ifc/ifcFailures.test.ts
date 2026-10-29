import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { expect } from '#test-expect';
import * as mockApi from '#test-mocks';
import { runCli } from '../../packages/cli/src/commands.js';

const directories: string[] = [];

afterEach(async () => {
  mockApi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

test('reports stable IFC failures without publishing output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-ifc-failures-'));
  directories.push(root);
  const errors: string[] = [];
  mockApi.spyOn(console, 'error').mockImplementation((value) => {
    errors.push(String(value));
  });

  const cases = [
    ['ifc4-legacy.ifc', 'ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED'],
    ['truncated.ifc', 'ICE3_TOOL_IFC_IMPORT_FAILED'],
    ['empty-model.ifc', 'ICE3_TOOL_IMPORT_EMPTY_GEOMETRY'],
    ['unsupported-unit.ifc', 'ICE3_TOOL_IFC_UNIT_UNSUPPORTED'],
  ] as const;
  for (const [fixture, code] of cases) {
    errors.length = 0;
    const output = join(root, `${fixture}.glb`);
    expect(await runCli([
      'import',
      join('tests/fixtures/ifc', fixture),
      '--output',
      output,
      '--asset-id',
      fixture,
      '--adapter',
      'ifc',
    ])).toBe(1);
    expect(errors.join('\n')).toContain(code);
    await expect(access(output)).rejects.toThrow();
  }
});
