import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expect } from '#test-expect';

test('workspace contains an isolated preprocessing core and CLI', () => {
  expect(existsSync('packages/toolchain-core/package.json')).toBe(true);
  expect(existsSync('packages/cli/package.json')).toBe(true);

  const root = JSON.parse(readFileSync('package.json', 'utf8')) as {
    private?: boolean;
    workspaces?: string[];
  };
  expect(root.private).toBe(true);
  expect(root.workspaces).toEqual(['packages/*']);
});
