import { expect } from '#test-expect';
import { test } from 'node:test';
import { createPublicPackageManifest } from '../../scripts/build-release-package.mjs';

test('publishes the bundled toolchain as one scoped CLI package', () => {
  const manifest = createPublicPackageManifest();

  expect(manifest.name).toBe('@ice3/toolchain');
  expect(manifest.version).toBe('0.1.0');
  expect(manifest.private).toBeUndefined();
  expect(manifest.bin).toEqual({
    'ice3-tool': 'dist/main.js',
  });
  expect(manifest.dependencies).toEqual({
    '@gltf-transform/core': '4.5.1',
    '@gltf-transform/extensions': '4.5.1',
    '@gltf-transform/functions': '4.5.1',
    'draco3dgltf': '1.5.9',
    'meshoptimizer': '1.3.0',
  });
});
