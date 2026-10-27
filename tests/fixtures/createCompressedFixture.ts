import { writeFile } from 'node:fs/promises';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

export async function createCompressedFixture(path: string): Promise<void> {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor('positions')
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const indices = document
    .createAccessor('indices')
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2]))
    .setBuffer(buffer);
  const material = document
    .createMaterial('material')
    .setBaseColorFactor([0.2, 0.5, 0.9, 1]);
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', positions)
    .setIndices(indices)
    .setMaterial(material);
  const mesh = document.createMesh('mesh').addPrimitive(primitive);
  const node = document.createNode('node').setMesh(mesh);
  const scene = document.createScene('scene').addChild(node);
  document.getRoot().setDefaultScene(scene);
  document.createTexture('unused').setImage(new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])).setMimeType('image/png');

  const io = new NodeIO()
    .registerExtensions([KHRDracoMeshCompression])
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
  await document.transform(draco());
  const bytes = await io.writeBinary(document);
  await writeFile(path, bytes);
}
