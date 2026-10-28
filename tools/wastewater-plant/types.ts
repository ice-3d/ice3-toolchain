export interface ICEWWTPMeshData {
  readonly positions: Float32Array<ArrayBuffer>;
  readonly normals: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
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
  | 'inlet'
  | 'bar-screen'
  | 'pump'
  | 'valve'
  | 'grit-basin'
  | 'grit-classifier'
  | 'rectangular-clarifier'
  | 'distribution-well'
  | 'emergency-basin'
  | 'biological-reactor'
  | 'circular-clarifier'
  | 'coagulation-basin'
  | 'filter-cell'
  | 'contact-basin'
  | 'membrane-basin'
  | 'chemical-tank'
  | 'blower'
  | 'analyzer'
  | 'sludge-thickener'
  | 'sludge-dewatering'
  | 'sludge-dryer'
  | 'sludge-storage'
  | 'conveyor'
  | 'digester'
  | 'flare'
  | 'uv';

export interface ICEWWTPEquipmentSpec {
  readonly tag: string;
  readonly name: string;
  readonly stage: ICEWWTPStage;
  readonly kind: ICEWWTPEquipmentKind;
  readonly position: readonly [number, number, number];
  readonly rotationY?: number;
}
