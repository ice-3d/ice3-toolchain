import { randomUUID } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export async function replaceAssetDirectory(
  staging: string,
  destination: string,
): Promise<void> {
  const backup = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.backup`,
  );
  let previousMoved = false;
  try {
    await rename(destination, backup);
    previousMoved = true;
  } catch (error) {
    if (
      !(error instanceof Error)
      || (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  try {
    await rename(staging, destination);
  } catch (error) {
    if (previousMoved) {
      await rename(backup, destination);
    }
    throw error;
  }

  if (previousMoved) {
    await rm(backup, { recursive: true, force: true });
  }
}
