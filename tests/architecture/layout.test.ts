import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expect } from '#test-expect';

test('workspace contains an isolated preprocessing core and CLI', () => {
  expect(existsSync('packages/toolchain-core/package.json')).toBe(true);
  expect(existsSync('packages/cli/package.json')).toBe(true);
  expect(existsSync('packages/step-importer/package.json')).toBe(true);
  expect(existsSync('packages/ifc-importer/package.json')).toBe(true);
  expect(existsSync('packages/fbx-importer/package.json')).toBe(true);
  expect(existsSync('packages/usd-importer/package.json')).toBe(true);

  const root = JSON.parse(readFileSync('package.json', 'utf8')) as {
    private?: boolean;
    workspaces?: string[];
  };
  expect(root.private).toBe(true);
  expect(root.workspaces).toEqual(['packages/*']);

  const stepImporter = JSON.parse(
    readFileSync('packages/step-importer/package.json', 'utf8'),
  ) as {
    private?: boolean;
    dependencies?: Record<string, string>;
  };
  expect(stepImporter.private).toBe(true);
  expect(stepImporter.dependencies?.['occt-import-js']).toBe('0.0.23');

  const ifcImporter = JSON.parse(
    readFileSync('packages/ifc-importer/package.json', 'utf8'),
  ) as {
    private?: boolean;
    dependencies?: Record<string, string>;
  };
  expect(ifcImporter.private).toBe(true);
  expect(ifcImporter.dependencies?.['web-ifc']).toBe('0.0.78');

  const core = JSON.parse(
    readFileSync('packages/toolchain-core/package.json', 'utf8'),
  ) as { dependencies?: Record<string, string> };
  expect(core.dependencies?.['web-ifc']).toBeUndefined();

  const cli = JSON.parse(
    readFileSync('packages/cli/package.json', 'utf8'),
  ) as { dependencies?: Record<string, string> };
  expect(cli.dependencies?.['web-ifc']).toBe('0.0.78');

  const fbxImporter = JSON.parse(
    readFileSync('packages/fbx-importer/package.json', 'utf8'),
  ) as {
    private?: boolean;
    dependencies?: Record<string, string>;
  };
  expect(fbxImporter.private).toBe(true);
  expect(fbxImporter.dependencies?.['assimpjs']).toBe('0.0.10');
  expect(fbxImporter.dependencies?.blender).toBeUndefined();
  expect(cli.dependencies?.['assimpjs']).toBe('0.0.10');

  const usdImporter = JSON.parse(
    readFileSync('packages/usd-importer/package.json', 'utf8'),
  ) as {
    private?: boolean;
    dependencies?: Record<string, string>;
  };
  expect(usdImporter.private).toBe(true);
  expect(usdImporter.dependencies?.blender).toBeUndefined();
  expect(cli.dependencies?.['@ice3/usd-importer']).toBe('0.0.0');
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
