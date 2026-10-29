import {
  lstat,
  readFile,
  realpath,
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  sep,
} from 'node:path';

export interface IObjResource {
  readonly name: string;
  readonly bytes: Buffer;
}

export interface IObjResources {
  readonly obj: Buffer;
  readonly sidecars: readonly IObjResource[];
  readonly warnings: readonly string[];
}

export async function readObjResources(
  inputPath: string,
): Promise<IObjResources> {
  const obj = await readFile(inputPath);
  const root = await realpath(dirname(inputPath));
  const warnings = new Set<string>();
  const names = new Set<string>();
  for (const line of obj.toString('utf8').split(/\r?\n/u)) {
    const match = line.trim().match(/^mtllib\s+(.+)$/iu);
    if (!match) continue;
    const reference = match[1]!.replaceAll('\\', '/').trim();
    if (
      !reference
      || isAbsolute(reference)
      || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(reference)
    ) {
      warnings.add('ICE3_TOOL_OBJ_RESOURCE_IGNORED');
      continue;
    }
    const candidate = join(root, reference);
    if (
      candidate !== root
      && !candidate.startsWith(`${root}${sep}`)
    ) {
      warnings.add('ICE3_TOOL_OBJ_RESOURCE_IGNORED');
      continue;
    }
    const normalized = relative(root, candidate).replaceAll('\\', '/');
    if (!normalized || normalized.startsWith('../')) {
      warnings.add('ICE3_TOOL_OBJ_RESOURCE_IGNORED');
      continue;
    }
    let resolved: string;
    try {
      resolved = await realpath(candidate);
    } catch {
      warnings.add('ICE3_TOOL_OBJ_MATERIAL_UNAVAILABLE');
      continue;
    }
    if (!resolved.startsWith(`${root}${sep}`)) {
      warnings.add('ICE3_TOOL_OBJ_RESOURCE_IGNORED');
      continue;
    }
    const metadata = await lstat(candidate);
    if (!metadata.isFile()) {
      warnings.add('ICE3_TOOL_OBJ_MATERIAL_UNAVAILABLE');
      continue;
    }
    names.add(normalized);
  }
  const sidecars = await Promise.all([...names].sort().map(async (name) => ({
    name,
    bytes: await readFile(join(root, name)),
  })));
  return {
    obj,
    sidecars,
    warnings: [...warnings].sort(),
  };
}
