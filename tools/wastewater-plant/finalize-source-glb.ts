import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  NodeIO,
  type Accessor,
  type Document,
  type Primitive,
} from '@gltf-transform/core';

export const AUTHORED_GENERATOR = 'ICE3 authored wastewater pipeline';

const ATTRIBUTE_ORDER = [
  'POSITION',
  'NORMAL',
  'TANGENT',
  'COLOR_0',
  'JOINTS_0',
  'WEIGHTS_0',
] as const;

function canonicalizeAttribute(
  document: Document,
  accessor: Accessor,
  indexMap: readonly number[],
): Accessor {
  const source = accessor.getArray();
  if (!source) return accessor;
  const itemSize = accessor.getElementSize();
  const target = new Float32Array(indexMap.length * itemSize);
  for (let index = 0; index < indexMap.length; index += 1) {
    const sourceIndex = indexMap[index]!;
    for (let component = 0; component < itemSize; component += 1) {
      target[index * itemSize + component] =
        source[sourceIndex * itemSize + component]!;
    }
  }
  return document.createAccessor()
    .setType(accessor.getType())
    .setNormalized(accessor.getNormalized())
    .setArray(target)
    .setBuffer(accessor.getBuffer());
}

function canonicalizePrimitive(
  document: Document,
  primitive: Primitive,
  retired: Set<Accessor>,
): void {
  const semantics = primitive.listSemantics()
    .filter((semantic) => !semantic.startsWith('TEXCOORD_'))
    .sort((left, right) => {
      const leftRank = ATTRIBUTE_ORDER.indexOf(
        left as (typeof ATTRIBUTE_ORDER)[number],
      );
      const rightRank = ATTRIBUTE_ORDER.indexOf(
        right as (typeof ATTRIBUTE_ORDER)[number],
      );
      return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank)
        || left.localeCompare(right);
    });
  for (const semantic of primitive.listSemantics()) {
    if (semantic.startsWith('TEXCOORD_')) {
      const attribute = primitive.getAttribute(semantic);
      if (attribute) retired.add(attribute);
      primitive.setAttribute(semantic, null);
    }
  }
  const position = primitive.getAttribute('POSITION');
  if (!position?.getArray() || semantics.length === 0) return;

  const records = Array.from({ length: position.getCount() }, (_, index) => {
    const values: number[] = [];
    for (const semantic of semantics) {
      const attribute = primitive.getAttribute(semantic);
      if (!attribute?.getArray()) continue;
      const itemSize = attribute.getElementSize();
      const source = attribute.getArray()!;
      const offset = index * itemSize;
      values.push(...source.subarray(offset, offset + itemSize));
    }
    return { index, key: values.join(','), values };
  });
  records.sort((left, right) => left.key.localeCompare(right.key));

  const canonicalVertices: typeof records = [];
  const oldToNew = new Uint32Array(records.length);
  for (const record of records) {
    const previous = canonicalVertices.at(-1);
    if (previous?.key === record.key) {
      oldToNew[record.index] = canonicalVertices.length - 1;
      continue;
    }
    oldToNew[record.index] = canonicalVertices.length;
    canonicalVertices.push(record);
  }
  const canonicalIds = canonicalVertices.map((record) => record.index);
  for (const semantic of semantics) {
    const attribute = primitive.getAttribute(semantic);
    if (!attribute) continue;
    retired.add(attribute);
    primitive.setAttribute(
      semantic,
      canonicalizeAttribute(document, attribute, canonicalIds),
    );
  }

  const sourceIndices = primitive.getIndices()?.getArray();
  const indexBuffer = primitive.getIndices()?.getBuffer() ?? null;
  const indexAccessor = primitive.getIndices();
  if (indexAccessor) retired.add(indexAccessor);
  const rawIndices = sourceIndices
    ? Array.from(sourceIndices)
    : Array.from({ length: position.getCount() }, (_, index) => index);
  if (primitive.getMode() !== 4 || rawIndices.length % 3 !== 0) {
    const remapped = rawIndices.map((index) => oldToNew[index] ?? index);
    primitive.setIndices(document.createAccessor()
      .setType('SCALAR')
      .setArray(new Uint32Array(remapped))
      .setBuffer(indexBuffer));
    return;
  }

  const triangles: [number, number, number][] = [];
  for (let index = 0; index < rawIndices.length; index += 3) {
    const triangle = [
      oldToNew[rawIndices[index]!]!,
      oldToNew[rawIndices[index + 1]!]!,
      oldToNew[rawIndices[index + 2]!]!,
    ] as [number, number, number];
    const minimum = Math.min(...triangle);
    while (triangle[0] !== minimum) {
      triangle.push(triangle.shift()!);
    }
    triangles.push(triangle);
  }
  triangles.sort((left, right) => (
    left[0] - right[0]
    || left[1] - right[1]
    || left[2] - right[2]
  ));
  const indices = new Uint32Array(triangles.length * 3);
  triangles.forEach((triangle, triangleIndex) => {
    indices.set(triangle, triangleIndex * 3);
  });
  primitive.setIndices(document.createAccessor()
    .setType('SCALAR')
    .setArray(indices)
    .setBuffer(indexBuffer));
}

export async function finalizeSourceGlb(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const document = await new NodeIO().read(inputPath);
  const retiredAccessors = new Set<Accessor>();
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      canonicalizePrimitive(document, primitive, retiredAccessors);
    }
  }
  for (const accessor of retiredAccessors) accessor.dispose();
  document.getRoot().getAsset().generator = AUTHORED_GENERATOR;
  const temporary = `${outputPath}.tmp`;
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(temporary, await new NodeIO().writeBinary(document));
    await rename(temporary, outputPath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
