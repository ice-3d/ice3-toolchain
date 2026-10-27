import type { ICEBounds } from './types.js';

type JSONRecord = Record<string, unknown>;

export interface ICEFinishedTile {
  readonly bounds: ICEBounds;
  readonly contentUri: string;
  readonly partitionId: string;
  readonly children: readonly ICEFinishedTile[];
}

export interface ICETilesetDocument {
  readonly asset: {
    readonly version: '1.1';
    readonly extras: {
      readonly ice3: {
        readonly assetId: string;
        readonly contractVersion: '1.0';
      };
    };
  };
  readonly geometricError: number;
  readonly root: Readonly<Record<string, unknown>>;
}

export function createTilesetDocument(
  assetId: string,
  root: ICEFinishedTile,
): ICETilesetDocument {
  const id = assetId.trim();
  if (!id) {
    throw new Error('ICE3_TOOL_TILESET_INVALID: assetId must not be empty');
  }
  const rootTile = createTile(id, root);
  return {
    asset: {
      version: '1.1',
      extras: {
        ice3: {
          assetId: id,
          contractVersion: '1.0',
        },
      },
    },
    geometricError: Number(rootTile.geometricError),
    root: rootTile,
  };
}

function createTile(assetId: string, input: ICEFinishedTile): JSONRecord {
  validateBounds(input.bounds);
  const isLeaf = input.children.length === 0;
  const tile: JSONRecord = {
    boundingVolume: {
      box: toTilesBox(input.bounds),
    },
    geometricError: isLeaf ? 0 : boundsDiagonal(input.bounds),
    refine: 'REPLACE',
  };
  if (input.contentUri) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(input.contentUri)) {
      throw new Error(
        'ICE3_TOOL_TILESET_INVALID: content URI must be relative',
      );
    }
    tile.content = { uri: input.contentUri };
  } else if (isLeaf) {
    throw new Error(
      'ICE3_TOOL_TILESET_INVALID: leaf content URI must not be empty',
    );
  }
  if (!isLeaf) {
    tile.children = [...input.children]
      .sort((left, right) => (
        left.partitionId.localeCompare(right.partitionId, 'en')
      ))
      .map((child) => createTile(assetId, child));
  }
  tile.extras = {
    ice3: {
      assetId,
      partitionId: input.partitionId,
    },
  };
  return tile;
}

function toTilesBox(bounds: ICEBounds): number[] {
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const halfX = (bounds.max[0] - bounds.min[0]) / 2;
  const halfY = (bounds.max[1] - bounds.min[1]) / 2;
  const halfZ = (bounds.max[2] - bounds.min[2]) / 2;
  return [
    centerX, -centerZ, centerY,
    halfX, 0, 0,
    0, 0, halfY,
    0, halfZ, 0,
  ];
}

function boundsDiagonal(bounds: ICEBounds): number {
  return Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
}

function validateBounds(bounds: ICEBounds): void {
  const values = [...bounds.min, ...bounds.max];
  if (
    values.some((value) => !Number.isFinite(value))
    || bounds.min.some((value, axis) => value > bounds.max[axis]!)
  ) {
    throw new Error('ICE3_TOOL_TILESET_INVALID: tile bounds are invalid');
  }
}
