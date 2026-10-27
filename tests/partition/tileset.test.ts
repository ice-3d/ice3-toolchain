import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { expect, test } from 'node-test';
import {
  createTilesetDocument,
  type ICEFinishedTile,
} from '../../packages/toolchain-core/src/partition/tileset.js';

const leaf: ICEFinishedTile = {
  bounds: { min: [0, 0, 0], max: [2, 1, 4] },
  contentUri: 'parts/part-000.glb',
  partitionId: 'part-000',
  geometricError: 0,
  children: [],
};

const schemaDirectory = 'tests/fixtures/3d-tiles-1.1-schema';

test('writes standard local Cartesian tile boxes and 0 leaf error', () => {
  const document = createTilesetDocument('factory', leaf);

  expect(document.asset.version).toBe('1.1');
  expect(document.root).toMatchObject({
    geometricError: 0,
    refine: 'REPLACE',
    boundingVolume: {
      box: [1, -2, 0.5, 1, 0, 0, 0, 0, 0.5, 0, 2, 0],
    },
    content: { uri: 'parts/part-000.glb' },
  });
});

test('writes standard contents for a chunked tile', () => {
  const document = createTilesetDocument('factory', {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUris: [
      'coarse/group-root/part-000.glb',
      'coarse/group-root/part-001.glb',
    ],
    partitionId: 'group-root',
    geometricError: 0,
    children: [],
  });

  expect(document.root).toMatchObject({
    contents: [
      { uri: 'coarse/group-root/part-000.glb' },
      { uri: 'coarse/group-root/part-001.glb' },
    ],
  });
});

test('writes a parent culling box that contains both child boxes', () => {
  const group: ICEFinishedTile = {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUri: '',
    partitionId: 'group-root',
    geometricError: 3.5,
    children: [
      leaf,
      {
        bounds: { min: [2, 0, 0], max: [4, 2, 2] },
        contentUri: 'parts/part-001.glb',
        partitionId: 'part-001',
        geometricError: 0,
        children: [],
      },
    ],
  };
  const document = createTilesetDocument('factory', group);
  const root = document.root as {
    boundingVolume: { box: number[] };
    geometricError: number;
    children: Array<{ content: { uri: string } }>;
  };

  expect(root.boundingVolume.box).toEqual([
    2, -1, 1,
    2, 0, 0,
    0, 0, 1,
    0, 1, 0,
  ]);
  expect(root.geometricError).toBe(3.5);
  expect(root.children.map((child) => child.content.uri)).toEqual([
    'parts/part-000.glb',
    'parts/part-001.glb',
  ]);
});

test('uses explicit errors and parent content without inventing defaults', () => {
  const child = {
    ...leaf,
    geometricError: 0,
  };
  const parent = {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] } as const,
    contentUri: 'coarse/group-root.glb',
    partitionId: 'group-root',
    geometricError: 3.5,
    children: [child],
  } satisfies ICEFinishedTile;
  const document = createTilesetDocument('factory', parent) as {
    root: {
      geometricError: number;
      content: { uri: string };
      children: Array<{ geometricError: number }>;
    };
  };

  expect(document.root.geometricError).toBe(3.5);
  expect(document.root.content.uri).toBe('coarse/group-root.glb');
  expect(document.root.children[0]!.geometricError).toBe(0);
});

test('rejects a parent error lower than a child error', () => {
  expect(() => createTilesetDocument('factory', {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUri: 'coarse/group-root.glb',
    partitionId: 'group-root',
    geometricError: 1,
    children: [{ ...leaf, geometricError: 2 }],
  })).toThrow(/ICE3_TOOL_TILESET_INVALID/);
});

test('validates against the official OGC schema bundle', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const file of readdirSync(schemaDirectory, { recursive: true })) {
    if (String(file).endsWith('.json')) {
      ajv.addSchema(JSON.parse(
        readFileSync(join(schemaDirectory, String(file)), 'utf8'),
      ));
    }
  }
  const validate = ajv.getSchema('tileset.schema.json')!;
  const document = createTilesetDocument('factory', leaf);

  expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
});
