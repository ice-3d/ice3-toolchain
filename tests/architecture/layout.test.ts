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

test('GLB authoring stays inside build-time tooling', () => {
  const root = JSON.parse(readFileSync('package.json', 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  expect(root.devDependencies?.['@gltf-transform/core']).toBe('4.5.1');

  const core = JSON.parse(
    readFileSync('packages/toolchain-core/package.json', 'utf8'),
  ) as { dependencies?: Record<string, string> };
  expect(core.dependencies?.['@gltf-transform/core']).toBe('4.5.1');

  const cli = JSON.parse(
    readFileSync('packages/cli/package.json', 'utf8'),
  ) as { dependencies?: Record<string, string> };
  expect(cli.dependencies?.['@gltf-transform/core']).toBeUndefined();
});

test('workspace root remains a private orchestration manifest', () => {
  const root = JSON.parse(readFileSync('package.json', 'utf8')) as {
    description?: string;
    main?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  expect(root.description).toBeUndefined();
  expect(root.main).toBeUndefined();
  expect(root.dependencies ?? {}).toEqual({});
  expect(root.devDependencies?.esbuild).toBe('^0.28.2');
  expect(root.scripts?.['release:package']).toBe(
    'npm run build && node scripts/build-release-package.mjs',
  );
});
