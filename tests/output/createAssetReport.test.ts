import { expect, test } from 'node-test';
import { createAssetReport } from '../../packages/toolchain-core/src/output/createAssetReport';

test('creates a deterministic report without source paths', () => {
  const metrics = {
    encodedBytes: 400,
    jsonChunkBytes: 100,
    binChunkBytes: 300,
    nodeCount: 1,
    maxNodeDepth: 0,
    meshCount: 1,
    primitiveCount: 2,
    triangleCount: 1,
    edgeSegmentCount: 3,
    materialCount: 2,
    selectionGroupCount: 1,
  };
  const budget = {
    profile: 'interactive-desktop-v1',
    status: 'pass' as const,
    warningCount: 0,
    errorCount: 0,
    checks: [],
  };
  const report = createAssetReport({
    toolVersion: '0.0.0',
    sourceFormat: 'gltf-2.0',
    sourceDigest: `sha256:${'a'.repeat(64)}`,
    assetId: 'sample',
    profileVersion: '1.0',
    contractVersion: '1.0',
    contentDigest: `sha256:${'b'.repeat(64)}`,
    metrics,
    budget,
    diagnostics: [],
  });
  expect(report.kind).toBe('ice3-asset-report');
  expect(report.status).toBe('pass');
  expect(JSON.stringify(report)).not.toContain('/Users/');
  expect(JSON.stringify(report)).not.toContain('sourcePath');
});
