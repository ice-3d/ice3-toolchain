export interface ICEWWTPMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

export type ICEWWTPStage =
  | 'intake'
  | 'primary'
  | 'biological'
  | 'secondary'
  | 'advanced'
  | 'sludge'
  | 'chemical'
  | 'utilities';

export type ICEWWTPEquipmentKind =
  | 'screen'
  | 'pump'
  | 'valve'
  | 'basin'
  | 'clarifier'
  | 'blower'
  | 'filter'
  | 'analyzer';

export interface ICEWWTPEquipmentSpec {
  readonly tag: string;
  readonly name: string;
  readonly stage: ICEWWTPStage;
  readonly kind: ICEWWTPEquipmentKind;
  readonly position: readonly [number, number, number];
  readonly rotationY?: number;
}
