import type { ICEGeometryWorkspace } from '../createGeometryWorkspace.js';
import type { ICELodUnitPrimitive } from '../types.js';
import { collectFitSamples } from './collectFitSamples.js';
import {
  evaluateProxyCandidates,
  sortAcceptedProxyCandidates,
} from './evaluateProxy.js';
import { fitProxyGeometry } from './fitProxyGeometry.js';
import type {
  ICESemanticProxy,
  ICESemanticProxyFitSamples,
} from './types.js';

export interface ICESemanticProxyCreateOptions {
  readonly meshIndex: number;
  readonly sourceTriangles: number;
  readonly primitives: readonly ICELodUnitPrimitive[];
  readonly workspace: ICEGeometryWorkspace;
  readonly worldScale: number;
}

export interface ICESemanticProxyCreateResult {
  readonly proxy?: ICESemanticProxy;
  readonly rejectionReason?: string;
}

export async function createSemanticProxy(
  options: ICESemanticProxyCreateOptions,
): Promise<ICESemanticProxyCreateResult> {
  validateOptions(options);
  if (options.sourceTriangles < 64) {
    return { rejectionReason: 'too_few_triangles' };
  }
  const geometries = await Promise.all(options.primitives.map((primitive) => (
    options.workspace.read(primitive.workspaceKey)
  )));
  let samples: ICESemanticProxyFitSamples;
  let candidate: ReturnType<typeof sortAcceptedProxyCandidates>[number] | undefined;
  try {
    samples = collectFitSamples(geometries);
    const fitted = fitProxyGeometry(samples);
    if (fitted.candidates.length === 0) {
      return {
        rejectionReason: fitted.rejectionReasons[0] ?? 'fit_failed',
      };
    }
    const evaluated = evaluateProxyCandidates(
      samples,
      fitted.candidates,
      options.sourceTriangles,
    );
    candidate = sortAcceptedProxyCandidates(evaluated)[0];
    if (!candidate) {
      return {
        rejectionReason: evaluated.find((evaluation) => (
          evaluation.rejectionReason
        ))?.rejectionReason ?? 'quality_threshold',
      };
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith('ICE3_TOOL_PROXY_FIT_INVALID:')
    ) {
      return {
        rejectionReason: error.message.slice(
          'ICE3_TOOL_PROXY_FIT_INVALID:'.length,
        ).trim(),
      };
    }
    throw error;
  }

  const materialIndex = dominantMaterial(options.primitives);
  const averagedColor = averageColors(options.primitives, geometries);
  const colors = averagedColor
    ? new Float32Array(candidate.candidate.positions.length)
    : undefined;
  if (colors && averagedColor) {
    for (let vertex = 0; vertex < colors.length / 3; vertex += 1) {
      colors.set(averagedColor, vertex * 3);
    }
  }
  const geometryKey = `proxy:${options.meshIndex}:${candidate.candidate.kind}`;
  await options.workspace.write(geometryKey, {
    positions: candidate.candidate.positions,
    indices: candidate.candidate.indices,
    ...(colors ? { colors } : {}),
  });
  const errorMeters = candidate.normalizedMaximumDeviation
    * diagonal(samples)
    * options.worldScale;
  return {
    proxy: {
      id: `${options.meshIndex}:${candidate.candidate.kind}`,
      kind: candidate.candidate.kind,
      meshIndex: options.meshIndex,
      triangleCount: candidate.candidate.triangleCount,
      normalizedMaximumDeviation: candidate.normalizedMaximumDeviation,
      volumeInflation: candidate.volumeInflation,
      errorMeters,
      ...(materialIndex === undefined ? {} : { materialIndex }),
      geometryKey,
      ...(colors ? { colors } : {}),
    },
  };
}

function validateOptions(options: ICESemanticProxyCreateOptions): void {
  if (
    !Number.isInteger(options.meshIndex)
    || options.meshIndex < 0
    || !Number.isInteger(options.sourceTriangles)
    || options.sourceTriangles < 1
    || options.primitives.length === 0
    || !Number.isFinite(options.worldScale)
    || options.worldScale <= 0
  ) {
    throw new Error('ICE3_TOOL_PROXY_FIT_INVALID: proxy options are invalid');
  }
}

function dominantMaterial(
  primitives: readonly ICELodUnitPrimitive[],
): number | undefined {
  return [...primitives].sort((left, right) => (
    right.triangleCount - left.triangleCount
      || (left.materialIndex ?? -1) - (right.materialIndex ?? -1)
  ))[0]!.materialIndex;
}

function averageColors(
  primitives: readonly ICELodUnitPrimitive[],
  geometries: readonly {
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly colors?: Float32Array;
  }[],
): Float32Array | undefined {
  if (geometries.some((geometry) => !geometry.colors)) return undefined;
  const total = [0, 0, 0];
  let weight = 0;
  for (let index = 0; index < primitives.length; index += 1) {
    const geometry = geometries[index]!;
    const average = averagePrimitiveColor(geometry);
    const primitiveWeight = primitives[index]!.triangleCount;
    for (let channel = 0; channel < 3; channel += 1) {
      total[channel] = total[channel]!
        + primitiveWeight * average[channel]!;
    }
    weight += primitiveWeight;
  }
  return new Float32Array(total.map((value) => value / weight));
}

function averagePrimitiveColor(geometry: {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
}): readonly [number, number, number] {
  const colors = geometry.colors!;
  const vertexCount = geometry.positions.length / 3;
  const components = colors.length / vertexCount;
  if (
    (components !== 3 && components !== 4)
    || !Number.isInteger(components)
    || colors.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('ICE3_TOOL_PROXY_FIT_INVALID: vertex color count is invalid');
  }
  const total = [0, 0, 0];
  let totalArea = 0;
  for (let offset = 0; offset < geometry.indices.length; offset += 3) {
    const triangle = [
      geometry.indices[offset]!,
      geometry.indices[offset + 1]!,
      geometry.indices[offset + 2]!,
    ] as const;
    const a = point(geometry.positions, triangle[0]);
    const b = point(geometry.positions, triangle[1]);
    const c = point(geometry.positions, triangle[2]);
    const ab = subtract(b, a);
    const ac = subtract(c, a);
    const area = Math.hypot(
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ) / 2;
    if (area <= 1e-12) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const triangleColor = triangle.reduce((sum, vertex) => (
        sum + colors[vertex * components + channel]!
      ), 0) / 3;
      total[channel] = total[channel]! + area * triangleColor;
    }
    totalArea += area;
  }
  if (totalArea <= 0) {
    throw new Error('ICE3_TOOL_PROXY_FIT_INVALID: vertex color geometry is degenerate');
  }
  return total.map((value) => value / totalArea) as unknown as [
    number,
    number,
    number,
  ];
}

function point(
  positions: Float32Array,
  index: number,
): readonly [number, number, number] {
  return [
    positions[index * 3]!,
    positions[index * 3 + 1]!,
    positions[index * 3 + 2]!,
  ];
}

function subtract(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  ];
}

function diagonal(samples: ICESemanticProxyFitSamples): number {
  return Math.hypot(
    samples.bounds.max[0] - samples.bounds.min[0],
    samples.bounds.max[1] - samples.bounds.min[1],
    samples.bounds.max[2] - samples.bounds.min[2],
  );
}

export type {
  ICESemanticProxy,
} from './types.js';
