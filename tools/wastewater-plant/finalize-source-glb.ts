import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';

export const AUTHORED_GENERATOR = 'ICE3 authored wastewater pipeline';

export async function finalizeSourceGlb(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const document = await new NodeIO().read(inputPath);
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
