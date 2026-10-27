import { expect, test } from 'node-test';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import type { ICESourceDocument } from '../../packages/toolchain-core/src/source/readSource.js';
import { BUDGET_PROFILES } from '../../packages/toolchain-core/src/output/evaluateAssetBudget.js';
import { createPartitionSource } from '../partition/createPartitionSource.js';

const readProfile = (bytes: Uint8Array): Record<string, unknown> => {
  const buffer = Buffer.from(bytes);
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + length).toString('utf8').trimEnd(),
  ) as Record<string, unknown>;
  const asset = json.asset as Record<string, unknown>;
  return (asset.extras as Record<string, unknown>).ice3 as Record<string, unknown>;
};

const readDocument = (bytes: Uint8Array): Record<string, any> => {
  const buffer = Buffer.from(bytes);
  const length = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + length).toString('utf8').trimEnd(),
  ) as Record<string, any>;
};

test('builds byte-identical prepared GLB output', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const first = buildPreparedGLB(source, { assetId: 'sample' });
  const second = buildPreparedGLB(source, { assetId: 'sample' });

  expect(first.bytes).toEqual(second.bytes);
  expect(first.metrics).toMatchObject({
    nodeCount: 1,
    maxNodeDepth: 0,
    meshCount: 1,
    primitiveCount: 2,
    triangleCount: 1,
    edgeSegmentCount: 3,
    materialCount: 5,
    selectionGroupCount: 1,
  });
  expect(first.stats).toEqual({
    nodeCount: 1,
    maxNodeDepth: 0,
    meshCount: 1,
    primitiveCount: 2,
    triangleCount: 1,
    edgeSegmentCount: 3,
    materialCount: 5,
    selectionGroupCount: 1,
  });
});

test('writes a LOD namespace while preserving selection identity', () => {
  const built = buildPreparedGLB(createPartitionSource(), {
    assetId: 'overview',
    selectionIdAssetId: 'source-asset',
    selection: {
      nodeIndices: [0],
      flattenWorldTransforms: true,
    },
  });
  const buffer = Buffer.from(built.bytes);
  const jsonLength = buffer.readUInt32LE(12);
  const document = JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as {
    nodes: Array<{ extras: { ice3: Record<string, unknown> } }>;
  };

  expect(document.nodes[0]!.extras.ice3).toEqual({
    id: 'overview/node/0',
    selectionId: 'source-asset/node/0',
  });
});

test('treats normalized geometry overrides as triangle lists', () => {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 3]);
  const binary = Buffer.alloc(56);
  Buffer.from(positions.buffer).copy(binary, 0);
  Buffer.from(indices.buffer).copy(binary, 48);
  const source: ICESourceDocument = {
    baseDirectory: '.',
    buffers: [new Uint8Array(binary)],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          mode: 5,
        }],
      }],
      materials: [],
      buffers: [{ byteLength: 56 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 48 },
        { buffer: 0, byteOffset: 48, byteLength: 8 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 4, type: 'SCALAR' },
      ],
    },
  };
  const built = buildPreparedGLB(source, {
    assetId: 'strip',
    edges: false,
    geometryOverrides: new Map([[
      '0:0',
      {
        positions,
        indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
      },
    ]]),
  });

  expect(built.stats.triangleCount).toBe(2);
});

test('replaces source mesh geometry without changing nodes', () => {
  const source = createPartitionSource();
  const built = buildPreparedGLB(source, {
    assetId: 'proxy-test',
    selectionIdAssetId: 'source-asset',
    edges: false,
    meshOverrides: new Map([[
      0,
      {
        positions: new Float32Array([
          -1, -1, -1,
          1, -1, -1,
          -1, 1, 1,
        ]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 1]),
        materialIndex: 0,
      },
    ]]),
  });
  const document = readDocument(built.bytes) as {
    meshes: Array<{ primitives: Array<Record<string, unknown>> }>;
    nodes: Array<{ extras: { ice3: Record<string, unknown> } }>;
  };

  expect(document.meshes[0]!.primitives).toHaveLength(1);
  expect(built.stats.triangleCount).toBe(5);
  expect(document.nodes[0]!.extras.ice3.selectionId)
    .toBe('source-asset/node/0');
  expect(built.metrics.edgeSegmentCount).toBe(0);
});

