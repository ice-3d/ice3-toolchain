import type { ICEAssetMetrics } from './assetContract.js';

export interface ICEBudgetLimit {
  readonly id: keyof Omit<ICEAssetMetrics, 'jsonChunkBytes' | 'binChunkBytes'>;
  readonly label: string;
  readonly softLimit: number;
  readonly hardLimit: number;
}

export interface ICEBudgetProfile {
  readonly id: string;
  readonly limits: readonly ICEBudgetLimit[];
}

export interface ICEBudgetCheck {
  readonly id: string;
  readonly metric: string;
  readonly value: number;
  readonly softLimit: number;
  readonly hardLimit: number;
  readonly status: 'pass' | 'warning' | 'error';
}

export interface ICEBudgetResult {
  readonly profile: string;
  readonly status: 'pass' | 'warning' | 'error';
  readonly warningCount: number;
  readonly errorCount: number;
  readonly checks: readonly ICEBudgetCheck[];
}

const METRIC_IDS = new Set<ICEBudgetLimit['id']>([
  'encodedBytes',
  'nodeCount',
  'maxNodeDepth',
  'meshCount',
  'primitiveCount',
  'triangleCount',
  'edgeSegmentCount',
  'materialCount',
  'selectionGroupCount',
]);

const CHECK_IDS: Partial<Record<ICEBudgetLimit['id'], string>> = {
  nodeCount: 'nodes',
  meshCount: 'meshes',
  primitiveCount: 'primitives',
  triangleCount: 'triangles',
  edgeSegmentCount: 'edges',
  selectionGroupCount: 'selectionGroups',
};

const limit = (
  id: ICEBudgetLimit['id'],
  label: string,
  softLimit: number,
  hardLimit: number,
): ICEBudgetLimit => Object.freeze({
  id,
  label,
  softLimit,
  hardLimit,
});

export const BUDGET_PROFILES: Readonly<Record<string, ICEBudgetProfile>> =
  Object.freeze({
    'interactive-desktop-v1': Object.freeze({
      id: 'interactive-desktop-v1',
      limits: Object.freeze([
        limit('nodeCount', 'Nodes', 25_000, 50_000),
        limit('meshCount', 'Meshes', 5_000, 15_000),
        limit('primitiveCount', 'Primitives', 10_000, 30_000),
        limit('triangleCount', 'Triangles', 5_000_000, 20_000_000),
        limit('edgeSegmentCount', 'Edge segments', 10_000_000, 40_000_000),
        limit('encodedBytes', 'Encoded bytes', 134_217_728, 536_870_912),
        limit('selectionGroupCount', 'Selection groups', 20_000, 100_000),
      ]),
    }),
    unrestricted: Object.freeze({
      id: 'unrestricted',
      limits: Object.freeze([]),
    }),
  });

export function evaluateAssetBudget(
  metrics: ICEAssetMetrics,
  budget: ICEBudgetProfile,
): ICEBudgetResult {
  const checks = budget.limits.map((entry): ICEBudgetCheck => {
    const value = metrics[entry.id];
    return {
      id: CHECK_IDS[entry.id] ?? entry.id,
      metric: entry.id,
      value,
      softLimit: entry.softLimit,
      hardLimit: entry.hardLimit,
      status: value > entry.hardLimit
        ? 'error'
        : value > entry.softLimit ? 'warning' : 'pass',
    };
  });
  const errorCount = checks.filter((check) => check.status === 'error').length;
  const warningCount = checks.filter((check) => check.status === 'warning').length;
  return {
    profile: budget.id,
    status: errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'pass',
    warningCount,
    errorCount,
    checks,
  };
}

export function validateBudgetProfile(value: unknown): ICEBudgetProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidBudget();
  }
  const source = value as Record<string, unknown>;
  if (typeof source.id !== 'string' || !source.id.trim()) {
    throw invalidBudget();
  }
  if (!Array.isArray(source.limits)) {
    throw invalidBudget();
  }
  const ids = new Set<string>();
  const limits = source.limits.map((entry): ICEBudgetLimit => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw invalidBudget();
    }
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== 'string'
      || !METRIC_IDS.has(item.id as ICEBudgetLimit['id'])
      || ids.has(item.id)
      || !isLimit(item.softLimit)
      || !isLimit(item.hardLimit)
      || item.softLimit > item.hardLimit
    ) {
      throw invalidBudget();
    }
    ids.add(item.id);
    return limit(
      item.id as ICEBudgetLimit['id'],
      typeof item.label === 'string' && item.label.trim()
        ? item.label.trim()
        : item.id,
      item.softLimit,
      item.hardLimit,
    );
  });
  return Object.freeze({
    id: source.id.trim(),
    limits: Object.freeze(limits),
  });
}

function isLimit(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && Number.isFinite(value)
    && value >= 0;
}

function invalidBudget(): Error {
  return new Error('ICE3_TOOL_INVALID_BUDGET: invalid asset budget profile');
}
