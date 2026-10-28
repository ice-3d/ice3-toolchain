import type {
  ICEWWTPEquipmentKind,
  ICEWWTPEquipmentSpec,
  ICEWWTPStage,
} from './types.js';

function equipment(
  tag: string,
  name: string,
  stage: ICEWWTPStage,
  kind: ICEWWTPEquipmentKind,
  position: readonly [number, number, number],
): ICEWWTPEquipmentSpec {
  return { tag, name, stage, kind, position };
}

export const WASTEWATER_EQUIPMENT: readonly ICEWWTPEquipmentSpec[] =
  Object.freeze([
    equipment('IN-001', '厂外进水口', 'intake', 'basin', [5, 0, 45]),
    equipment('GR-101', '粗格栅', 'intake', 'screen', [16, 0, 45]),
    equipment('P-101', '进水泵 A', 'intake', 'pump', [26, 0, 41]),
    equipment('P-102', '进水泵 B', 'intake', 'pump', [26, 0, 49]),
    equipment('CV-101', '进水止回阀', 'intake', 'valve', [34, 0, 45]),
    equipment('GR-102', '细格栅', 'intake', 'screen', [42, 0, 45]),
    equipment('GC-101', '曝气沉砂池', 'intake', 'basin', [53, 0, 45]),
    equipment('GW-101', '砂水分离器', 'intake', 'filter', [53, 0, 36]),
    equipment('PC-101', '初沉池', 'primary', 'clarifier', [68, 0, 45]),
    equipment('DW-101', '配水井', 'primary', 'basin', [82, 0, 45]),
    equipment('EQ-101', '事故池', 'primary', 'basin', [82, 0, 20]),
    equipment('P-EQ-101', '事故水回流泵', 'primary', 'pump', [89, 0, 20]),

    equipment('AT-101', '厌氧池 A', 'biological', 'basin', [99, 0, 36]),
    equipment('AX-101', '缺氧池 A', 'biological', 'basin', [111, 0, 36]),
    equipment('AE-101', '好氧池 A', 'biological', 'basin', [124, 0, 36]),
    equipment('AT-201', '厌氧池 B', 'biological', 'basin', [99, 0, 54]),
    equipment('AX-201', '缺氧池 B', 'biological', 'basin', [111, 0, 54]),
    equipment('AE-201', '好氧池 B', 'biological', 'basin', [124, 0, 54]),

    equipment('SC-101', '二沉池 A', 'secondary', 'clarifier', [140, 0, 36]),
    equipment('SC-201', '二沉池 B', 'secondary', 'clarifier', [140, 0, 54]),
    equipment('P-RAS-101', '回流污泥泵 A', 'secondary', 'pump', [126, 0, 74]),
    equipment('P-RAS-201', '回流污泥泵 B', 'secondary', 'pump', [135, 0, 74]),
    equipment('P-WAS-301', '剩余污泥泵', 'secondary', 'pump', [144, 0, 74]),
    equipment('P-LIFT-111', '中间提升泵 A', 'secondary', 'pump', [151, 0, 36]),
    equipment('P-LIFT-112', '中间提升泵 B', 'secondary', 'pump', [151, 0, 54]),

    equipment('CO-101', '混凝沉淀池', 'advanced', 'basin', [164, 0, 45]),
    equipment('CL-101', '混凝沉淀刮泥机', 'advanced', 'clarifier', [176, 0, 45]),
    equipment('FL-101', '滤布滤池', 'advanced', 'filter', [190, 0, 45]),
    equipment('P-BW-301', '反冲洗泵', 'advanced', 'pump', [190, 0, 30]),
    equipment('MOV-301', '反洗进水阀', 'advanced', 'valve', [199, 0, 30]),
    equipment('OZ-101', '臭氧接触池', 'advanced', 'basin', [205, 0, 45]),
    equipment('GAC-101', '活性炭滤池', 'advanced', 'filter', [217, 0, 45]),
    equipment('UF-101', '超滤膜池', 'advanced', 'basin', [230, 0, 45]),
    equipment('DT-101', '消毒接触池', 'advanced', 'basin', [244, 0, 45]),
    equipment('AIT-COD-101', '出水 COD 在线仪', 'advanced', 'analyzer', [250, 0, 34]),
    equipment('AIT-NH3-101', '出水氨氮在线仪', 'advanced', 'analyzer', [250, 0, 37]),
    equipment('AIT-TP-101', '出水总磷在线仪', 'advanced', 'analyzer', [250, 0, 40]),
    equipment('AIT-TN-101', '出水总氮在线仪', 'advanced', 'analyzer', [250, 0, 43]),
    equipment('AIT-TU-101', '出水浊度在线仪', 'advanced', 'analyzer', [250, 0, 46]),
    equipment('FIT-101', '出水流量计', 'advanced', 'analyzer', [256, 0, 50]),
    equipment('V-OUT-101', '出水阀', 'advanced', 'valve', [260, 0, 50]),
    equipment('OUT-101', '排放口', 'advanced', 'basin', [266, 0, 50]),

    equipment('ST-101', '污泥浓缩池', 'sludge', 'clarifier', [116, 0, 82]),
    equipment('DWG-101', '污泥脱水机', 'sludge', 'blower', [130, 0, 82]),
    equipment('DRY-101', '污泥干化机', 'sludge', 'blower', [142, 0, 82]),
    equipment('SILO-101', '污泥料仓', 'sludge', 'basin', [156, 0, 82]),
    equipment('CONV-101', '污泥输送机', 'sludge', 'filter', [146, 0, 73]),
    equipment('P-SL-101', '污泥输送泵', 'sludge', 'pump', [106, 0, 82]),

    equipment('PAC-101', 'PAC 加药装置 A', 'chemical', 'basin', [27, 0, 70]),
    equipment('PAC-102', 'PAC 计量泵 B', 'chemical', 'pump', [35, 0, 70]),
    equipment('PAM-101', 'PAM 加药装置 A', 'chemical', 'basin', [43, 0, 70]),
    equipment('PAM-102', 'PAM 计量泵 B', 'chemical', 'pump', [51, 0, 70]),
    equipment('NACLO-101', '次氯酸钠储罐', 'chemical', 'basin', [59, 0, 70]),
    equipment('NACLO-102', '次氯酸钠计量泵', 'chemical', 'pump', [67, 0, 70]),
    equipment('CARBON-101', '碳源储罐', 'chemical', 'basin', [75, 0, 70]),
    equipment('CARBON-102', '碳源计量泵', 'chemical', 'pump', [83, 0, 70]),

    equipment('BLW-101', '鼓风机 A', 'utilities', 'blower', [111, 0, 92]),
    equipment('BLW-102', '鼓风机 B', 'utilities', 'blower', [121, 0, 92]),
    equipment('ODR-101', '除臭装置 A', 'utilities', 'blower', [140, 0, 96]),
    equipment('ODR-102', '除臭装置 B', 'utilities', 'blower', [151, 0, 96]),
    equipment('FAN-101', '除臭风机', 'utilities', 'blower', [162, 0, 96]),
  ]);

export const EXPECTED_EQUIPMENT_TAGS = Object.freeze(
  WASTEWATER_EQUIPMENT.map((item) => item.tag),
);
