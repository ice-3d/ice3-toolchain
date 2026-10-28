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
  createBox,
  createCylinder,
  createOpenCylinder,
  createPipeSegment,
} from './primitives.js';
import type {
  ICEWWTPEquipmentSpec,
  ICEWWTPMeshData,
} from './types.js';

type MaterialKey = keyof typeof WASTEWATER_PALETTE;

interface GeometryPart {
  readonly data: ICEWWTPMeshData;
  readonly material: MaterialKey;
}

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

function translated(
  data: ICEWWTPMeshData,
  offset: readonly [number, number, number],
): ICEWWTPMeshData {
  const positions = new Float32Array(data.positions);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = positions[index]! + offset[0];
    positions[index + 1] = positions[index + 1]! + offset[1];
    positions[index + 2] = positions[index + 2]! + offset[2];
  }
  return Object.freeze({
    positions,
    normals: new Float32Array(data.normals),
    indices: new Uint32Array(data.indices),
  });
}

function boxPart(
  width: number,
  height: number,
  depth: number,
  offset: readonly [number, number, number],
  material: MaterialKey,
): GeometryPart {
  return {
    data: translated(createBox(width, height, depth), offset),
    material,
  };
}

function cylinderPart(
  radius: number,
  height: number,
  offset: readonly [number, number, number],
  material: MaterialKey,
  open = false,
): GeometryPart {
  return {
    data: translated(
      open
        ? createOpenCylinder(radius, height, 20)
        : createCylinder(radius, height, 20),
      offset,
    ),
    material,
  };
}

function pipePart(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  radius: number,
  material: MaterialKey,
): GeometryPart {
  return {
    data: createPipeSegment(from, to, radius),
    material,
  };
}

function railingParts(
  width: number,
  depth: number,
  height: number,
): GeometryPart[] {
  const posts = 5;
  const parts: GeometryPart[] = [];
  for (let index = 0; index < posts; index += 1) {
    const x = -width / 2 + index / (posts - 1) * width;
    parts.push(boxPart(0.08, 0.8, 0.08, [x, height + 0.4, depth / 2], 'safety'));
  }
  parts.push(boxPart(width, 0.08, 0.08, [0, height + 0.78, depth / 2], 'safety'));
  return parts;
}

function basinParts(
  width = 8,
  depth = 5,
  height = 1.8,
): GeometryPart[] {
  return [
    boxPart(width, 0.25, depth, [0, 0.125, 0], 'concreteDark'),
    boxPart(0.3, height, depth, [-width / 2, height / 2, 0], 'concrete'),
    boxPart(0.3, height, depth, [width / 2, height / 2, 0], 'concrete'),
    boxPart(width, height, 0.3, [0, height / 2, -depth / 2], 'concrete'),
    boxPart(width, height, 0.3, [0, height / 2, depth / 2], 'concrete'),
    boxPart(width - 0.5, 0.08, depth - 0.5, [0, height * 0.72, 0], 'water'),
    boxPart(width + 1, 0.16, 0.9, [0, height, depth / 2 + 0.45], 'concreteDark'),
    ...railingParts(width + 1, 0.9, height + 0.1),
  ];
}

function clarifierParts(radius = 4.2): GeometryPart[] {
  return [
    cylinderPart(radius + 0.3, 0.25, [0, 0.125, 0], 'concreteDark'),
    cylinderPart(radius + 0.3, 2.2, [0, 1.1, 0], 'concrete', true),
    cylinderPart(radius - 0.22, 0.08, [0, 1.55, 0], 'water'),
    cylinderPart(0.35, 2.5, [0, 1.35, 0], 'equipmentDark'),
    boxPart(radius * 2, 0.25, 0.8, [0, 2.55, 0], 'equipment'),
    boxPart(radius * 2, 0.08, 0.08, [0, 2.95, 0.35], 'safety'),
  ];
}

