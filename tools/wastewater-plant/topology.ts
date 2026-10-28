import type {
  ICEWWTPEquipmentKind,
  ICEWWTPEquipmentSpec,
} from './types.js';
import { MAIN_FLOW_TAGS } from './layout.js';

export type ICEWWTPMedium =
  | 'wastewater'
  | 'primaryEffluent'
  | 'mixedLiquor'
  | 'secondaryEffluent'
  | 'returnActivatedSludge'
  | 'wasteActivatedSludge'
  | 'sludge'
  | 'filtrate'
  | 'chemical'
  | 'air'
  | 'biogas'
  | 'backwash'
  | 'treatedEffluent'
  | 'utilityWater';

export type ICEWWTPPipeLayout = 'rack' | 'direct' | 'buried';

export interface ICEWWTPPortSpec {
  readonly id: string;
  readonly role: 'inlet' | 'outlet' | 'branch' | 'sampling' | 'utility';
  readonly medium: ICEWWTPMedium;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly diameter: number;
}

export interface ICEWWTPEquipmentWithPorts extends ICEWWTPEquipmentSpec {
  readonly ports: readonly ICEWWTPPortSpec[];
}

export interface ICEWWTPEquipmentSceneSpec
  extends ICEWWTPEquipmentWithPorts {
  readonly area: string;
  readonly connectionIds: readonly string[];
}

export interface ICEWWTPConnectionSpec {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly medium: ICEWWTPMedium;
  readonly diameter: number;
  readonly layout: ICEWWTPPipeLayout;
  readonly label: string;
  readonly routePoints: readonly (readonly [number, number, number])[];
}

interface PortLayout {
  readonly halfWidth: number;
  readonly inletHeight: number;
  readonly outletHeight: number;
}

const PORT_LAYOUTS: Record<ICEWWTPEquipmentKind, PortLayout> = {
  inlet: { halfWidth: 4.2, inletHeight: 0.9, outletHeight: 0.9 },
  'bar-screen': { halfWidth: 4.3, inletHeight: 0.9, outletHeight: 0.9 },
  pump: { halfWidth: 2.4, inletHeight: 0.6, outletHeight: 2.2 },
  valve: { halfWidth: 2.0, inletHeight: 0.85, outletHeight: 0.85 },
  'grit-basin': { halfWidth: 5.25, inletHeight: 1.8, outletHeight: 1.8 },
  'grit-classifier': { halfWidth: 2.75, inletHeight: 2.3, outletHeight: 0.8 },
  'rectangular-clarifier': {
    halfWidth: 6.5,
    inletHeight: 2.2,
    outletHeight: 4.1,
  },
  'distribution-well': { halfWidth: 2.4, inletHeight: 2.4, outletHeight: 1.4 },
  'emergency-basin': { halfWidth: 5.3, inletHeight: 1.3, outletHeight: 1.1 },
  'biological-reactor': { halfWidth: 6.1, inletHeight: 2.2, outletHeight: 2.2 },
  'circular-clarifier': { halfWidth: 8.0, inletHeight: 3.0, outletHeight: 3.95 },
  'coagulation-basin': { halfWidth: 6.4, inletHeight: 3.1, outletHeight: 3.1 },
  'filter-cell': { halfWidth: 6.2, inletHeight: 3.0, outletHeight: 3.0 },
  'contact-basin': { halfWidth: 6.6, inletHeight: 2.8, outletHeight: 2.8 },
  'membrane-basin': { halfWidth: 6.6, inletHeight: 3.0, outletHeight: 3.0 },
  'chemical-tank': { halfWidth: 3.0, inletHeight: 2.2, outletHeight: 1.4 },
  blower: { halfWidth: 3.4, inletHeight: 2.0, outletHeight: 3.1 },
  analyzer: { halfWidth: 0.8, inletHeight: 2.35, outletHeight: 2.35 },
  'sludge-thickener': { halfWidth: 6.4, inletHeight: 3.5, outletHeight: 1.2 },
  'sludge-dewatering': { halfWidth: 7.0, inletHeight: 1.5, outletHeight: 1.1 },
  'sludge-dryer': { halfWidth: 5.4, inletHeight: 1.0, outletHeight: 1.0 },
  'sludge-storage': { halfWidth: 3.0, inletHeight: 7.5, outletHeight: 0.7 },
  conveyor: { halfWidth: 5.5, inletHeight: 1.8, outletHeight: 2.3 },
  digester: { halfWidth: 6.0, inletHeight: 1.25, outletHeight: 1.2 },
  flare: { halfWidth: 3.0, inletHeight: 1.0, outletHeight: 1.0 },
  uv: { halfWidth: 6.9, inletHeight: 1.0, outletHeight: 1.0 },
};

