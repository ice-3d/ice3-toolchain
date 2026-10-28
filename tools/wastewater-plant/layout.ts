import type { ICEWWTPEquipmentSpec } from './types.js';

export const AREA_NAMES = Object.freeze([
  'IntakeArea',
  'PrimaryTreatmentArea',
  'BiologicalTrainA',
  'BiologicalTrainB',
  'SecondaryTreatmentArea',
  'AdvancedTreatmentArea',
  'DischargeArea',
  'SludgeTreatmentArea',
  'ChemicalDosingArea',
  'UtilitiesArea',
  'SiteInfrastructure',
]);

export function equipmentArea(
  equipment: ICEWWTPEquipmentSpec,
): string {
  const tag = equipment.tag;
  if (
    tag.startsWith('IN-')
    || tag.startsWith('GR-')
    || tag.startsWith('GC-')
    || tag.startsWith('GW-')
    || tag === 'P-101'
    || tag === 'P-102'
    || tag === 'CV-101'
  ) {
    return 'IntakeArea';
  }
  if (
    tag.startsWith('PC-')
    || tag.startsWith('DW-')
    || tag.startsWith('EQ-')
    || tag.startsWith('P-EQ-')
  ) {
    return 'PrimaryTreatmentArea';
  }
  if (tag.startsWith('AT-') || tag.startsWith('AX-') || tag.startsWith('AE-')) {
    return tag.endsWith('1') ? 'BiologicalTrainA' : 'BiologicalTrainB';
  }
  if (
    tag.startsWith('SC-')
    || tag.startsWith('P-RAS-')
    || tag.startsWith('P-WAS-')
    || tag.startsWith('P-LIFT-')
  ) {
    return 'SecondaryTreatmentArea';
  }
  if (
    tag.startsWith('AIT-')
    || tag.startsWith('FIT-')
    || tag.startsWith('V-OUT-')
    || tag.startsWith('OUT-')
  ) {
    return 'DischargeArea';
  }
  if (equipment.stage === 'sludge') return 'SludgeTreatmentArea';
  if (equipment.stage === 'chemical') return 'ChemicalDosingArea';
  if (equipment.stage === 'utilities') return 'UtilitiesArea';
  return 'AdvancedTreatmentArea';
}

export const MAIN_FLOW_TAGS = Object.freeze([
  'IN-001', 'GR-101', 'P-101', 'CV-101', 'GR-102', 'GC-101',
  'PC-101', 'DW-101', 'AT-101', 'AX-101', 'AE-101', 'SC-101',
  'P-LIFT-111', 'CO-101', 'CL-101', 'FL-101', 'OZ-101',
  'GAC-101', 'UF-101', 'DT-101', 'FIT-101', 'V-OUT-101', 'OUT-101',
]);

export const RETURN_FLOW_ROUTES = Object.freeze([
  Object.freeze({
    id: 'backwash-return',
    from: 'FL-101',
    to: 'DW-101',
    material: 'waterPipe' as const,
  }),
  Object.freeze({
    id: 'thickener-supernatant-return',
    from: 'ST-101',
    to: 'DW-101',
    material: 'sludgePipe' as const,
  }),
  Object.freeze({
    id: 'dewatering-filtrate-return',
    from: 'DWG-101',
    to: 'DW-101',
    material: 'sludgePipe' as const,
  }),
]);
