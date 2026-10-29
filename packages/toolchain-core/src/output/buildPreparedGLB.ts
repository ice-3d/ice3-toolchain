import { createHash } from 'node:crypto';
import type { ICESourceDocument } from '../source/readSource.js';
import { readAccessor } from '../source/readAccessor.js';
import { bakeLocalMatrix, type ICEMatrix4Tuple } from '../scene/bakeMatrix.js';
import {
  collectNodeWorldMatrices,
  multiplyMatrices,
  transformBounds,
} from '../scene/nodeMatrices.js';
import { prepareMesh } from '../scene/prepareMesh.js';
import { validateSource } from '../scene/validateSource.js';
import {
  contractStats,
  type ICEAssetContract,
  type ICEAssetContractStats,
  type ICEAssetMetrics,
} from './assetContract.js';
import {
  BUDGET_PROFILES,
  evaluateAssetBudget,
  type ICEBudgetProfile,
  type ICEBudgetResult,
} from './evaluateAssetBudget.js';
import {
  buildRenderBatches,
  type ICEToolRenderBatchMetadata,
} from './buildRenderBatches.js';

export interface ICEBuildOptions {
  readonly assetId: string;
  readonly selectionIdAssetId?: string;
  readonly geometryOverrides?: ReadonlyMap<string, ICEGeometryOverride>;
  readonly meshOverrides?: ReadonlyMap<number, ICEPreparedMeshOverride>;
  readonly creaseAngleDegrees?: number;
  readonly edges?: boolean;
  readonly budget?: ICEBudgetProfile;
  readonly selection?: ICEBuildSelection;
  readonly renderBatching?: {
    readonly mode: 'static' | 'off';
    readonly maxTrianglesPerBatch?: number;
    readonly maxBytesPerBatch?: number;
  };
}

export interface ICEGeometryOverride {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
}

export interface ICEPreparedMeshOverride {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly materialIndex?: number;
  readonly colors?: Float32Array;
}

export interface ICEBuildSelection {
  readonly nodeIndices: readonly number[];
  readonly flattenWorldTransforms: boolean;
}

export interface ICEPreparedGLB {
  readonly bytes: Uint8Array;
  readonly stats: ICEAssetContractStats;
  readonly metrics: ICEAssetMetrics;
  readonly budget: ICEBudgetResult;
  readonly contentDigest: string;
  readonly renderBatching?: {
    readonly inputPrimitiveCount: number;
    readonly batchCount: number;
    readonly triangleCount: number;
    readonly byteLength: number;
    readonly fallbackPrimitiveCount: number;
  };
}

type JSONRecord = Record<string, unknown>;

interface BufferView {
  readonly buffer: 0;
  readonly byteOffset: number;
  readonly byteLength: number;
}

