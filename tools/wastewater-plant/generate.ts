import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { createWastewaterPlantDocument } from './scene.js';

export interface ICEWWTPGenerateOptions {
  readonly outputPath: string;
}

export interface ICEWWTPGenerateResult {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly equipmentCount: number;
  readonly sha256: string;
}

export async function generateWastewaterPlant(
  options: ICEWWTPGenerateOptions,
): Promise<ICEWWTPGenerateResult> {
  const outputPath = resolve(options.outputPath);
  if (options.outputPath.trim().length === 0) {
    throw new Error('ICE3_WWTP_EXPORT_FAILED: output path must not be empty');
  }
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  try {
    const { document, equipment } = createWastewaterPlantDocument();
    const bytes = await new NodeIO().writeBinary(document);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(temporary, bytes);
    await rename(temporary, outputPath);
    return {
      bytes,
      equipmentCount: equipment.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    if (
      error instanceof Error
      && error.message.startsWith('ICE3_WWTP_EXPORT_FAILED:')
    ) {
      throw error;
    }
    throw new Error(
      `ICE3_WWTP_EXPORT_FAILED: failed to write ${basename(outputPath)}`,
    );
  }
}

export async function runGeneratorCli(
  argv: readonly string[],
): Promise<number> {
  try {
    if (
      argv.length !== 2
      || argv[0] !== '--output'
      || !argv[1]
      || argv[1].trim().length === 0
    ) {
      throw new Error(
        'ICE3_WWTP_EXPORT_FAILED: usage: generate --output <path>',
      );
    }
    const result = await generateWastewaterPlant({ outputPath: argv[1] });
    console.log(JSON.stringify({
      assetId: 'ice3-virtual-wwtp',
      equipmentCount: result.equipmentCount,
      sha256: result.sha256,
      bytes: result.bytes.byteLength,
    }));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runGeneratorCli(process.argv.slice(2));
}