test('combines mesh override and normal mesh paths in one Tile', () => {
  const source = createPartitionSource();
  const built = buildPreparedGLB(source, {
    assetId: 'mixed-proxy-test',
    selectionIdAssetId: 'source-asset',
    edges: false,
    meshOverrides: new Map([[
      0,
      {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2]),
      },
    ]]),
  });
  const document = readDocument(built.bytes) as {
    meshes: Array<{ primitives: Array<Record<string, unknown>> }>;
    nodes: Array<{ mesh: number; extras: { ice3: Record<string, unknown> } }>;
  };

  expect(document.meshes).toHaveLength(4);
  expect(document.meshes[0]!.primitives).toHaveLength(1);
  expect(document.meshes[1]!.primitives).toHaveLength(1);
  expect(document.nodes.map((node) => node.extras.ice3.selectionId))
    .toEqual([
      'source-asset/node/0',
      'source-asset/node/1',
      'source-asset/node/2',
      'source-asset/node/3',
    ]);
});

test('writes static render batches without changing semantic nodes', () => {
  const source = createPartitionSource();
  source.json.nodes = (source.json.nodes as Array<Record<string, unknown>>)
    .map((node, index) => ({
      ...node,
      extras: {
        ice3: {
          id: `source/node/${index}`,
          selectionId: `source/node/${index}`,
        },
      },
    }));
  const built = buildPreparedGLB(source, {
    assetId: 'batched',
    edges: false,
    renderBatching: {
      mode: 'static',
      maxTrianglesPerBatch: 100,
      maxBytesPerBatch: 1_000_000,
    },
  });
  const document = readDocument(built.bytes) as {
    accessors: Array<Record<string, unknown>>;
    meshes: Array<{
      primitives: Array<{
        attributes: Record<string, number>;
        mode: number;
      }>;
    }>;
    nodes: Array<{
      mesh?: number;
      extras: { ice3: Record<string, unknown> };
    }>;
    asset: {
      extras: {
        ice3: {
          batching: {
            semanticSelectionIds: string[];
            batches: unknown[];
          };
        };
      };
    };
  };

  expect(document.meshes).toHaveLength(1);
  expect(document.meshes[0]!.primitives[0]!.attributes._ICE3_SEMANTIC_INDEX)
    .toEqual(expect.any(Number));
  expect(document.nodes.filter((node) => node.mesh !== undefined)).toHaveLength(1);
  expect(document.nodes
    .filter((node) => node.mesh === undefined)
    .map((node) => node.extras.ice3.selectionId)).toEqual([
      'source/node/0',
      'source/node/1',
      'source/node/2',
      'source/node/3',
    ]);
  expect(document.asset.extras.ice3.batching.semanticSelectionIds).toEqual([
    'source/node/0',
    'source/node/1',
    'source/node/2',
    'source/node/3',
  ]);
  expect(document.asset.extras.ice3.batching.batches).toHaveLength(1);
});

test('reports contract bounds from replaced mesh geometry', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const built = buildPreparedGLB(source, {
    assetId: 'proxy-bounds',
    edges: false,
    meshOverrides: new Map([[0, {
      positions: new Float32Array([0, 0, 0, 4, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }]]),
  });
  const selected = buildPreparedGLB(source, {
    assetId: 'proxy-bounds-selected',
    edges: false,
    selection: {
      nodeIndices: [0],
      flattenWorldTransforms: true,
    },
    meshOverrides: new Map([[0, {
      positions: new Float32Array([0, 0, 0, 4, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }]]),
  });
  const document = readDocument(built.bytes) as {
    asset: {
      extras: {
        ice3: {
          bounds: {
            min: number[];
            max: number[];
          };
        };
      };
    };
  };

  expect(document.asset.extras.ice3.bounds.max[0]).toBe(4);
  expect(readDocument(selected.bytes).asset.extras.ice3.bounds.max[0]).toBe(4);
});

test('reuses one replaced mesh across node instances', () => {
  const source = createPartitionSource(true);
  const built = buildPreparedGLB(source, {
    assetId: 'shared-proxy',
    selectionIdAssetId: 'source-asset',
    edges: false,
    meshOverrides: new Map([[0, {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }]]),
  });
  const document = readDocument(built.bytes) as {
    meshes: unknown[];
    nodes: Array<{
      mesh: number;
      matrix: number[];
      extras: { ice3: { selectionId: string } };
    }>;
  };

  expect(document.meshes).toHaveLength(1);
  expect(document.nodes.map((node) => node.mesh)).toEqual([0, 0, 0, 0]);
  expect(document.nodes.map((node) => node.matrix[12])).toEqual([0, 10, 20, 30]);
  expect(document.nodes.map((node) => node.extras.ice3.selectionId))
    .toEqual([
      'source-asset/node/0',
      'source-asset/node/1',
      'source-asset/node/2',
      'source-asset/node/3',
    ]);
});

test('rejects invalid selected mesh override geometry', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');

  expect(() => buildPreparedGLB(source, {
    assetId: 'invalid-proxy',
    meshOverrides: new Map([[0, {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 9]),
    }]]),
  })).toThrow(/ICE3_TOOL_INVALID_GEOMETRY/);
});