function pumpParts(): GeometryPart[] {
  return [
    boxPart(2.1, 0.3, 1.4, [0, 0.15, 0], 'concreteDark'),
    cylinderPart(0.5, 1.15, [-0.35, 0.9, 0], 'equipment'),
    cylinderPart(0.38, 0.75, [0.55, 0.9, 0], 'equipmentDark'),
    boxPart(0.35, 0.45, 0.35, [1.05, 0.7, 0], 'instrument'),
    pipePart([-0.35, 0.5, 0], [-1.25, 0.5, 0], 0.16, 'waterPipe'),
    pipePart([1, 0.5, 0], [1.75, 0.5, 0], 0.16, 'waterPipe'),
  ];
}

function screenParts(): GeometryPart[] {
  const parts: GeometryPart[] = [
    boxPart(4.6, 0.4, 2.5, [0, 0.2, 0], 'concreteDark'),
    boxPart(3.8, 2.2, 1.7, [0, 1.3, 0], 'equipmentDark'),
    boxPart(4, 0.45, 1.8, [0, 0.55, 0], 'water'),
    boxPart(0.7, 0.7, 0.7, [1.8, 2.3, 0], 'equipment'),
  ];
  for (let index = 0; index < 8; index += 1) {
    parts.push(boxPart(
      0.07,
      1.75,
      0.08,
      [-1.45 + index * 0.42, 1.35, 0.9],
      'safety',
    ));
  }
  return parts;
}

function blowerParts(): GeometryPart[] {
  return [
    boxPart(3.4, 0.35, 2.2, [0, 0.175, 0], 'concreteDark'),
    boxPart(2.9, 1.6, 1.8, [0, 1.15, 0], 'equipment'),
    cylinderPart(0.46, 1.1, [-0.65, 1.4, 0.7], 'equipmentDark'),
    boxPart(0.75, 0.55, 0.08, [0.75, 1.35, 0.94], 'instrument'),
    pipePart([-0.65, 1.2, 0.7], [-0.65, 0.35, 1.55], 0.12, 'airPipe'),
  ];
}

function filterParts(): GeometryPart[] {
  return [
    boxPart(5.4, 0.3, 3.4, [0, 0.15, 0], 'concreteDark'),
    boxPart(0.25, 1.5, 3.4, [-2.7, 0.75, 0], 'concrete'),
    boxPart(0.25, 1.5, 3.4, [2.7, 0.75, 0], 'concrete'),
    boxPart(5.4, 1.5, 0.25, [0, 0.75, -1.7], 'concrete'),
    boxPart(5.4, 1.5, 0.25, [0, 0.75, 1.7], 'concrete'),
    boxPart(4.9, 0.12, 2.9, [0, 1.05, 0], 'water'),
    boxPart(1.25, 0.4, 2.4, [-1.6, 0.62, 0], 'concreteDark'),
    boxPart(1.25, 0.4, 2.4, [0, 0.62, 0], 'concreteDark'),
    boxPart(1.25, 0.4, 2.4, [1.6, 0.62, 0], 'concreteDark'),
  ];
}

function valveParts(): GeometryPart[] {
  return [
    cylinderPart(0.42, 0.9, [0, 0.55, 0], 'equipment'),
    boxPart(0.7, 0.55, 0.7, [0, 1.25, 0], 'equipmentDark'),
    boxPart(0.9, 0.16, 0.5, [0, 1.58, 0], 'safety'),
    pipePart([-1.5, 0.55, 0], [1.5, 0.55, 0], 0.16, 'waterPipe'),
  ];
}

function analyzerParts(): GeometryPart[] {
  return [
    cylinderPart(0.08, 2.8, [0, 1.4, 0], 'equipmentDark'),
    boxPart(1.05, 1.25, 0.52, [0, 2.1, 0], 'instrument'),
    boxPart(0.72, 0.42, 0.06, [0, 2.28, 0.29], 'water'),
    boxPart(0.12, 1.7, 0.12, [0.72, 0.85, 0], 'chemicalPipe'),
  ];
}

