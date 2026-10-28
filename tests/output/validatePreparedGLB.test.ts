import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';

test('accepts a generated ICE3 profile', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const bytes = buildPreparedGLB(source, { assetId: 'sample' }).bytes;

  expect(validatePreparedGLB(bytes).errors).toEqual([]);
});

test('rejects ordinary GLB without ICE3 profile metadata', async () => {
  const bytes = await readFile('tests/fixtures/minimal.glb');
  expect(validatePreparedGLB(bytes).errors).toContain(
    'ICE3_TOOL_PROFILE_MISSING',
  );
});

test('rejects a modified BIN chunk that does not match the digest', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const bytes = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  bytes[bytes.byteLength - 1] = (bytes[bytes.byteLength - 1]! + 1) & 0xff;

  expect(validatePreparedGLB(bytes).errors).toContain(
    'ICE3_TOOL_CONTENT_DIGEST_MISMATCH',
  );
});

test('returns a stable diagnostic for malformed JSON chunk content', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const bytes = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  bytes[20] = 0x7b;
  bytes[21] = 0x7b;

  expect(validatePreparedGLB(bytes).errors).toContain('ICE3_TOOL_INVALID_GLB');
});

test('rejects profile statistics that do not match mesh accessors', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const generated = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  const bytes = rewriteJSON(generated, (json) => {
    const profile = (json.asset as Record<string, unknown>).extras as Record<string, unknown>;
    const ice3 = profile.ice3 as Record<string, unknown>;
    ice3.stats = {
      ...(ice3.stats as Record<string, unknown>),
      triangleCount: 999,
    };
  });

  expect(validatePreparedGLB(bytes).errors).toContain(
    'ICE3_TOOL_INVALID_PROFILE_STATS',
  );
});

test('rejects a buffer view without its required buffer index', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const generated = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  const bytes = rewriteJSON(generated, (json) => {
    const views = json.bufferViews as Array<Record<string, unknown>>;
    delete views[0]!.buffer;
  });

  expect(validatePreparedGLB(bytes).errors).toContain(
    'ICE3_TOOL_INVALID_BUFFER_VIEW:0',
  );
});

test('rejects runtime conversion and unsupported contract versions', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  const valid = buildPreparedGLB(source, { assetId: 'sample' }).bytes;

  const conversion = mutateProfile(valid, (profile) => {
    const preparation = profile.preparation as Record<string, unknown>;
    preparation.runtimeConversionRequired = true;
  });
  expect(validatePreparedGLB(conversion).errors).toContain(
    'ICE3_TOOL_RUNTIME_CONVERSION_REQUIRED',
  );

  const unsupported = mutateProfile(valid, (profile) => {
    profile.contractVersion = '2.0';
  });
  expect(validatePreparedGLB(unsupported).errors).toContain(
    'ICE3_TOOL_CONTRACT_UNSUPPORTED',
  );
});

const mutateProfile = (
  bytes: Uint8Array,
  mutate: (profile: Record<string, unknown>) => void,
): Uint8Array => rewriteJSON(bytes, (json) => {
  const asset = json.asset as Record<string, unknown>;
  const extras = asset.extras as Record<string, unknown>;
  mutate(extras.ice3 as Record<string, unknown>);
});

function rewriteJSON(
  source: Uint8Array,
  mutate: (json: Record<string, unknown>) => void,
): Uint8Array {
  const input = Buffer.from(source);
  const jsonLength = input.readUInt32LE(12);
  const json = JSON.parse(
    input.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as Record<string, unknown>;
  mutate(json);
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const nextJSONLength = Math.ceil(jsonBytes.length / 4) * 4;
  const binLength = input.readUInt32LE(20 + jsonLength);
  const binary = input.subarray(28 + jsonLength, 28 + jsonLength + binLength);
  const output = Buffer.alloc(12 + 8 + nextJSONLength + 8 + binLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(nextJSONLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(0x20, 20, 20 + nextJSONLength);
  jsonBytes.copy(output, 20);
  const binHeader = 20 + nextJSONLength;
  output.writeUInt32LE(binLength, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  binary.copy(output, binHeader + 8);
  return output;
}
