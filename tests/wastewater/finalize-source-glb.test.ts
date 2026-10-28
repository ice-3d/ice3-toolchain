import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  Document,
  NodeIO,
} from '@gltf-transform/core';
import { expect } from '#test-expect';
import {
  AUTHORED_GENERATOR,
  finalizeSourceGlb,
} from '../../tools/wastewater-plant/finalize-source-glb.js';

function createTriangle(
  positions: readonly number[],
  indices: readonly number[],
  textureCoordinate: number,
): Document {
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const normal = document.createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]))
    .setBuffer(buffer);
  const uv = document.createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([
      0, 0, textureCoordinate, 1, 1, 1,
    ]))
    .setBuffer(buffer);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(document.createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array(indices))
      .setBuffer(buffer));
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);
  return document;
}

test('canonicalizes equivalent exported geometry deterministically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-finalize-'));
  try {
    const firstInput = join(root, 'first.glb');
    const secondInput = join(root, 'second.glb');
    const firstOutput = join(root, 'first.final.glb');
    const secondOutput = join(root, 'second.final.glb');
    const io = new NodeIO();
    const first = createTriangle(
      [0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 1, 2],
      0.625799,
    );
    const second = createTriangle(
      [0, 1, 0, 0, 0, 0, 1, 0, 0],
      [1, 2, 0],
      0.62579894,
    );
    await io.write(firstInput, first);
    await io.write(secondInput, second);

    await finalizeSourceGlb(firstInput, firstOutput);
    await finalizeSourceGlb(secondInput, secondOutput);

    expect(await readFile(firstOutput)).toEqual(await readFile(secondOutput));
    const finalized = await io.read(firstOutput);
    expect(finalized.getRoot().listMeshes()[0]?.listPrimitives()[0]
      ?.listSemantics()).not.toContain('TEXCOORD_0');
    const source = await readFile(firstOutput);
    const length = source.readUInt32LE(12);
    const asset = JSON.parse(
      source.subarray(20, 20 + length).toString('utf8'),
    ) as { asset: { generator?: string } };
    expect(asset.asset.generator).toBe(AUTHORED_GENERATOR);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
