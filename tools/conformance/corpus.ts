export interface IConformanceCase {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly command: 'build' | 'import';
  readonly adapter?: string;
  readonly expectedNames: readonly string[];
  readonly expectedSemantics: readonly string[];
  readonly notes?: string;
}

export const CONFORMANCE_CASES: readonly IConformanceCase[] = Object.freeze([
  {
    id: 'gltf',
    title: 'glTF 2.0',
    source: 'tests/fixtures/cube.gltf',
    command: 'build',
    expectedNames: ['prepared-cube'],
    expectedSemantics: ['native source reader'],
  },
  {
    id: 'step',
    title: 'STEP AP242',
    source: 'tests/fixtures/step/synthetic-skid.step',
    command: 'import',
    adapter: 'step',
    expectedNames: ['PrimaryTank', 'TransferPump'],
    expectedSemantics: ['assembly hierarchy', 'display color', 'meter conversion'],
  },
  {
    id: 'ifc',
    title: 'IFC 4.3',
    source: 'tests/fixtures/ifc/synthetic-plant.ifc',
    command: 'import',
    adapter: 'ifc',
    expectedNames: ['Primary Pump', 'Buffer Tank'],
    expectedSemantics: ['spatial hierarchy', 'property sets', 'systems'],
  },
  {
    id: 'fbx',
    title: 'FBX',
    source: 'tests/fixtures/fbx/synthetic-binary.fbx',
    command: 'import',
    adapter: 'fbx',
    expectedNames: ['Primary Pump', 'Buffer Tank'],
    expectedSemantics: ['shared instances', 'custom properties'],
  },
  {
    id: 'usd',
    title: 'USD',
    source: 'tests/fixtures/usd/synthetic-plant.usdc',
    command: 'import',
    adapter: 'usd',
    expectedNames: ['PrimaryPump', 'BufferTank'],
    expectedSemantics: ['prim path', 'shared instances', 'custom properties'],
  },
  {
    id: 'obj',
    title: 'OBJ',
    source: 'tests/fixtures/obj/synthetic-plant.obj',
    command: 'import',
    adapter: 'obj',
    expectedNames: ['PrimaryPump', 'BufferTank'],
    expectedSemantics: ['safe MTL sidecar', 'meter assumption warning'],
  },
  {
    id: 'jt',
    title: 'JT',
    source: 'tests/fixtures/jt/synthetic-contract.jt',
    command: 'import',
    adapter: 'jt',
    expectedNames: ['PrimaryPump', 'BufferTank'],
    expectedSemantics: ['external converter contract', 'converter metadata'],
    notes: 'Synthetic converter-contract fixture; real JT parsing requires ICE3_JT_CONVERTER.',
  },
]);
