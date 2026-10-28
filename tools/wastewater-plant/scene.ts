import {
  Document,
  Material,
  type Buffer,
  type Mesh,
  type Node,
} from '@gltf-transform/core';
import { WASTEWATER_EQUIPMENT } from './equipment.js';
import {
  AREA_NAMES,
  MAIN_FLOW_TAGS,
  RETURN_FLOW_ROUTES,
  equipmentArea,
} from './layout.js';
import { WASTEWATER_PALETTE } from './palette.js';
import {
  boxPart,
  buildingParts,
  equipmentParts,
  perimeterFenceParts,
  pipePart,
  siteGroundParts,
  utilityRackParts,
  type GeometryPart,
  type MaterialKey,
} from './assemblies.js';
import type {
  ICEWWTPEquipmentSpec,
  ICEWWTPMeshData,
} from './types.js';

const MATERIAL_KEYS = Object.keys(WASTEWATER_PALETTE) as MaterialKey[];

function colorTuple(hex: string): [number, number, number, number] {
  const value = hex.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    1,
  ];
}

function createMaterials(document: Document): Record<MaterialKey, Material> {
  const result = {} as Record<MaterialKey, Material>;
  for (const key of MATERIAL_KEYS) {
    result[key] = document
      .createMaterial(`wwtp:${key}`)
      .setBaseColorFactor(colorTuple(WASTEWATER_PALETTE[key]))
      .setMetallicFactor(0)
      .setRoughnessFactor(0.82)
      .setDoubleSided(true);
  }
  return result;
}

function mergedPartData(parts: readonly ICEWWTPMeshData[]): ICEWWTPMeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const base = positions.length / 3;
    for (const value of part.positions) positions.push(value);
    for (const value of part.normals) normals.push(value);
    for (const index of part.indices) indices.push(base + index);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

function appendPrimitive(
  document: Document,
  buffer: Buffer,
  mesh: Mesh,
  data: ICEWWTPMeshData,
  material: Material,
): void {
  const position = document.createAccessor().setType('VEC3')
    .setArray(data.positions).setBuffer(buffer);
  const normal = document.createAccessor().setType('VEC3')
    .setArray(data.normals).setBuffer(buffer);
  const indices = document.createAccessor().setType('SCALAR')
    .setArray(data.indices).setBuffer(buffer);
  mesh.addPrimitive(
    document.createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setIndices(indices)
      .setMaterial(material),
  );
}

function addMeshNode(
  document: Document,
  buffer: Buffer,
  name: string,
  parts: readonly GeometryPart[],
  materials: Record<MaterialKey, Material>,
  position: readonly [number, number, number] = [0, 0, 0],
): Node {
  const mesh = document.createMesh(`${name}:mesh`);
  const groups = new Map<MaterialKey, ICEWWTPMeshData[]>();
  for (const part of parts) {
    const group = groups.get(part.material) ?? [];
    group.push(part.data);
    groups.set(part.material, group);
  }
  for (const key of [...groups.keys()].sort()) {
    appendPrimitive(
      document,
      buffer,
      mesh,
      mergedPartData(groups.get(key)!),
      materials[key],
    );
  }
  return document.createNode(name).setMesh(mesh).setTranslation([
    position[0],
    position[1],
    position[2],
  ]);
}

function roadNetworkParts(): GeometryPart[] {
  return [
    boxPart(300, 0.08, 9, [135, 0.05, -42], 'road'),
    boxPart(9, 0.08, 162, [-4, 0.05, 26], 'road'),
    boxPart(9, 0.08, 162, [274, 0.05, 26], 'road'),
    boxPart(292, 0.08, 8, [136, 0.05, 65], 'road'),
    boxPart(293, 0.025, 0.13, [136, 0.1, -42], 'roadMark'),
    boxPart(0.13, 0.025, 154, [274, 0.1, 27], 'roadMark'),
    boxPart(282, 0.025, 0.12, [136, 0.1, 65], 'roadMark'),
    boxPart(300, 0.18, 0.3, [135, 0.09, -37.3], 'concreteLight'),
    boxPart(0.3, 0.18, 154, [-8.7, 0.09, 25], 'concreteLight'),
    boxPart(280, 0.18, 0.3, [136, 0.09, 69.2], 'concreteLight'),
  ];
}

function addPipeRoute(
  parts: GeometryPart[],
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  material: MaterialKey,
  radius: number,
): void {
  parts.push(pipePart(from, to, radius, material));
  for (const ratio of [0.22, 0.5, 0.78]) {
    const x = from[0] + (to[0] - from[0]) * ratio;
    const y = from[1] + (to[1] - from[1]) * ratio;
    const z = from[2] + (to[2] - from[2]) * ratio;
    parts.push(pipePart([x, 0, z], [x, y, z], radius * 0.62, 'steelDark', 8));
    parts.push(pipePart(
      [x, y - 0.08, z],
      [x, y + 0.08, z],
      radius * 1.3,
      material,
      8,
    ));
  }
}

function addBuilding(
  document: Document,
  buffer: Buffer,
  materials: Record<MaterialKey, Material>,
  site: Node,
  name: string,
  position: readonly [number, number, number],
  width: number,
  height: number,
  depth: number,
): void {
  site.addChild(addMeshNode(
    document,
    buffer,
    name,
    buildingParts(width, height, depth),
    materials,
    position,
  ));
}