function port(
  equipment: ICEWWTPEquipmentSpec,
  id: string,
  role: ICEWWTPPortSpec['role'],
  medium: ICEWWTPMedium,
  local: readonly [number, number, number],
  direction: readonly [number, number, number],
  diameter: number,
): ICEWWTPPortSpec {
  return Object.freeze({
    id,
    role,
    medium,
    position: Object.freeze([
      equipment.position[0] + local[0],
      equipment.position[1] + local[1],
      equipment.position[2] + local[2],
    ] as const),
    direction: Object.freeze([...direction] as [number, number, number]),
    diameter,
  });
}

export function equipmentPorts(
  equipment: ICEWWTPEquipmentSpec,
): readonly ICEWWTPPortSpec[] {
  const layout = PORT_LAYOUTS[equipment.kind];
  const ports: ICEWWTPPortSpec[] = [
    port(
      equipment,
      'inlet',
      'inlet',
      'wastewater',
      [-layout.halfWidth, layout.inletHeight, 0],
      [-1, 0, 0],
      0.38,
    ),
    port(
      equipment,
      'outlet',
      'outlet',
      'wastewater',
      [layout.halfWidth, layout.outletHeight, 0],
      [1, 0, 0],
      0.36,
    ),
  ];
  if (equipment.kind === 'pump') {
    ports.splice(
      0,
      2,
      port(equipment, 'suction', 'inlet', 'wastewater', [-2.35, 0.55, 0], [-1, 0, 0], 0.42),
      port(equipment, 'discharge', 'outlet', 'wastewater', [1.4, 2.15, 0], [1, 0, 0], 0.34),
    );
  }
  if (equipment.kind === 'distribution-well') {
    ports.push(
      port(equipment, 'outlet-b', 'branch', 'primaryEffluent', [0, 3.1, 3.2], [0, 0, 1], 0.32),
    );
  }
  if (equipment.kind === 'biological-reactor') {
    ports.push(
      port(equipment, 'return-in', 'inlet', 'returnActivatedSludge', [-6.3, 2.2, 4.5], [-1, 0, 0], 0.28),
      port(equipment, 'air-in', 'utility', 'air', [0, 5.2, 6.8], [0, 0, 1], 0.18),
      port(equipment, 'recycle-in', 'inlet', 'mixedLiquor', [-6.3, 3.4, -4.5], [-1, 0, 0], 0.28),
      port(equipment, 'recycle-out', 'outlet', 'mixedLiquor', [6.3, 3.4, -4.5], [1, 0, 0], 0.28),
    );
  }
  if (equipment.kind === 'circular-clarifier') {
    ports[0] = port(
      equipment,
      'feed',
      'inlet',
      'mixedLiquor',
      [-8.0, 3.0, 0],
      [-1, 0, 0],
      0.4,
    );
    ports[1] = port(
      equipment,
      'outlet',
      'outlet',
      'secondaryEffluent',
      [8.0, 3.95, 0],
      [1, 0, 0],
      0.36,
    );
    ports.push(
      port(equipment, 'sludge-out', 'outlet', 'returnActivatedSludge', [0, 0.55, 0], [0, -1, 0], 0.28),
      port(equipment, 'scum-out', 'outlet', 'sludge', [0, 3.65, 7.25], [0, 0, 1], 0.12),
    );
  }
  if (equipment.kind === 'filter-cell') {
    ports.push(
      port(equipment, 'backwash-in', 'inlet', 'backwash', [0, 4.0, 4.1], [0, 0, 1], 0.2),
      port(equipment, 'backwash-out', 'outlet', 'backwash', [0, 3.0, -4.2], [0, 0, -1], 0.2),
      port(equipment, 'drain-out', 'outlet', 'filtrate', [5.0, 0.6, -3.6], [0, 0, -1], 0.12),
    );
  }
  if (equipment.kind === 'chemical-tank') {
    ports.push(
      port(equipment, 'drain', 'outlet', 'chemical', [1.9, 0.9, 0], [1, 0, 0], 0.12),
      port(equipment, 'fill-in', 'inlet', 'utilityWater', [0, 4.8, -2.8], [0, 0, -1], 0.12),
      port(equipment, 'vent', 'utility', 'air', [0, 7.1, 0], [0, 1, 0], 0.08),
    );
  }
  if (equipment.kind === 'blower') {
    ports[0] = port(equipment, 'intake', 'inlet', 'air', [-3.3, 1.9, 0], [-1, 0, 0], 0.34);
    ports[1] = port(equipment, 'discharge', 'outlet', 'air', [2.7, 3.1, 0], [1, 0, 0], 0.3);
  }
  if (equipment.kind === 'analyzer') {
    ports.push(
      port(equipment, 'sample', 'sampling', 'treatedEffluent', [0, 2.8, 0], [0, 1, 0], 0.06),
    );
  }
  if (equipment.kind === 'sludge-thickener') {
    ports[0] = port(equipment, 'inlet', 'inlet', 'sludge', [-6.4, 3.5, 0], [-1, 0, 0], 0.3);
    ports[1] = port(equipment, 'outlet', 'outlet', 'sludge', [6.4, 1.2, 0], [1, 0, 0], 0.26);
    ports.push(
      port(equipment, 'supernatant-out', 'outlet', 'filtrate', [6.4, 3.9, -2.4], [1, 0, 0], 0.16),
    );
  }
  if (equipment.kind === 'sludge-dewatering') {
    ports[0] = port(
      equipment,
      'sludge-in',
      'inlet',
      'sludge',
      [-7.0, 1.5, 0],
      [-1, 0, 0],
      0.28,
    );
    ports.push(
      port(equipment, 'cake-out', 'outlet', 'sludge', [5.0, 1.0, 0], [1, 0, 0], 0.22),
      port(equipment, 'filtrate-out', 'outlet', 'filtrate', [2.0, 0.7, -2.4], [0, 0, -1], 0.16),
      port(equipment, 'polymer-in', 'inlet', 'chemical', [-2.6, 1.4, -2.6], [0, 0, -1], 0.1),
    );
  }
  if (equipment.kind === 'sludge-dryer') {
    ports.push(
      port(equipment, 'solids-out', 'outlet', 'sludge', [5.2, 0.9, 0], [1, 0, 0], 0.22),
      port(equipment, 'vapor-out', 'outlet', 'air', [2.6, 5.7, 1.8], [0, 1, 0], 0.2),
    );
  }
  if (equipment.kind === 'sludge-storage') {
    ports[0] = port(equipment, 'solids-in', 'inlet', 'sludge', [0, 8.8, 0], [0, 1, 0], 0.24);
    ports[1] = port(equipment, 'solids-out', 'outlet', 'sludge', [0, 0.7, 0], [0, -1, 0], 0.22);
  }
  if (equipment.kind === 'conveyor') {
    ports[0] = port(equipment, 'solids-in', 'inlet', 'sludge', [-5.2, 1.9, 0], [-1, 0, 0], 0.2);
    ports[1] = port(equipment, 'solids-out', 'outlet', 'sludge', [5.4, 2.3, 0], [1, 0, 0], 0.2);
  }
  if (equipment.kind === 'digester') {
    ports[0] = port(equipment, 'sludge-in', 'inlet', 'sludge', [-6.0, 1.25, 0], [-1, 0, 0], 0.3);
    ports[1] = port(equipment, 'sludge-out', 'outlet', 'sludge', [6.0, 1.2, 0], [1, 0, 0], 0.28);
    ports.push(
      port(equipment, 'gas-out', 'outlet', 'biogas', [3.2, 10.2, 0], [0, 1, 0], 0.18),
    );
  }
  if (equipment.kind === 'flare') {
    ports[0] = port(equipment, 'gas-in', 'inlet', 'biogas', [-3.0, 1.0, 0], [-1, 0, 0], 0.18);
  }
  if (equipment.kind === 'contact-basin') {
    ports.push(
      port(equipment, 'chemical-in', 'inlet', 'chemical', [0, 4.5, 4.8], [0, 0, 1], 0.1),
    );
  }
  if (equipment.kind === 'membrane-basin') {
    ports.push(
      port(equipment, 'backwash-in', 'inlet', 'backwash', [0, 4.6, 4.8], [0, 0, 1], 0.16),
      port(equipment, 'cleaning-in', 'inlet', 'chemical', [5.8, 4.2, 0], [1, 0, 0], 0.1),
    );
  }
  if (equipment.kind === 'grit-classifier') {
    ports.push(
      port(equipment, 'grit-out', 'outlet', 'sludge', [2.8, 1.0, 0], [1, 0, 0], 0.14),
    );
  }
  if (equipment.kind === 'rectangular-clarifier') {
    ports.push(
      port(equipment, 'sludge-out', 'outlet', 'sludge', [0, 0.6, -5.4], [0, 0, -1], 0.18),
    );
  }
  return Object.freeze(ports);
}