interface Accessor {
  readonly bufferView: number;
  readonly componentType: 5123 | 5125 | 5126;
  readonly count: number;
  readonly type: 'SCALAR' | 'VEC3';
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

export function buildPreparedGLB(
  source: ICESourceDocument,
  options: ICEBuildOptions,
): ICEPreparedGLB {
  const assetId = options.assetId.trim();
  if (!assetId) {
    throw new Error('ICE3_TOOL_INVALID_OPTIONS: assetId must not be empty');
  }
  const report = validateSource(source);
  if (report.errors.length > 0) {
    throw new Error(`ICE3_TOOL_SOURCE_UNSUPPORTED: ${report.errors.join(', ')}`);
  }
  const creaseAngleDegrees = options.creaseAngleDegrees ?? 30;
  const selectionIdAssetId = options.selectionIdAssetId?.trim() ?? assetId;
  const sourceNodes = records(source.json.nodes);
  const sourceMeshes = records(source.json.meshes);
  const sourceScene = records(source.json.scenes)[Number(source.json.scene ?? 0)];
  if (!sourceScene) {
    throw new Error('ICE3_TOOL_INVALID_SOURCE: active scene is missing');
  }
  const selectedNodeIndices = options.selection
    ? validateNodeSelection(options.selection.nodeIndices, sourceNodes.length)
    : sourceNodes.map((_node, index) => index);
  const selectedNodes = new Set(selectedNodeIndices);
  const worldMatrices = options.selection
    ? collectNodeWorldMatrices(source)
    : undefined;

  const materialEntries = records(source.json.materials);
  const renderBatching = options.renderBatching?.mode === 'static'
    ? buildRenderBatches(source, selectedNodeIndices, {
        mode: 'static',
        maxTrianglesPerBatch:
          options.renderBatching.maxTrianglesPerBatch ?? 500_000,
        maxBytesPerBatch:
          options.renderBatching.maxBytesPerBatch ?? 33_554_432,
        selectionIdAssetId,
        nodeIdPrefix: `${assetId}/node`,
        ...(options.geometryOverrides
          ? { geometryOverrides: options.geometryOverrides }
          : {}),
        ...(options.meshOverrides
          ? { meshOverrides: options.meshOverrides }
          : {}),
      })
    : undefined;
  const outputMaterials: JSONRecord[] = [];
  const baseMaterialIndices: number[] = [];
  const edgeMaterialIndices: number[] = [];
  const linearMaterialColors: number[][] = [];
  for (const [index, material] of materialEntries.entries()) {
    const pbr = record(material.pbrMetallicRoughness);
    const linearColor = numbers(pbr?.baseColorFactor, 4) ?? [0.5, 0.5, 0.5, 1];
    linearMaterialColors[index] = [...linearColor];
    const displayColor = linearColor.slice(0, 3).map(linearToSrgb);
    const extras = record(material.extras);
    const iceExtras = record(extras?.ice3);
    const edgeColor = typeof iceExtras?.edgeColor === 'string'
      ? iceExtras.edgeColor
      : '#e6f2ff';
    baseMaterialIndices[index] = outputMaterials.length;
    outputMaterials.push({
      name: typeof material.name === 'string' ? material.name : `material-${index}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...displayColor, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      extras: { ice3: { id: `${assetId}/material/${index}` } },
    });
    edgeMaterialIndices[index] = outputMaterials.length;
    outputMaterials.push({
      name: `${typeof material.name === 'string' ? material.name : `material-${index}`} edges`,
      pbrMetallicRoughness: {
        baseColorFactor: hexToRgba(edgeColor),
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      extras: { ice3: { id: `${assetId}/material/${index}/edges` } },
    });
  }
  baseMaterialIndices.push(outputMaterials.length);
  linearMaterialColors.push([0.5, 0.5, 0.5, 1]);
  const defaultDisplayColor = [0.5, 0.5, 0.5].map(linearToSrgb);
  outputMaterials.push({
    name: 'default',
    pbrMetallicRoughness: {
      baseColorFactor: [...defaultDisplayColor, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    extras: { ice3: { id: `${assetId}/material/default` } },
  });
  edgeMaterialIndices.push(outputMaterials.length);
  outputMaterials.push({
    name: 'default edges',
    pbrMetallicRoughness: {
      baseColorFactor: hexToRgba('#e6f2ff'),
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    extras: { ice3: { id: `${assetId}/material/default/edges` } },
  });
  const vertexColorMaterialIndex = outputMaterials.length;
  outputMaterials.push({
    name: 'vertex colors',
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    extras: { ice3: { id: `${assetId}/material/vertex-colors` } },
  });

  const binaryParts: Buffer[] = [];
  const bufferViews: BufferView[] = [];
  const accessors: Accessor[] = [];
  const outputMeshes: JSONRecord[] = [];
  const sourceMeshToOutputMesh = new Map<number, number>();
  let binaryLength = 0;
  let primitiveCount = 0;
  let triangleCount = 0;
  let edgeSegmentCount = 0;
  const selectionNodes = new Set<number>();

  const append = (bytes: Uint8Array): number => {
    const padding = (4 - (binaryLength % 4)) % 4;
    if (padding > 0) {
      binaryParts.push(Buffer.alloc(padding));
      binaryLength += padding;
    }
    const view = {
      buffer: 0 as const,
      byteOffset: binaryLength,
      byteLength: bytes.byteLength,
    };
    bufferViews.push(view);
    binaryParts.push(Buffer.from(bytes));
    binaryLength += bytes.byteLength;
    return bufferViews.length - 1;
  };

  const appendPrimitive = (options_: {
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly sourceMaterial: number;
    readonly colors?: Float32Array;
    readonly semanticIndices?: Uint32Array;
    readonly mode: 4 | 5 | 6;
    readonly id: string;
    readonly primitives: JSONRecord[];
  }): void => {
    if (
      !Number.isInteger(options_.sourceMaterial)
      || options_.sourceMaterial < 0
      || options_.sourceMaterial > materialEntries.length
    ) {
      throw new Error('ICE3_TOOL_INVALID_GEOMETRY: material index is invalid');
    }
    const prepared = prepareMesh(
      options_.positions,
      options_.indices,
      creaseAngleDegrees,
      {
        id: options_.id,
        mode: options_.mode,
        generateEdges: options.edges !== false,
      },
    );
    const positionView = append(new Uint8Array(prepared.positions.buffer));
    let colorAccessorIndex: number | undefined;
    if (options_.colors) {
      const components = options_.colors.length
        / (prepared.positions.length / 3);
      if (
        (components !== 3 && components !== 4)
        || options_.colors.length / components !== prepared.positions.length / 3
      ) {
        throw new Error('ICE3_TOOL_INVALID_GEOMETRY: COLOR_0 must match POSITION');
      }
      const base = linearMaterialColors[options_.sourceMaterial] ?? [1, 1, 1, 1];
      const displayColors = new Float32Array(prepared.positions.length);
      for (let vertex = 0; vertex < displayColors.length / 3; vertex += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
          displayColors[vertex * 3 + channel] = linearToSrgb(
            base[channel]!
              * options_.colors[vertex * components + channel]!,
          );
        }
      }
    const colorView = append(new Uint8Array(displayColors.buffer));
      colorAccessorIndex = accessors.length;
      accessors.push({
        bufferView: colorView,
        componentType: 5126,
        count: displayColors.length / 3,
        type: 'VEC3',
      });
    }
    let semanticAccessorIndex: number | undefined;
    if (options_.semanticIndices) {
      if (options_.semanticIndices.length !== prepared.positions.length / 3) {
        throw new Error(
          'ICE3_TOOL_INVALID_GEOMETRY: semantic indices must match POSITION',
        );
      }
      const semanticView = append(
        new Uint8Array(options_.semanticIndices.buffer),
      );
      semanticAccessorIndex = accessors.length;
      accessors.push({
        bufferView: semanticView,
        componentType: 5125,
        count: options_.semanticIndices.length,
        type: 'SCALAR',
      });
    }
    const triangleView = append(new Uint8Array(prepared.indices.buffer));
    const edgeView = append(new Uint8Array(prepared.edgeIndices.buffer));
    const positionAccessorIndex = accessors.length;
    accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: prepared.positions.length / 3,
      type: 'VEC3',
      min: prepared.bounds.min,
      max: prepared.bounds.max,
    });
    const triangleAccessorIndex = accessors.length;
    accessors.push({
      bufferView: triangleView,
      componentType: prepared.indices instanceof Uint16Array ? 5123 : 5125,
      count: prepared.indices.length,
      type: 'SCALAR',
    });
    const edgeAccessorIndex = accessors.length;
    accessors.push({
      bufferView: edgeView,
      componentType: prepared.edgeIndices instanceof Uint16Array ? 5123 : 5125,
      count: prepared.edgeIndices.length,
      type: 'SCALAR',
    });
    options_.primitives.push({
      attributes: {
        POSITION: positionAccessorIndex,
        ...(colorAccessorIndex === undefined
          ? {}
          : { COLOR_0: colorAccessorIndex }),
        ...(semanticAccessorIndex === undefined
          ? {}
          : { _ICE3_SEMANTIC_INDEX: semanticAccessorIndex }),
      },
      indices: triangleAccessorIndex,
      material: colorAccessorIndex === undefined
        ? baseMaterialIndices[options_.sourceMaterial]!
        : vertexColorMaterialIndex,
      mode: 4,
    });
    if (prepared.edgeIndices.length > 0) {
      options_.primitives.push({
        attributes: { POSITION: positionAccessorIndex },
        indices: edgeAccessorIndex,
        material: edgeMaterialIndices[options_.sourceMaterial]!,
        mode: 1,
        extras: { ice3: { role: 'edges', widthPx: 3 } },
      });
    }
    triangleCount += prepared.indices.length / 3;
    edgeSegmentCount += prepared.edgeIndices.length / 2;
  };

  const batchMetadata: Array<ICEToolRenderBatchMetadata['batches'][number]> = [];
  if (renderBatching) {
    for (const [index, batch] of renderBatching.batches.entries()) {
      for (const owner of selectedNodeIndices) {
        if (sourceNodes[owner]?.mesh !== undefined) selectionNodes.add(owner);
      }
      const primitives: JSONRecord[] = [];
      const sourceMaterial = batch.sourceMaterialIndex ?? materialEntries.length;
      appendPrimitive({
        positions: batch.positions,
        indices: batch.indices,
        sourceMaterial,
        ...(batch.colors ? { colors: batch.colors } : {}),
        semanticIndices: batch.semanticIndices,
        mode: 4,
        id: `${assetId}/render-batch/${index}`,
        primitives,
      });
      const meshIndex = outputMeshes.length;
      outputMeshes.push({
        primitives,
        extras: { ice3: { id: `${assetId}/render-batch-mesh/${index}` } },
      });
      primitiveCount += primitives.length;
      batchMetadata.push({
        id: batch.id,
        mesh: meshIndex,
        primitive: 0,
        material: batch.colors
          ? vertexColorMaterialIndex
          : baseMaterialIndices[sourceMaterial]!,
        mode: 4,
        triangleCount: batch.triangleCount,
        bounds: batch.bounds,
      });
    }
  }
  if (!renderBatching) for (const [meshIndex, mesh] of sourceMeshes.entries()) {
    const primitives: JSONRecord[] = [];
    const nodeOwners = sourceNodes
      .map((node, index) => Number(node.mesh) === meshIndex ? index : -1)
      .filter((index) => index >= 0 && selectedNodes.has(index));
    if (nodeOwners.length === 0) continue;
    const meshOverride = options.meshOverrides?.get(meshIndex);
    if (meshOverride) {
      appendPrimitive({
        positions: meshOverride.positions,
        indices: meshOverride.indices,
        sourceMaterial: meshOverride.materialIndex ?? materialEntries.length,
        ...(meshOverride.colors ? { colors: meshOverride.colors } : {}),
        mode: 4,
        id: `${assetId}/geometry/${meshIndex}/proxy`,
        primitives,
      });
      for (const owner of nodeOwners) selectionNodes.add(owner);
      primitiveCount += primitives.length;
      sourceMeshToOutputMesh.set(meshIndex, outputMeshes.length);
      outputMeshes.push({
        primitives,
        extras: { ice3: { id: `${assetId}/mesh/${meshIndex}` } },
      });
      continue;
    }
    for (const [primitiveIndex, primitive] of records(mesh.primitives).entries()) {
      if (Number(primitive.mode ?? 4) === 1) {
        continue;
      }
      const attributes = record(primitive.attributes);
      const positionAccessor = Number(attributes?.POSITION);
      const positionData = readAccessor(source, positionAccessor);
      if (positionData.kind !== 'float32' || positionData.components !== 3) {
        throw new Error('ICE3_TOOL_INVALID_GEOMETRY: POSITION must be float VEC3');
      }
      const indexData = primitive.indices === undefined
        ? { kind: 'uint32' as const, components: 1, values: sequential(positionData.values.length / 3) }
        : readAccessor(source, Number(primitive.indices));
      if (indexData.components !== 1) {
        throw new Error('ICE3_TOOL_INVALID_GEOMETRY: indices must be SCALAR');
      }
      const override = options.geometryOverrides?.get(
        `${meshIndex}:${primitiveIndex}`,
      );
      const sourceMaterial = primitive.material === undefined
        ? materialEntries.length
        : Number(primitive.material);
      const colorAccessor = attributes?.COLOR_0;
      let colors: Float32Array | undefined;
      if (colorAccessor !== undefined) {
        const overrideVertexCount = (
          override?.positions ?? positionData.values
        ).length / 3;
        const colorData = override?.colors
          ? {
              components: override.colors.length / overrideVertexCount,
              values: override.colors,
            }
          : readAccessor(source, Number(colorAccessor));
        if (
          (
            !override?.colors
            && (
              !('kind' in colorData)
              || colorData.kind !== 'float32'
            )
          )
        ) {
          throw new Error('ICE3_TOOL_INVALID_GEOMETRY: COLOR_0 must match POSITION');
        }
        colors = Float32Array.from(colorData.values);
      }
      appendPrimitive({
        positions: override?.positions ?? positionData.values,
        indices: override?.indices ?? new Uint32Array(indexData.values),
        sourceMaterial,
        ...(colors ? { colors } : {}),
        mode: override
          ? 4
          : Number(primitive.mode ?? 4) as 4 | 5 | 6,
        id: `${assetId}/geometry/${meshIndex}/${primitiveIndex}`,
        primitives,
      });
      for (const owner of nodeOwners) {
        selectionNodes.add(owner);
      }
    }
    primitiveCount += primitives.length;
    sourceMeshToOutputMesh.set(meshIndex, outputMeshes.length);
    outputMeshes.push({
      primitives,
      extras: { ice3: { id: `${assetId}/mesh/${meshIndex}` } },
    });
  }

  const outputIndexBySource = new Map(
    selectedNodeIndices.map((sourceIndex, outputIndex) => (
      [sourceIndex, outputIndex] as const
    )),
  );
  const outputNodes = selectedNodeIndices.map((sourceIndex) => {
    const node = sourceNodes[sourceIndex]!;
    const semantic = record(record(node.extras)?.ice3);
    const semanticSelectionId = semantic?.selectionId;
    const ifcMetadata = record(semantic?.ifc);
    const fbxMetadata = record(semantic?.fbx);
    const businessMetadata = {
      ...(typeof semantic?.displayName === 'string'
        ? { displayName: semantic.displayName }
        : {}),
      ...(typeof semantic?.equipmentTag === 'string'
        ? { equipmentTag: semantic.equipmentTag }
        : {}),
      ...(typeof semantic?.processStage === 'string'
        ? { processStage: semantic.processStage }
        : {}),
      ...(typeof semantic?.area === 'string'
        ? { area: semantic.area }
        : {}),
      ...(Array.isArray(semantic?.ports)
        ? { ports: semantic.ports.filter((value): value is string => (
            typeof value === 'string'
          )) }
        : {}),
      ...(Array.isArray(semantic?.connections)
        ? { connections: semantic.connections.filter((value): value is string => (
            typeof value === 'string'
          )) }
        : {}),
      ...(ifcMetadata ? { ifc: ifcMetadata } : {}),
      ...(fbxMetadata ? { fbx: fbxMetadata } : {}),
    };
    const sourceMesh = node.mesh === undefined
      ? undefined
      : sourceMeshToOutputMesh.get(Number(node.mesh));
    const flatten = options.selection?.flattenWorldTransforms === true;
    const resolvedSelectionId = typeof semanticSelectionId === 'string'
      ? semanticSelectionId
      : renderBatching || options.selectionIdAssetId
        ? `${selectionIdAssetId}/node/${sourceIndex}`
        : undefined;
    return {
      name: typeof node.name === 'string' ? node.name : `node-${sourceIndex}`,
      matrix: flatten
        ? worldMatrices![sourceIndex]!
        : bakeLocalMatrix(
            numbers(node.matrix, 16),
            numbers(node.translation, 3),
            numbers(node.rotation, 4),
            numbers(node.scale, 3),
          ),
      ...(flatten || node.children === undefined
        ? {}
        : {
            children: integers(node.children)
              .filter((child) => outputIndexBySource.has(child))
              .map((child) => outputIndexBySource.get(child)!),
          }),
      ...(sourceMesh === undefined ? {} : { mesh: sourceMesh }),
      extras: {
        ice3: {
          id: `${assetId}/node/${sourceIndex}`,
          ...(resolvedSelectionId ? { selectionId: resolvedSelectionId } : {}),
          ...businessMetadata,
        },
      },
    };
  });
  const batchNodeIndices: number[] = [];
  if (renderBatching) {
    for (const [index, meshIndex] of batchMetadata.map((batch) => batch.mesh)
      .entries()) {
      batchNodeIndices.push(outputNodes.length);
      outputNodes.push({
        name: `render-batch-${index}`,
        matrix: identity(),
        mesh: meshIndex,
        extras: {
          ice3: {
            id: `${assetId}/render-batch-node/${
              renderBatching.semanticNodeIds[0]
            }/${index}`,
          },
        },
      });
    }
  }

  const bounds = options.selection
    ? computeSelectionBounds(
        source,
        sourceNodes,
        sourceMeshes,
        selectedNodeIndices,
        worldMatrices!,
        options.meshOverrides,
      )
    : computeAssetBounds(
        source,
        sourceNodes,
        sourceMeshes,
        outputNodes,
        options.meshOverrides,
      );
  const rawBinary = Buffer.concat(binaryParts);
  const paddedLength = Math.ceil(rawBinary.length / 4) * 4;
  const binary = Buffer.alloc(paddedLength);
  rawBinary.copy(binary);
  const digest = createHash('sha256').update(binary).digest('hex');
  const selectedChildren = new Set(
    selectedNodeIndices.flatMap((sourceIndex) => (
      integers(sourceNodes[sourceIndex]?.children)
    )),
  );
  const sceneNodeIndices = options.selection
    ? selectedNodeIndices
        .filter((sourceIndex) => !selectedChildren.has(sourceIndex))
        .map((sourceIndex) => outputIndexBySource.get(sourceIndex)!)
        .concat(batchNodeIndices)
    : integers(sourceScene.nodes);
  const nodeDepth = (
    index: number,
    visiting = new Set<number>(),
  ): number => {
    if (visiting.has(index)) {
      throw new Error('ICE3_TOOL_INVALID_SOURCE: node cycle detected');
    }
    const children = integers(sourceNodes[index]?.children);
    if (children.length === 0) return 0;
    const next = new Set(visiting).add(index);
    return 1 + Math.max(...children.map((child) => nodeDepth(child, next)));
  };
  const maxNodeDepth = options.selection || sceneNodeIndices.length === 0
    ? 0
    : Math.max(...sceneNodeIndices.map((index) => nodeDepth(index)));
  const baseStats: ICEAssetContractStats = {
    nodeCount: outputNodes.length,
    maxNodeDepth,
    meshCount: outputMeshes.length,
    primitiveCount,
    triangleCount,
    edgeSegmentCount,
    materialCount: outputMaterials.length,
    selectionGroupCount: selectionNodes.size,
  };
  const budgetProfile = options.budget
    ?? BUDGET_PROFILES['interactive-desktop-v1']!;
  const preparation = {
    runtimeConversionRequired: false as const,
    sourceFormat: 'gltf-2.0' as const,
    unitsNormalized: true as const,
    matrixTransformsBaked: true as const,
    requiredCompressionDecoded: true as const,
    edgesPrepared: options.edges !== false,
    selectionGroupsPrepared: true as const,
    options: {
      creaseAngleDegrees,
      edges: options.edges !== false,
    },
  };
  const json = {
    asset: {
      version: '2.0',
      generator: 'ICE3 Toolchain',
      extras: {
        ice3: {
          profile: 'ice3-prepared',
          profileVersion: '1.0',
          contractVersion: '1.0',
          assetId,
          contentDigest: {
            algorithm: 'sha256',
            value: digest,
            covers: 'binary-chunk',
          },
          coordinateSystem: {
            handedness: 'right',
            upAxis: 'y',
            linearUnit: 'meter',
          },
          colorSpace: 'srgb',
          bounds,
          stats: {
            ...baseStats,
          },
          preparation,
          budget: {
            profile: budgetProfile.id,
            status: 'pass',
            warningCount: 0,
            errorCount: 0,
          },
          ...(renderBatching
            ? {
                batching: {
                  version: '1.0',
                  semanticIds: renderBatching.semanticIds,
                  semanticNodeIds: renderBatching.semanticNodeIds,
                  semanticSelectionIds: renderBatching.semanticSelectionIds,
                  batches: batchMetadata,
                },
              }
            : {}),
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: sceneNodeIndices }],
    nodes: outputNodes,
    meshes: outputMeshes,
    materials: outputMaterials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: rawBinary.byteLength }],
  };
  const baseMetrics: ICEAssetMetrics = {
    ...baseStats,
    encodedBytes: 0,
    jsonChunkBytes: 0,
    binChunkBytes: 0,
  };
  const initialContract: ICEAssetContract = {
    contractVersion: '1.0',
    stats: baseStats,
    preparation,
    budget: {
      profile: budgetProfile.id,
      status: 'pass',
      warningCount: 0,
      errorCount: 0,
    },
  };
  const finalized = packWithContract(
    json,
    binary,
    baseMetrics,
    initialContract,
    budgetProfile,
  );
  return {
    bytes: finalized.bytes,
    stats: contractStats(finalized.metrics),
    metrics: finalized.metrics,
    budget: finalized.budget,
    contentDigest: digest,
    ...(renderBatching
      ? {
          renderBatching: {
            inputPrimitiveCount: renderBatching.inputPrimitiveCount,
            batchCount: renderBatching.outputBatchCount,
            triangleCount: renderBatching.batches.reduce(
              (total, batch) => total + batch.triangleCount,
              0,
            ),
            byteLength: renderBatching.batches.reduce(
              (total, batch) => total
                + batch.positions.byteLength
                + batch.indices.byteLength
                + batch.semanticIndices.byteLength
                + (batch.colors?.byteLength ?? 0),
              0,
            ),
            fallbackPrimitiveCount: 0,
          },
        }
      : {}),
  };
}

const withContract = (
  json: JSONRecord,
  contract: ICEAssetContract,
): JSONRecord => {
  const asset = record(json.asset)!;
  const extras = record(asset.extras)!;
  const ice3 = record(extras.ice3)!;
  return {
    ...json,
    asset: {
      ...asset,
      extras: {
        ...extras,
        ice3: {
          ...ice3,
          contractVersion: contract.contractVersion,
          stats: contract.stats,
          preparation: contract.preparation,
          budget: contract.budget,
        },
      },
    },
  };
};

const measurePackedMetrics = (
  packed: Uint8Array,
  base: ICEAssetMetrics,
): ICEAssetMetrics => {
  const buffer = Buffer.from(packed);
  const jsonChunkBytes = buffer.readUInt32LE(12);
  const binHeader = 20 + jsonChunkBytes;
  const binChunkBytes = buffer.readUInt32LE(binHeader);
  return {
    ...base,
    encodedBytes: packed.byteLength,
    jsonChunkBytes,
    binChunkBytes,
  };
};

const packWithContract = (
  json: JSONRecord,
  binary: Buffer,
  baseMetrics: ICEAssetMetrics,
  contract: ICEAssetContract,
  budget: ICEBudgetProfile,
): {
  readonly bytes: Uint8Array;
  readonly metrics: ICEAssetMetrics;
  readonly budget: ICEBudgetResult;
} => {
  let previousSignature = '';
  let contractValue = contract;
  for (let pass = 0; pass < 3; pass += 1) {
    const packed = packGLB(withContract(json, contractValue), binary);
    const metrics = measurePackedMetrics(packed, baseMetrics);
    const budgetResult = evaluateAssetBudget(metrics, budget);
    const signature = [
      metrics.encodedBytes,
      metrics.jsonChunkBytes,
      metrics.binChunkBytes,
      budgetResult.status,
      budgetResult.warningCount,
      budgetResult.errorCount,
    ].join(':');
    if (signature === previousSignature) {
      return { bytes: packed, metrics, budget: budgetResult };
    }
    previousSignature = signature;
    contractValue = {
      ...contract,
      stats: contractStats(metrics),
      budget: {
        profile: budget.id,
        status: budgetResult.status,
        warningCount: budgetResult.warningCount,
        errorCount: budgetResult.errorCount,
      },
    };
  }
  throw new Error('ICE3_TOOL_BUDGET_UNSTABLE: final GLB size did not converge');
};

function packGLB(json: unknown, binary: Buffer): Uint8Array {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const binaryLength = binary.length;
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binaryLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(0x20, 20, 20 + jsonLength);
  jsonBytes.copy(output, 20);
  const binHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  binary.copy(output, binHeader + 8);
  return output;
}

function computeAssetBounds(
  source: ICESourceDocument,
  nodes: readonly JSONRecord[],
  meshes: readonly JSONRecord[],
  outputNodes: readonly JSONRecord[],
  meshOverrides?: ReadonlyMap<number, ICEPreparedMeshOverride>,
): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const visit = (index: number, parent = identity()): void => {
    const local = outputNodes[index]!.matrix as ICEMatrix4Tuple;
    const world = multiplyMatrices(parent, local);
    const meshIndex = nodes[index]?.mesh;
    if (meshIndex !== undefined) {
      const meshOverride = meshOverrides?.get(Number(meshIndex));
      if (meshOverride) {
        extendTransformedBounds(min, max, overrideBounds(meshOverride), world);
      }
      for (const primitive of records(meshes[Number(meshIndex)]?.primitives)) {
        if (meshOverride) break;
        if (Number(primitive.mode ?? 4) === 1) continue;
        const accessorIndex = Number(record(primitive.attributes)?.POSITION);
        const data = readAccessor(source, accessorIndex);
        if (data.kind !== 'float32' || data.components !== 3) continue;
        for (let vertex = 0; vertex < data.values.length; vertex += 3) {
          const point = transformPoint(
            world,
            data.values[vertex]!,
            data.values[vertex + 1]!,
            data.values[vertex + 2]!,
          );
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis]!, point[axis]!);
            max[axis] = Math.max(max[axis]!, point[axis]!);
          }
        }
      }
    }
    for (const child of integers(nodes[index]?.children)) {
      visit(child, world);
    }
  };
  for (const root of nodes.keys()) {
    if (!nodes.some((node) => integers(node.children).includes(root))) {
      visit(root);
    }
  }
  return {
    min: min.every(Number.isFinite) ? min : [0, 0, 0],
    max: max.every(Number.isFinite) ? max : [0, 0, 0],
  };
}

function transformPoint(
  matrix: ICEMatrix4Tuple,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function records(value: unknown): JSONRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JSONRecord => (
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      ))
    : [];
}

function record(value: unknown): JSONRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JSONRecord
    : undefined;
}

function integers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item))
    : [];
}

function numbers(value: unknown, length: number): readonly number[] | undefined {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? value as number[]
    : undefined;
}

function sequential(count: number): Uint32Array {
  return Uint32Array.from({ length: count }, (_value, index) => index);
}

function hexToRgba(hex: string): number[] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
    1,
  ];
}

function linearToSrgb(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function identity(): ICEMatrix4Tuple {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function validateNodeSelection(
  indices: readonly number[],
  nodeCount: number,
): number[] {
  const selected = [...new Set(indices)].sort((left, right) => left - right);
  if (
    selected.length === 0
    || selected.some((index) => (
      !Number.isInteger(index) || index < 0 || index >= nodeCount
    ))
  ) {
    throw new Error(
      'ICE3_TOOL_INVALID_OPTIONS: selection node indices are invalid',
    );
  }
  return selected;
}

function computeSelectionBounds(
  source: ICESourceDocument,
  nodes: readonly JSONRecord[],
  meshes: readonly JSONRecord[],
  nodeIndices: readonly number[],
  worldMatrices: readonly ICEMatrix4Tuple[],
  meshOverrides?: ReadonlyMap<number, ICEPreparedMeshOverride>,
): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const accessors = records(source.json.accessors);
  for (const nodeIndex of nodeIndices) {
    const meshIndex = nodes[nodeIndex]?.mesh;
    if (meshIndex === undefined) continue;
    const meshOverride = meshOverrides?.get(Number(meshIndex));
    if (meshOverride) {
      const world = transformBounds(
        overrideBounds(meshOverride),
        worldMatrices[nodeIndex]!,
      );
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, world.min[axis]!);
        max[axis] = Math.max(max[axis]!, world.max[axis]!);
      }
    }
    for (const primitive of records(meshes[Number(meshIndex)]?.primitives)) {
      if (meshOverride) break;
      if (Number(primitive.mode ?? 4) === 1) continue;
      const accessorIndex = Number(record(primitive.attributes)?.POSITION);
      const accessor = accessors[accessorIndex];
      const local = sourceAccessorBounds(source, accessor, accessorIndex);
      const world = transformBounds(local, worldMatrices[nodeIndex]!);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, world.min[axis]!);
        max[axis] = Math.max(max[axis]!, world.max[axis]!);
      }
    }
  }
  return {
    min: min.every(Number.isFinite) ? min : [0, 0, 0],
    max: max.every(Number.isFinite) ? max : [0, 0, 0],
  };
}

function extendTransformedBounds(
  min: [number, number, number],
  max: [number, number, number],
  local: ReturnType<typeof overrideBounds>,
  world: ICEMatrix4Tuple,
): void {
  const transformed = transformBounds(local, world);
  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis]!, transformed.min[axis]!);
    max[axis] = Math.max(max[axis]!, transformed.max[axis]!);
  }
}

function overrideBounds(
  override: Pick<ICEGeometryOverride, 'positions'>,
): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < override.positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = override.positions[offset + axis]!;
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
  }
  return { min, max };
}

function sourceAccessorBounds(
  source: ICESourceDocument,
  accessor: JSONRecord | undefined,
  accessorIndex: number,
): { min: [number, number, number]; max: [number, number, number] } {
  const min = numbers(accessor?.min, 3);
  const max = numbers(accessor?.max, 3);
  if (min && max) {
    return {
      min: [min[0]!, min[1]!, min[2]!],
      max: [max[0]!, max[1]!, max[2]!],
    };
  }
  const data = readAccessor(source, accessorIndex);
  const boundsMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const boundsMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < data.values.length; offset += data.components) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = data.values[offset + axis]!;
      boundsMin[axis] = Math.min(boundsMin[axis]!, value);
      boundsMax[axis] = Math.max(boundsMax[axis]!, value);
    }
  }
  return { min: boundsMin, max: boundsMax };
}