function equipmentParts(spec: ICEWWTPEquipmentSpec): GeometryPart[] {
  switch (spec.kind) {
    case 'clarifier':
      return clarifierParts();
    case 'pump':
      return pumpParts();
    case 'screen':
      return screenParts();
    case 'blower':
      return blowerParts();
    case 'filter':
      return filterParts();
    case 'valve':
      return valveParts();
    case 'analyzer':
      return analyzerParts();
    case 'basin':
      return basinParts();
  }
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
  for (const part of parts) {
    appendPrimitive(document, buffer, mesh, part.data, materials[part.material]);
  }
  const node = document.createNode(name).setMesh(mesh).setTranslation([
    position[0],
    position[1],
    position[2],
  ]);
  return node;
}

function siteParts(): GeometryPart[] {
  return [
    boxPart(284, 0.16, 124, [0, -0.08, 0], 'terrain'),
    boxPart(280, 0.08, 6, [0, 0.06, -35], 'road'),
    boxPart(280, 0.08, 6, [0, 0.06, 30], 'road'),
    boxPart(6, 0.08, 124, [-128, 0.06, 0], 'road'),
    boxPart(6, 0.08, 124, [128, 0.06, 0], 'road'),
    boxPart(26, 6, 16, [108, 3, 102], 'concreteDark'),
    boxPart(18, 5, 12, [141, 2.5, 104], 'concrete'),
    boxPart(20, 4, 10, [31, 2, 96], 'concrete'),
    boxPart(7, 1.1, 7, [-126, 0.55, -54], 'equipmentDark'),
    boxPart(7, 1.1, 7, [126, 0.55, -54], 'equipmentDark'),
  ];
}

function pipeNode(
  document: Document,
  buffer: Buffer,
  materials: Record<MaterialKey, Material>,
  name: string,
  parts: readonly GeometryPart[],
): Node {
  return addMeshNode(document, buffer, name, parts, materials);
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
  const siteNode = addMeshNode(
    document,
    buffer,
    'SiteGeometry',
    siteParts(),
    materials,
  );
  site.addChild(siteNode);

  const pipePartsList: GeometryPart[] = [];
  for (let index = 0; index < MAIN_FLOW_TAGS.length - 1; index += 1) {
    const from = byTag.get(MAIN_FLOW_TAGS[index]!)!;
    const to = byTag.get(MAIN_FLOW_TAGS[index + 1]!)!;
    pipePartsList.push(pipePart(
      [from.position[0], 2.4, from.position[2]],
      [to.position[0], 2.4, to.position[2]],
      0.13,
      'waterPipe',
    ));
  }
  for (const route of RETURN_FLOW_ROUTES) {
    const from = byTag.get(route.from)!;
    const to = byTag.get(route.to)!;
    pipePartsList.push(pipePart(
      [from.position[0], 3.1, from.position[2]],
      [to.position[0], 3.1, to.position[2]],
      0.09,
      route.material,
    ));
  }
  for (const [fromTag, toTag, material] of [
    ['ST-101', 'DWG-101', 'sludgePipe'],
    ['DWG-101', 'DRY-101', 'sludgePipe'],
    ['DRY-101', 'SILO-101', 'sludgePipe'],
    ['PAC-101', 'DW-101', 'chemicalPipe'],
    ['PAM-101', 'CO-101', 'chemicalPipe'],
    ['NACLO-101', 'DT-101', 'chemicalPipe'],
    ['CARBON-101', 'AT-101', 'chemicalPipe'],
    ['BLW-101', 'AE-101', 'airPipe'],
    ['BLW-102', 'AE-201', 'airPipe'],
  ] as const) {
    const from = byTag.get(fromTag)!;
    const to = byTag.get(toTag)!;
    pipePartsList.push(pipePart(
      [from.position[0], 2.8, from.position[2]],
      [to.position[0], 2.8, to.position[2]],
      0.1,
      material,
    ));
  }
  site.addChild(pipeNode(document, buffer, materials, 'ProcessPipes', pipePartsList));

  return {
    document,
    equipment: WASTEWATER_EQUIPMENT,
  };
}