function endpoint(tag: string, portId: string): string {
  return `${tag}:${portId}`;
}

function mainFlowEndpoint(
  tag: string,
  direction: 'from' | 'to',
  equipment: readonly ICEWWTPEquipmentWithPorts[],
): string {
  const item = equipment.find((candidate) => candidate.tag === tag)!;
  if (item.kind === 'pump') {
    return endpoint(tag, direction === 'from' ? 'discharge' : 'suction');
  }
  if (item.kind === 'circular-clarifier') {
    return endpoint(tag, direction === 'from' ? 'outlet' : 'feed');
  }
  return endpoint(tag, direction === 'from' ? 'outlet' : 'inlet');
}

type ConnectionDefinition = Omit<ICEWWTPConnectionSpec, 'routePoints'>;

function connection(
  id: string,
  from: string,
  to: string,
  medium: ICEWWTPMedium,
  diameter: number,
  layout: ICEWWTPPipeLayout,
  label: string,
): ConnectionDefinition {
  return Object.freeze({
    id,
    from: endpoint(from.split(':')[0]!, from.split(':')[1]!),
    to: endpoint(to.split(':')[0]!, to.split(':')[1]!),
    medium,
    diameter,
    layout,
    label,
  });
}

export function processConnections(
  equipment: readonly ICEWWTPEquipmentWithPorts[],
): readonly ICEWWTPConnectionSpec[] {
  const result: ConnectionDefinition[] = [];
  for (let index = 0; index < MAIN_FLOW_TAGS.length - 1; index += 1) {
    const from = MAIN_FLOW_TAGS[index]!;
    const to = MAIN_FLOW_TAGS[index + 1]!;
    const biological = /^(AT|AX|AE)-/.test(from)
      || /^(AT|AX|AE|SC)-/.test(to);
    const medium: ICEWWTPMedium = to.startsWith('AT-')
      ? 'primaryEffluent'
      : biological
        ? 'mixedLiquor'
        : to.startsWith('UV-') || index >= 20
          ? 'treatedEffluent'
          : index <= 7
            ? 'wastewater'
            : 'secondaryEffluent';
    result.push(connection(
      `main-${String(index + 1).padStart(2, '0')}-${from}-${to}`,
      mainFlowEndpoint(from, 'from', equipment),
      mainFlowEndpoint(to, 'to', equipment),
      medium,
      medium === 'wastewater' ? 0.42 : 0.34,
      'rack',
      `${from} → ${to}`,
    ));
  }
  const extra: ConnectionDefinition[] = [
    connection('branch-b-01', 'DW-101:outlet-b', 'AT-201:inlet', 'primaryEffluent', 0.34, 'rack', 'B 线配水'),
    connection('branch-b-02', 'AT-201:outlet', 'AX-201:inlet', 'mixedLiquor', 0.34, 'rack', 'B 线厌氧至缺氧'),
    connection('branch-b-03', 'AX-201:outlet', 'AE-201:inlet', 'mixedLiquor', 0.34, 'rack', 'B 线缺氧至好氧'),
    connection('branch-b-04', 'AE-201:outlet', 'SC-201:feed', 'mixedLiquor', 0.4, 'rack', 'B 线好氧至二沉'),
    connection('branch-b-05', 'SC-201:outlet', 'P-LIFT-112:suction', 'secondaryEffluent', 0.34, 'direct', 'B 线二沉出水'),
    connection('branch-b-06', 'P-LIFT-112:discharge', 'CO-101:inlet', 'secondaryEffluent', 0.34, 'rack', 'B 线提升至深度处理'),
    connection('pump-b-01', 'GR-101:outlet', 'P-102:suction', 'wastewater', 0.36, 'direct', '备用进水泵支路'),
    connection('pump-b-02', 'P-102:discharge', 'CV-101:inlet', 'wastewater', 0.34, 'rack', '备用进水泵汇合'),
    connection('grit-water-01', 'GW-101:outlet', 'DW-101:inlet', 'wastewater', 0.18, 'rack', '沉砂分离出水'),
    connection('storm-01', 'EQ-101:outlet', 'P-EQ-101:suction', 'wastewater', 0.28, 'buried', '事故池排水'),
    connection('storm-02', 'P-EQ-101:discharge', 'DW-101:inlet', 'wastewater', 0.28, 'rack', '事故水回流'),
    connection('ras-a-01', 'SC-101:sludge-out', 'P-RAS-101:suction', 'returnActivatedSludge', 0.3, 'buried', 'A 线回流污泥'),
    connection('ras-a-02', 'P-RAS-101:discharge', 'AT-101:return-in', 'returnActivatedSludge', 0.3, 'rack', 'A 线回流至厌氧池'),
    connection('ras-b-01', 'SC-201:sludge-out', 'P-RAS-201:suction', 'returnActivatedSludge', 0.3, 'buried', 'B 线回流污泥'),
    connection('ras-b-02', 'P-RAS-201:discharge', 'AT-201:return-in', 'returnActivatedSludge', 0.3, 'rack', 'B 线回流至厌氧池'),
    connection('was-01', 'SC-101:sludge-out', 'P-WAS-301:suction', 'wasteActivatedSludge', 0.24, 'buried', '剩余污泥'),
    connection('was-02', 'P-WAS-301:discharge', 'ST-101:inlet', 'wasteActivatedSludge', 0.24, 'rack', '剩余污泥至浓缩池'),
    connection('sludge-01', 'ST-101:outlet', 'P-SL-101:suction', 'sludge', 0.26, 'rack', '浓缩污泥'),
    connection('sludge-02', 'P-SL-101:discharge', 'DIG-101:sludge-in', 'sludge', 0.26, 'rack', '浓缩污泥至消化池'),
    connection('sludge-03', 'DIG-101:sludge-out', 'DIG-102:sludge-in', 'sludge', 0.26, 'rack', '串联消化'),
    connection('sludge-04', 'DIG-102:sludge-out', 'DWG-101:sludge-in', 'sludge', 0.25, 'rack', '消化污泥至脱水'),
    connection('sludge-05', 'DWG-101:cake-out', 'DRY-101:inlet', 'sludge', 0.2, 'direct', '脱水至干化'),
    connection('sludge-06', 'DRY-101:solids-out', 'SILO-101:solids-in', 'sludge', 0.2, 'rack', '干化至料仓'),
    connection('sludge-07', 'SILO-101:solids-out', 'CONV-101:solids-in', 'sludge', 0.2, 'direct', '料仓至输送机'),
    connection('filtrate-01', 'DWG-101:filtrate-out', 'DW-101:inlet', 'filtrate', 0.16, 'rack', '滤液回流'),
    connection('backwash-01', 'FL-101:backwash-out', 'P-BW-301:suction', 'backwash', 0.2, 'rack', '滤池反冲洗水'),
    connection('backwash-02', 'P-BW-301:discharge', 'MOV-301:inlet', 'backwash', 0.2, 'rack', '反冲洗供水'),
    connection('backwash-03', 'MOV-301:outlet', 'FL-101:backwash-in', 'backwash', 0.2, 'rack', '反冲洗阀后供水'),
    connection('air-01', 'BLW-101:discharge', 'AE-101:air-in', 'air', 0.22, 'rack', 'A 线曝气总管'),
    connection('air-02', 'BLW-102:discharge', 'AE-201:air-in', 'air', 0.22, 'rack', 'B 线曝气总管'),
    connection('chemical-01a', 'PAC-101:outlet', 'PAC-102:suction', 'chemical', 0.08, 'direct', 'PAC 计量泵吸入'),
    connection('chemical-01b', 'PAC-102:discharge', 'CO-101:inlet', 'chemical', 0.08, 'rack', 'PAC 投加'),
    connection('chemical-02a', 'PAM-101:outlet', 'PAM-102:suction', 'chemical', 0.08, 'direct', 'PAM 计量泵吸入'),
    connection('chemical-02b', 'PAM-102:discharge', 'DWG-101:polymer-in', 'chemical', 0.08, 'rack', 'PAM 投加'),
    connection('chemical-03a', 'NACLO-101:outlet', 'NACLO-102:suction', 'chemical', 0.08, 'direct', '次氯酸钠计量泵吸入'),
    connection('chemical-03b', 'NACLO-102:discharge', 'DT-101:inlet', 'chemical', 0.08, 'rack', '次氯酸钠投加'),
    connection('chemical-04a', 'CARBON-101:outlet', 'CARBON-102:suction', 'chemical', 0.08, 'direct', '碳源计量泵吸入'),
    connection('chemical-04b', 'CARBON-102:discharge', 'AT-101:inlet', 'chemical', 0.08, 'rack', '碳源投加'),
    connection('sample-01', 'UV-101:outlet', 'AIT-COD-101:sample', 'treatedEffluent', 0.035, 'rack', 'COD 取样'),
    connection('sample-02', 'UV-101:outlet', 'AIT-NH3-101:sample', 'treatedEffluent', 0.035, 'rack', '氨氮取样'),
    connection('sample-03', 'UV-101:outlet', 'AIT-TP-101:sample', 'treatedEffluent', 0.035, 'rack', '总磷取样'),
    connection('sample-04', 'UV-101:outlet', 'AIT-TN-101:sample', 'treatedEffluent', 0.035, 'rack', '总氮取样'),
    connection('sample-05', 'UV-101:outlet', 'AIT-TU-101:sample', 'treatedEffluent', 0.035, 'rack', '浊度取样'),
    connection('odor-01', 'ODR-101:discharge', 'ODR-102:intake', 'air', 0.26, 'rack', '臭气一级处理'),
    connection('odor-02', 'ODR-102:discharge', 'FAN-101:intake', 'air', 0.26, 'rack', '臭气增压'),
    connection('odor-03', 'FAN-101:discharge', 'GR-101:inlet', 'air', 0.26, 'rack', '除臭排放'),
    connection('gas-01', 'DIG-102:gas-out', 'FLARE-101:gas-in', 'biogas', 0.16, 'rack', '沼气至火炬'),
    connection('loop-a-01', 'AE-101:recycle-out', 'AX-101:recycle-in', 'mixedLiquor', 0.28, 'rack', 'A 线混合液内回流'),
    connection('loop-b-01', 'AE-201:recycle-out', 'AX-201:recycle-in', 'mixedLiquor', 0.28, 'rack', 'B 线混合液内回流'),
    connection('ras-ax-a-01', 'P-RAS-101:discharge', 'AX-101:return-in', 'returnActivatedSludge', 0.24, 'rack', 'A 线回流至缺氧池'),
    connection('ras-ax-b-01', 'P-RAS-201:discharge', 'AX-201:return-in', 'returnActivatedSludge', 0.24, 'rack', 'B 线回流至缺氧池'),
    connection('air-at-a-01', 'BLW-101:discharge', 'AT-101:air-in', 'air', 0.16, 'rack', 'A 线厌氧池吹扫空气'),
    connection('air-ax-a-01', 'BLW-101:discharge', 'AX-101:air-in', 'air', 0.16, 'rack', 'A 线缺氧池辅助空气'),
    connection('air-at-b-01', 'BLW-102:discharge', 'AT-201:air-in', 'air', 0.16, 'rack', 'B 线厌氧池吹扫空气'),
    connection('air-ax-b-01', 'BLW-102:discharge', 'AX-201:air-in', 'air', 0.16, 'rack', 'B 线缺氧池辅助空气'),
    connection('supernatant-01', 'ST-101:supernatant-out', 'DW-101:inlet', 'filtrate', 0.16, 'rack', '浓缩池上清液回流'),
    connection('filter-return-01', 'FL-101:backwash-out', 'DW-101:inlet', 'filtrate', 0.14, 'rack', '滤池反洗水回流'),
    connection('primary-scum-01', 'PC-101:sludge-out', 'ST-101:inlet', 'sludge', 0.18, 'rack', '初沉污泥至浓缩池'),
    connection('scum-a-01', 'SC-101:scum-out', 'ST-101:inlet', 'sludge', 0.12, 'rack', 'A 线浮渣收集'),
    connection('scum-b-01', 'SC-201:scum-out', 'ST-101:inlet', 'sludge', 0.12, 'rack', 'B 线浮渣收集'),
    connection('membrane-backwash-01', 'P-BW-301:discharge', 'UF-101:backwash-in', 'backwash', 0.16, 'rack', '膜池反冲洗'),
    connection('membrane-clean-01', 'NACLO-101:outlet', 'UF-101:cleaning-in', 'chemical', 0.1, 'rack', '膜池在线清洗'),
    connection('service-water-pac', 'UV-101:outlet', 'PAC-101:fill-in', 'utilityWater', 0.1, 'rack', 'PAC 药剂配制水'),
    connection('service-water-pam', 'UV-101:outlet', 'PAM-101:fill-in', 'utilityWater', 0.1, 'rack', 'PAM 药剂配制水'),
    connection('service-water-na', 'UV-101:outlet', 'NACLO-101:fill-in', 'utilityWater', 0.1, 'rack', '次氯酸钠稀释水'),
    connection('service-water-carbon', 'UV-101:outlet', 'CARBON-101:fill-in', 'utilityWater', 0.1, 'rack', '碳源配制水'),
    connection('chemical-contact-01', 'NACLO-101:outlet', 'DT-101:chemical-in', 'chemical', 0.1, 'rack', '消毒剂投加'),
    connection('chemical-coag-01', 'PAM-101:outlet', 'CO-101:inlet', 'chemical', 0.08, 'rack', '助凝剂投加'),
    connection('filter-drain-01', 'FL-101:drain-out', 'DW-101:inlet', 'filtrate', 0.12, 'rack', '滤池检修排水'),
  ];
  const ports = new Map<string, ICEWWTPPortSpec>(equipment.flatMap((item) => (
    item.ports.map((itemPort) => (
      [`${item.tag}:${itemPort.id}`, itemPort] as const
    ))
  )));
  const elevationByMedium: Readonly<Record<ICEWWTPMedium, number>> = {
    wastewater: 0,
    primaryEffluent: 0.12,
    mixedLiquor: 0.24,
    secondaryEffluent: 0.36,
    returnActivatedSludge: 0.48,
    wasteActivatedSludge: 0.60,
    sludge: 0.72,
    filtrate: 0.84,
    chemical: 0.96,
    air: 1.08,
    biogas: 1.20,
    backwash: 1.32,
    treatedEffluent: 1.44,
    utilityWater: 1.56,
  };

  function appendPoint(
    points: [number, number, number][],
    point: readonly [number, number, number],
  ): void {
    const previous = points.at(-1);
    if (
      !previous
      || Math.hypot(
        point[0] - previous[0],
        point[1] - previous[1],
        point[2] - previous[2],
      ) > 0.001
    ) {
      points.push([...point] as [number, number, number]);
    }
  }

  function routePoints(
    route: ConnectionDefinition,
    index: number,
  ): readonly [number, number, number][] {
    const startPort = ports.get(route.from)!;
    const endPort = ports.get(route.to)!;
    const start = startPort.position;
    const end = endPort.position;
    const startDirection = startPort.direction;
    const endDirection = endPort.direction;
    const startStub = start.map((value, axis) => (
      value + startDirection[axis]! * 0.9
    )) as [number, number, number];
    const endStub = end.map((value, axis) => (
      value + endDirection[axis]! * 0.9
    )) as [number, number, number];
    const elevation = route.layout === 'buried'
      ? 0.75 + (index % 3) * 0.08
      : Math.max(3.8, start[1], end[1])
        + 0.25
        + elevationByMedium[route.medium]
        + (index % 3) * 0.04;
    const points: [number, number, number][] = [];
    appendPoint(points, start);
    appendPoint(points, startStub);
    appendPoint(points, [startStub[0], elevation, startStub[2]]);
    appendPoint(points, [endStub[0], elevation, startStub[2]]);
    appendPoint(points, [endStub[0], elevation, endStub[2]]);
    appendPoint(points, endStub);
    appendPoint(points, end);
    return Object.freeze(points);
  }

  return Object.freeze([
    ...result.map((route, index) => Object.freeze({
      ...route,
      routePoints: routePoints(route, index),
    })),
    ...extra.map((route, index) => Object.freeze({
      ...route,
      routePoints: routePoints(route, result.length + index),
    })),
  ]);
}
