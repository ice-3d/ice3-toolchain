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
  'grit-basin': { halfWidth: 5.25, inletHeight: 1.2, outletHeight: 1.2 },
  'grit-classifier': { halfWidth: 2.75, inletHeight: 2.3, outletHeight: 0.8 },
  'rectangular-clarifier': {
    halfWidth: 6.5,
    inletHeight: 1.2,
    outletHeight: 2.5,
  },
  'distribution-well': { halfWidth: 2.4, inletHeight: 2.4, outletHeight: 1.4 },
  'emergency-basin': { halfWidth: 5.3, inletHeight: 1.3, outletHeight: 1.1 },
  'biological-reactor': { halfWidth: 6.1, inletHeight: 1.2, outletHeight: 1.2 },
  'circular-clarifier': { halfWidth: 8.0, inletHeight: 2.35, outletHeight: 1.0 },
  'coagulation-basin': { halfWidth: 6.4, inletHeight: 1.45, outletHeight: 1.45 },
  'filter-cell': { halfWidth: 6.2, inletHeight: 1.5, outletHeight: 1.5 },
  'contact-basin': { halfWidth: 6.6, inletHeight: 1.4, outletHeight: 1.4 },
  'membrane-basin': { halfWidth: 6.6, inletHeight: 1.4, outletHeight: 1.4 },
  'chemical-tank': { halfWidth: 2.85, inletHeight: 1.2, outletHeight: 1.0 },
  blower: { halfWidth: 3.1, inletHeight: 1.5, outletHeight: 2.5 },
  analyzer: { halfWidth: 0.8, inletHeight: 2.35, outletHeight: 2.35 },
  'sludge-thickener': { halfWidth: 6.4, inletHeight: 2.6, outletHeight: 1.2 },
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
      port(equipment, 'return-in', 'inlet', 'returnActivatedSludge', [-6.3, 1.2, 4.5], [-1, 0, 0], 0.28),
      port(equipment, 'air-in', 'utility', 'air', [0, 2.7, 6.8], [0, 0, 1], 0.18),
    );
  }
  if (equipment.kind === 'circular-clarifier') {
    ports[0] = port(
      equipment,
      'feed',
      'inlet',
      'mixedLiquor',
      [-8.0, 2.35, 0],
      [-1, 0, 0],
      0.4,
    );
    ports.push(
      port(equipment, 'sludge-out', 'outlet', 'returnActivatedSludge', [0, 0.55, 0], [0, -1, 0], 0.28),
    );
  }
  if (equipment.kind === 'filter-cell') {
    ports.push(
      port(equipment, 'backwash-in', 'inlet', 'backwash', [0, 2.72, 4.1], [0, 0, 1], 0.2),
      port(equipment, 'backwash-out', 'outlet', 'backwash', [0, 1.55, -4.2], [0, 0, -1], 0.2),
    );
  }
  if (equipment.kind === 'chemical-tank') {
    ports.push(
      port(equipment, 'drain', 'outlet', 'chemical', [1.9, 0.9, 0], [1, 0, 0], 0.12),
    );
  }
  if (equipment.kind === 'blower') {
    ports[0] = port(equipment, 'intake', 'inlet', 'air', [-3.0, 1.5, 0], [-1, 0, 0], 0.34);
    ports[1] = port(equipment, 'discharge', 'outlet', 'air', [2.4, 2.55, 0], [1, 0, 0], 0.3);
  }
  if (equipment.kind === 'analyzer') {
    ports.push(
      port(equipment, 'sample', 'sampling', 'treatedEffluent', [0, 2.8, 0], [0, 1, 0], 0.06),
    );
  }
  if (equipment.kind === 'sludge-thickener') {
    ports[0] = port(equipment, 'inlet', 'inlet', 'sludge', [-6.4, 2.55, 0], [-1, 0, 0], 0.3);
    ports[1] = port(equipment, 'outlet', 'outlet', 'sludge', [6.4, 1.2, 0], [1, 0, 0], 0.26);
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

function connection(
  id: string,
  from: string,
  to: string,
  medium: ICEWWTPMedium,
  diameter: number,
  layout: ICEWWTPPipeLayout,
  label: string,
): ICEWWTPConnectionSpec {
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
  const result: ICEWWTPConnectionSpec[] = [];
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
  const extra: ICEWWTPConnectionSpec[] = [
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
  ];
  return Object.freeze([...result, ...extra]);
}
