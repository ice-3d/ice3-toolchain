import type { ICEAssetMetrics } from './assetContract.js';
import type { ICEBudgetResult } from './evaluateAssetBudget.js';

export interface ICEAssetReportDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly path?: string;
}

export interface ICEAssetReportInput {
  readonly toolVersion: string;
  readonly sourceFormat: 'gltf-2.0' | 'ice3-prepared';
  readonly sourceDigest: string;
  readonly assetId: string;
  readonly profileVersion: string;
  readonly contractVersion: string;
  readonly contentDigest: string;
  readonly metrics: ICEAssetMetrics;
  readonly budget: ICEBudgetResult;
  readonly diagnostics: readonly ICEAssetReportDiagnostic[];
}

export interface ICEAssetReport {
  readonly kind: 'ice3-asset-report';
  readonly schemaVersion: '1.0';
  readonly asset: Readonly<{
    id: string;
    profileVersion: string;
    contractVersion: string;
    contentDigest: string;
  }>;
  readonly status: 'pass' | 'warning' | 'error';
  readonly tool: Readonly<{ name: 'ice3-toolchain'; version: string }>;
  readonly source: Readonly<{
    format: 'gltf-2.0' | 'ice3-prepared';
    digest: string;
  }>;
  readonly metrics: ICEAssetMetrics;
  readonly budget: ICEBudgetResult;
  readonly diagnostics: readonly ICEAssetReportDiagnostic[];
}

export function createAssetReport(input: ICEAssetReportInput): ICEAssetReport {
  const diagnostics = [...input.diagnostics].sort((left, right) => (
    left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message)
    || (left.path ?? '').localeCompare(right.path ?? '')
  ));
  const hasError = input.budget.errorCount > 0
    || diagnostics.some((item) => item.severity === 'error');
  const hasWarning = input.budget.warningCount > 0
    || diagnostics.some((item) => item.severity === 'warning');
  return {
    kind: 'ice3-asset-report',
    schemaVersion: '1.0',
    asset: {
      id: input.assetId,
      profileVersion: input.profileVersion,
      contractVersion: input.contractVersion,
      contentDigest: input.contentDigest,
    },
    status: hasError ? 'error' : hasWarning ? 'warning' : 'pass',
    tool: { name: 'ice3-toolchain', version: input.toolVersion },
    source: {
      format: input.sourceFormat,
      digest: input.sourceDigest,
    },
    metrics: { ...input.metrics },
    budget: {
      ...input.budget,
      checks: [...input.budget.checks],
    },
    diagnostics,
  };
}