export function createWastewaterPlantDocument(): {
  readonly document: Document;
  readonly equipment: readonly ICEWWTPEquipmentSpec[];
} {
  const document = new Document();
  document.getRoot().getAsset().generator = 'ICE3 virtual wastewater generator';
  const buffer = document.createBuffer('wwtp-buffer');
  const materials = createMaterials(document);
  const scene = document.createScene('SyntheticWastewaterPlant');
  document.getRoot().setDefaultScene(scene);
  const waterArea = document.createNode('WaterTreatmentArea');
  scene.addChild(waterArea);
  const areas = new Map<string, Node>();
  for (const areaName of AREA_NAMES) {
    const area = document.createNode(areaName);
    areas.set(areaName, area);
    if (areaName === 'SiteInfrastructure') {
      scene.addChild(area);
    } else {
      waterArea.addChild(area);
    }
  }

  const byTag = new Map(WASTEWATER_EQUIPMENT.map((item) => [item.tag, item]));
  for (const spec of WASTEWATER_EQUIPMENT) {
    const node = addMeshNode(
      document,
      buffer,
      spec.tag,
      equipmentParts(spec),
      materials,
      spec.position,
    );
    node.setExtras({
      ice3: {
        selectionId: `ice3-virtual-wwtp/equipment/${spec.tag}`,
        equipmentTag: spec.tag,
        processStage: spec.stage,
        displayName: spec.name,
      },
    });
    areas.get(equipmentArea(spec))!.addChild(node);
  }

  const site = areas.get('SiteInfrastructure')!;
  site.addChild(addMeshNode(
    document,
    buffer,
    'SiteGround',
    siteGroundParts(),
    materials,
  ));
  site.addChild(addMeshNode(
    document,
    buffer,
    'RoadNetwork',
    roadNetworkParts(),
    materials,
  ));
  const fence = document.createNode('PerimeterFence');
  site.addChild(fence);
  for (const side of ['north', 'east', 'south', 'west'] as const) {
    fence.addChild(addMeshNode(
      document,
      buffer,
      `PerimeterFence${side[0]!.toUpperCase()}${side.slice(1)}`,
      perimeterFenceParts(side),
      materials,
    ));
  }
  site.addChild(addMeshNode(
    document,
    buffer,
    'UtilityPipeRack',
    utilityRackParts(),
    materials,
  ));

  addBuilding(document, buffer, materials, site, 'HeadworksBuilding', [16, 0, -10], 28, 6.2, 14);
  addBuilding(document, buffer, materials, site, 'ChemicalBuilding', [63, 0, -10], 44, 5.4, 13);
  addBuilding(document, buffer, materials, site, 'BlowerBuilding', [118, 0, 113], 32, 7.2, 13);
  addBuilding(document, buffer, materials, site, 'DewateringBuilding', [151, 0, 113], 34, 7.0, 13);
  addBuilding(document, buffer, materials, site, 'AdministrationBuilding', [224, 0, -53], 44, 7.5, 16);

  const pipeParts: GeometryPart[] = [];
  for (let index = 0; index < MAIN_FLOW_TAGS.length - 1; index += 1) {
    const from = byTag.get(MAIN_FLOW_TAGS[index]!)!;
    const to = byTag.get(MAIN_FLOW_TAGS[index + 1]!)!;
    addPipeRoute(
      pipeParts,
      [from.position[0], 2.8, from.position[2]],
      [to.position[0], 2.8, to.position[2]],
      'waterPipe',
      0.14,
    );
  }
  for (const route of RETURN_FLOW_ROUTES) {
    const from = byTag.get(route.from)!;
    const to = byTag.get(route.to)!;
    addPipeRoute(
      pipeParts,
      [from.position[0], 3.5, from.position[2]],
      [to.position[0], 3.5, to.position[2]],
      route.material,
      0.09,
    );
  }
  for (const [fromTag, toTag, material, height] of [
    ['ST-101', 'DIG-101', 'sludgePipe', 2.9],
    ['ST-101', 'DIG-102', 'sludgePipe', 3.2],
    ['DIG-101', 'DWG-101', 'sludgePipe', 2.7],
    ['DIG-102', 'DWG-101', 'sludgePipe', 3.0],
    ['DIG-101', 'FLARE-101', 'airPipe', 5.0],
    ['DIG-102', 'FLARE-101', 'airPipe', 5.2],
    ['DWG-101', 'DRY-101', 'sludgePipe', 2.7],
    ['DRY-101', 'SILO-101', 'sludgePipe', 2.8],
    ['PAC-101', 'DW-101', 'chemicalPipe', 2.8],
    ['PAM-101', 'CO-101', 'chemicalPipe', 3.0],
    ['NACLO-101', 'DT-101', 'chemicalPipe', 3.2],
    ['CARBON-101', 'AT-101', 'chemicalPipe', 3.4],
    ['BLW-101', 'AE-101', 'airPipe', 3.6],
    ['BLW-102', 'AE-201', 'airPipe', 3.8],
  ] as const) {
    const from = byTag.get(fromTag)!;
    const to = byTag.get(toTag)!;
    addPipeRoute(
      pipeParts,
      [from.position[0], height, from.position[2]],
      [to.position[0], height, to.position[2]],
      material,
      0.1,
    );
  }
  site.addChild(addMeshNode(
    document,
    buffer,
    'ProcessPipes',
    pipeParts,
    materials,
  ));

  return {
    document,
    equipment: WASTEWATER_EQUIPMENT,
  };
}
