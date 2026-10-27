import { expect, test } from 'node-test';
import type { ICEAssetMetrics } from '../../packages/toolchain-core/src/output/assetContract';
import {
  BUDGET_PROFILES,
  evaluateAssetBudget,
  validateBudgetProfile,
} from '../../packages/toolchain-core/src/output/evaluateAssetBudget';

const metrics = (triangleCount: number): ICEAssetMetrics => ({
  encodedBytes: 100,
  jsonChunkBytes: 20,
  binChunkBytes: 80,
  nodeCount: 1,
  maxNodeDepth: 0,
  meshCount: 1,
  primitiveCount: 2,
  triangleCount,
  edgeSegmentCount: 0,
  materialCount: 1,
  selectionGroupCount: 1,
});

test('classifies soft and hard limits inclusively', () => {
  const budget = BUDGET_PROFILES['interactive-desktop-v1']!;
  expect(evaluateAssetBudget(metrics(5_000_000), budget).status).toBe('pass');
  expect(evaluateAssetBudget(metrics(5_000_001), budget).status).toBe('warning');
  expect(evaluateAssetBudget(metrics(20_000_000), budget).status).toBe('warning');
  expect(evaluateAssetBudget(metrics(20_000_001), budget).status).toBe('error');
});

test('reports every check with stable IDs', () => {
  const result = evaluateAssetBudget(
    metrics(5_000_001),
    BUDGET_PROFILES['interactive-desktop-v1']!,
  );
  expect(result.checks.map((check) => check.id)).toContain('triangles');
  expect(result.warningCount).toBeGreaterThan(0);
  expect(result.errorCount).toBe(0);
});

test('rejects malformed custom budget profiles', () => {
  expect(() => validateBudgetProfile({
    id: 'custom',
    limits: [{ id: 'triangleCount', softLimit: 10, hardLimit: 5 }],
  })).toThrow(/ICE3_TOOL_INVALID_BUDGET/);
});