test('writes an ICE3 profile header and one BIN chunk', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const glb = buildPreparedGLB(source, { assetId: 'sample' }).bytes;

  expect(Buffer.from(glb).readUInt32LE(0)).toBe(0x46546c67);
  expect(Buffer.from(glb).readUInt32LE(4)).toBe(2);
  expect(Buffer.from(glb).readUInt32LE(8)).toBe(glb.byteLength);
  expect(Buffer.from(glb).toString('utf8')).toContain('ice3-prepared');
  expect(Buffer.from(glb).toString('utf8')).toContain('sample');
});

test('rejects unsupported source features before packing', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  (source.json as Record<string, unknown>).animations = [{}];

  expect(() => buildPreparedGLB(source, { assetId: 'sample' })).toThrow(
    /ICE3_TOOL_SOURCE_UNSUPPORTED/,
  );
});

test('can omit generated edges for large-model preview', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const built = buildPreparedGLB(source, {
    assetId: 'sample',
    edges: false,
  });

  expect(built.stats.edgeSegmentCount).toBe(0);
  const bytes = Buffer.from(built.bytes);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd(),
  ) as { meshes: { primitives: unknown[] }[] };
  expect(json.meshes[0]!.primitives).toHaveLength(1);
});

test('bakes vertex colors into display-ready profile colors', () => {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const colors = new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const indices = new Uint16Array([0, 1, 2]);
  const buffer = Buffer.alloc(80);
  Buffer.from(positions.buffer).copy(buffer, 0);
  Buffer.from(colors.buffer).copy(buffer, 36);
  Buffer.from(indices.buffer).copy(buffer, 72);
  const source: ICESourceDocument = {
    baseDirectory: '.',
    buffers: [new Uint8Array(buffer)],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{
        attributes: { POSITION: 0, COLOR_0: 2 },
        indices: 1,
        material: 0,
      }] }],
      materials: [{
        pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] },
      }],
      buffers: [{ byteLength: 80 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 72, byteLength: 6 },
        { buffer: 0, byteOffset: 36, byteLength: 36 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
        { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' },
      ],
    },
  };

  const built = buildPreparedGLB(source, { assetId: 'vertex-color', edges: false });
  const bytes = Buffer.from(built.bytes);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString('utf8').trimEnd(),
  ) as {
    accessors: { bufferView: number; componentType: number; count: number; type: string }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
    materials: { pbrMetallicRoughness: { baseColorFactor: number[] } }[];
    meshes: {
      primitives: { attributes: Record<string, number>; material: number }[];
    }[];
  };
  const primitive = json.meshes[0]!.primitives[0]!;
  const colorAccessorIndex = primitive.attributes.COLOR_0!;
  const colorAccessor = json.accessors[colorAccessorIndex]!;
  const colorView = json.bufferViews[colorAccessor.bufferView]!;
  const binaryOffset = 28 + jsonLength + (colorView.byteOffset ?? 0);
  const actual = new Float32Array(
    bytes.buffer,
    bytes.byteOffset + binaryOffset,
    colorAccessor.count * 3,
  );

  expect([...actual.slice(0, 3)].map((value) => Number(value.toFixed(3)))).toEqual([
    0.537,
    0.537,
    0.537,
  ]);
  expect(
    json.materials[primitive.material]!.pbrMetallicRoughness.baseColorFactor,
  ).toEqual([
    1,
    1,
    1,
    1,
  ]);
});

test('embeds preparation, extended stats, and budget status', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const built = buildPreparedGLB(source, {
    assetId: 'sample',
    budget: BUDGET_PROFILES['interactive-desktop-v1'],
  });
  const profile = readProfile(built.bytes);
  expect(profile.contractVersion).toBe('1.0');
  expect(profile.stats).toMatchObject({
    nodeCount: 1,
    maxNodeDepth: 0,
    meshCount: 1,
    primitiveCount: 2,
    triangleCount: 1,
    materialCount: 5,
    selectionGroupCount: 1,
  });
  expect(profile.preparation).toMatchObject({
    runtimeConversionRequired: false,
    matrixTransformsBaked: true,
  });
  expect(profile.budget).toMatchObject({
    profile: 'interactive-desktop-v1',
    status: 'pass',
  });
});
