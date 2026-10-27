import { createHash } from 'node:crypto';
import type { ICESourceDocument } from '../source/readSource.js';
import { readAccessor } from '../source/readAccessor.js';
import { bakeLocalMatrix, type ICEMatrix4Tuple } from '../scene/bakeMatrix.js';
import { prepareMesh } from '../scene/prepareMesh.js';

export interface ICEBuildOptions {
  readonly assetId: string;
  readonly creaseAngleDegrees?: number;
}

export interface ICEPreparedGLB {
  readonly bytes: Uint8Array;
  readonly stats: Readonly<{
    nodeCount: number;
    meshCount: number;
    triangleCount: number;
    edgeSegmentCount: number;
  }>;
}

type JSONRecord = Record<string, unknown>;

interface BufferView {
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
  const creaseAngleDegrees = options.creaseAngleDegrees ?? 30;
  const sourceNodes = records(source.json.nodes);
  const sourceMeshes = records(source.json.meshes);
  const sourceScene = records(source.json.scenes)[Number(source.json.scene ?? 0)];
  if (!sourceScene) {
    throw new Error('ICE3_TOOL_INVALID_SOURCE: active scene is missing');
  }

  const outputNodes = sourceNodes.map((node, index) => ({
    name: typeof node.name === 'string' ? node.name : `node-${index}`,
    matrix: bakeLocalMatrix(
      numbers(node.matrix, 16),
      numbers(node.translation, 3),
      numbers(node.rotation, 4),
      numbers(node.scale, 3),
    ),
    ...(node.children === undefined
      ? {}
      : { children: integers(node.children) }),
    ...(node.mesh === undefined ? {} : { mesh: Number(node.mesh) }),
    extras: { ice3: { id: `${assetId}/node/${index}` } },
  }));

  const materialEntries = records(source.json.materials);
  const outputMaterials: JSONRecord[] = [];
  const baseMaterialIndices: number[] = [];
  const edgeMaterialIndices: number[] = [];
  for (const [index, material] of materialEntries.entries()) {
    const pbr = record(material.pbrMetallicRoughness);
    const baseColor = rgbaToHex(numbers(pbr?.baseColorFactor, 4) ?? [0.5, 0.5, 0.5, 1]);
    const extras = record(material.extras);
    const iceExtras = record(extras?.ice3);
    const edgeColor = typeof iceExtras?.edgeColor === 'string'
      ? iceExtras.edgeColor
      : '#e6f2ff';
    baseMaterialIndices[index] = outputMaterials.length;
    outputMaterials.push({
      name: typeof material.name === 'string' ? material.name : `material-${index}`,
      pbrMetallicRoughness: {
        baseColorFactor: hexToRgba(baseColor),
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
  outputMaterials.push({
    name: 'default',
    pbrMetallicRoughness: {
      baseColorFactor: [0.5, 0.5, 0.5, 1],
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

  const binaryParts: Buffer[] = [];
  const bufferViews: BufferView[] = [];
  const accessors: Accessor[] = [];
  const outputMeshes: JSONRecord[] = [];
  let binaryLength = 0;
  let triangleCount = 0;
  let edgeSegmentCount = 0;

  const append = (bytes: Uint8Array): number => {
    const padding = (4 - (binaryLength % 4)) % 4;
    if (padding > 0) {
      binaryParts.push(Buffer.alloc(padding));
      binaryLength += padding;
    }
    const view = { byteOffset: binaryLength, byteLength: bytes.byteLength };
    bufferViews.push(view);
    binaryParts.push(Buffer.from(bytes));
    binaryLength += bytes.byteLength;
    return bufferViews.length - 1;
  };

  for (const [meshIndex, mesh] of sourceMeshes.entries()) {
    const primitives: JSONRecord[] = [];
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
      const prepared = prepareMesh(
        positionData.values,
        new Uint32Array(indexData.values),
        creaseAngleDegrees,
        {
          id: `${assetId}/geometry/${meshIndex}/${primitiveIndex}`,
          mode: Number(primitive.mode ?? 4) as 4 | 5 | 6,
        },
      );
      const positionView = append(new Uint8Array(prepared.positions.buffer));
      const sourceMaterial = primitive.material === undefined
        ? materialEntries.length
        : Number(primitive.material);
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
      primitives.push({
        attributes: { POSITION: positionAccessorIndex },
        indices: triangleAccessorIndex,
        material: baseMaterialIndices[sourceMaterial]!,
        mode: 4,
      });
      if (prepared.edgeIndices.length > 0) {
        primitives.push({
          attributes: { POSITION: positionAccessorIndex },
          indices: edgeAccessorIndex,
          material: edgeMaterialIndices[sourceMaterial]!,
          mode: 1,
          extras: { ice3: { role: 'edges', widthPx: 3 } },
        });
      }
      triangleCount += prepared.indices.length / 3;
      edgeSegmentCount += prepared.edgeIndices.length / 2;
    }
    outputMeshes.push({
      primitives,
      extras: { ice3: { id: `${assetId}/mesh/${meshIndex}` } },
    });
  }

  const bounds = computeAssetBounds(
    source,
    sourceNodes,
    sourceMeshes,
    outputNodes,
  );
  const rawBinary = Buffer.concat(binaryParts);
  const paddedLength = Math.ceil(rawBinary.length / 4) * 4;
  const binary = Buffer.alloc(paddedLength);
  rawBinary.copy(binary);
  const digest = createHash('sha256').update(binary).digest('hex');
  const sceneNodeIndices = integers(sourceScene.nodes);
  const json = {
    asset: {
      version: '2.0',
      generator: 'ICE3 Toolchain',
      extras: {
        ice3: {
          profile: 'ice3-prepared',
          profileVersion: '1.0',
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
          bounds,
          stats: {
            nodeCount: outputNodes.length,
            meshCount: outputMeshes.length,
            triangleCount,
            edgeSegmentCount,
          },
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
  return {
    bytes: packGLB(json, binary),
    stats: {
      nodeCount: outputNodes.length,
      meshCount: outputMeshes.length,
      triangleCount,
      edgeSegmentCount,
    },
  };
}

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
): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const visit = (index: number, parent = identity()): void => {
    const local = outputNodes[index]!.matrix as ICEMatrix4Tuple;
    const world = multiply(parent, local);
    const meshIndex = nodes[index]?.mesh;
    if (meshIndex !== undefined) {
      for (const primitive of records(meshes[Number(meshIndex)]?.primitives)) {
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

function rgbaToHex(rgba: readonly number[]): string {
  return `#${rgba.slice(0, 3).map((value) => (
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0')
  )).join('')}`;
}

function hexToRgba(hex: string): number[] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
    1,
  ];
}

function identity(): ICEMatrix4Tuple {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply(left: ICEMatrix4Tuple, right: ICEMatrix4Tuple): ICEMatrix4Tuple {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] = (
        left[row]! * right[column * 4]!
        + left[4 + row]! * right[column * 4 + 1]!
        + left[8 + row]! * right[column * 4 + 2]!
        + left[12 + row]! * right[column * 4 + 3]!
      );
    }
  }
  return [...output] as unknown as ICEMatrix4Tuple;
}
