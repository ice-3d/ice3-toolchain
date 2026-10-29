#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import {
  Document,
  NodeIO,
} from '@gltf-transform/core';

const inputIndex = process.argv.indexOf('--input');
const outputIndex = process.argv.indexOf('--output');
if (inputIndex < 0 || outputIndex < 0) process.exit(2);
const marker = await readFile(process.argv[inputIndex + 1], 'utf8');
if (!marker.includes('ICE3_JT_CONVERTER_CONTRACT_V1')) process.exit(3);
const empty = marker.includes('EMPTY=1');

const document = new Document();
const buffer = document.createBuffer();
const scene = document.createScene('Plant');
document.getRoot().setDefaultScene(scene);
if (empty) {
  scene.addChild(document.createNode('EmptyJT'));
  await new NodeIO().write(process.argv[outputIndex + 1], document);
  process.exit(0);
}

const blue = document.createMaterial('PumpBlue')
  .setBaseColorFactor([0.12, 0.38, 0.68, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(1);
const taupe = document.createMaterial('TankTaupe')
  .setBaseColorFactor([0.62, 0.55, 0.4, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(1);

const positions = new Float32Array([
  -1, 0, -1, 1, 0, -1, -1, 1, -1, 1, 1, -1,
  -1, 0, 1, 1, 0, 1, -1, 1, 1, 1, 1, 1,
]);
const indices = new Uint32Array([
  0, 2, 3, 0, 3, 1,
  4, 5, 7, 4, 7, 6,
  0, 1, 5, 0, 5, 4,
  2, 6, 7, 2, 7, 3,
  0, 4, 6, 0, 6, 2,
  1, 3, 7, 1, 7, 5,
]);
const position = document.createAccessor()
  .setType('VEC3')
  .setArray(positions)
  .setBuffer(buffer);
const index = document.createAccessor()
  .setType('SCALAR')
  .setArray(indices)
  .setBuffer(buffer);
const mesh = document.createMesh('PumpMesh').addPrimitive(
  document.createPrimitive()
    .setAttribute('POSITION', position)
    .setIndices(index)
    .setMaterial(blue),
);
const tank = document.createMesh('TankMesh').addPrimitive(
  document.createPrimitive()
    .setAttribute('POSITION', position)
    .setIndices(index)
    .setMaterial(taupe),
);
const root = document.createNode('TreatmentLine');
const originMatch = marker.match(/ORIGIN=([-0-9.]+),([-0-9.]+),([-0-9.]+)/u);
if (originMatch) {
  root.setTranslation([
    Number(originMatch[1]),
    Number(originMatch[2]),
    Number(originMatch[3]),
  ]);
}
const pump = document.createNode('PrimaryPump')
  .setMesh(mesh)
  .setTranslation([2, 0, 0])
  .setExtras({
    jt: {
      objectId: 'JT-PUMP-101',
      assemblyPath: '/Plant/TreatmentLine/PrimaryPump',
      customProperties: { EquipmentTag: 'P-101' },
    },
  });
const instance = document.createNode('PumpInstanceA')
  .setMesh(mesh)
  .setTranslation([-2, 0, 0])
  .setExtras({
    jt: {
      objectId: 'JT-PUMP-102',
      assemblyPath: '/Plant/TreatmentLine/PumpInstanceA',
    },
  });
const bufferTank = document.createNode('BufferTank')
  .setMesh(tank)
  .setTranslation([0, 0, -3])
  .setExtras({
    jt: {
      objectId: 'JT-TANK-101',
      assemblyPath: '/Plant/TreatmentLine/BufferTank',
      customProperties: { EquipmentTag: 'T-101' },
    },
  });
if (!empty) root.addChild(pump).addChild(instance).addChild(bufferTank);
scene.addChild(root);

await new NodeIO().write(process.argv[outputIndex + 1], document);
