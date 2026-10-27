# ICE3 Toolchain M1 GLB Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone toolchain that converts source glTF 2.0 assets into deterministic ICE3 Prepared GLB Profile v1 files without introducing a runtime conversion pipeline.

**Architecture:** The toolchain repository uses npm workspaces with a pure preprocessing core and a thin CLI. The core consumes glTF JSON or GLB input, normalizes the supported subset, bakes node matrices, prepares triangle and edge buffers, adds the ICE3 profile metadata, and writes a standard single-BIN GLB. No engine runtime package is imported.

**Tech Stack:** Node.js 24 LTS, TypeScript 7, ESM, native Node APIs, Node test runner through `tsx`, npm workspaces.

**Spec:** `../ice3-engine/docs/superpowers/specs/2026-10-27-engine-m1-asset-design.md`

## Global Constraints

- Source-format parsing and all heavy transformations occur only in this toolchain.
- M1 source formats are glTF 2.0 JSON and GLB only.
- Output is a standard GLB with one JSON chunk and one BIN chunk.
- Every output carries `asset.extras.ice3` with `profile: "ice3-prepared"` and `profileVersion: "1.0"`.
- Output nodes use standard 16-element `matrix` values; no node TRS is emitted.
- Triangle primitives use mode `4`; generated edge primitives use mode `1`.
- Positions are non-normalized `FLOAT` `VEC3`; indices are non-normalized `UNSIGNED_SHORT` or `UNSIGNED_INT`.
- Textures, images, animations, skins, Morph targets, cameras, lights, sparse accessors, external URIs, and required extensions are rejected.
- Node, mesh, geometry, and material IDs are stable across identical builds.
- Identical source and options produce byte-identical output.
- No old or legacy transport compatibility is added.
- No document, source file, identifier, or test output contains blocked product or vendor names.

## Review Focus

- A source GLB is truncated inside its JSON or BIN chunk: conversion fails with a structured error and no output file.
- A source node contains quaternion TRS: the toolchain bakes it into a matrix and the runtime never sees TRS.
- A cube is triangulated with diagonal edges: only boundary or above-threshold crease edges become visible line primitives.
- An unsupported animation or texture is present: `inspect` reports it and `build` refuses rather than silently dropping it.
- The same input is built twice: JSON ordering, padding, IDs, and SHA-256 remain identical.
- A build is interrupted before completion: the final output path is never left with a partial GLB.

---

## File Structure

```text
ice3-toolchain/
├─ package.json                         workspace scripts and tool versions
├─ package-lock.json                    reproducible dependency graph
├─ .gitignore                           build and temporary output
├─ .nvmrc                               Node 24
├─ tsconfig.base.json                   shared strict TypeScript settings
├─ tsconfig.json                        workspace build graph
├─ AGENTS.md                            repository-local engineering rules
├─ packages/
│  ├─ toolchain-core/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ index.ts                    public preprocessing API
│  │     ├─ source/
│  │     │  ├─ readSource.ts            .gltf/.glb container and resource reading
│  │     │  └─ readAccessor.ts          accessor decoding for preprocessing
│  │     ├─ scene/
│  │     │  ├─ validateSource.ts        supported-feature and graph checks
│  │     │  ├─ bakeMatrix.ts            source TRS/matrix to local matrix
│  │     │  └─ prepareMesh.ts           triangle and edge buffer preparation
│  │     └─ output/
│  │        ├─ buildPreparedGLB.ts      deterministic profile GLB builder
│  │        └─ validatePreparedGLB.ts   profile reader used by the CLI
│  └─ cli/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ main.ts                     command dispatch
│        └─ commands.ts                 inspect/build/validate commands
├─ tests/
│  ├─ architecture/
│  │  └─ layout.test.ts
│  ├─ fixtures/
│  │  ├─ minimal.gltf
│  │  ├─ minimal.bin
│  │  ├─ cube.gltf
│  │  └─ create-fixtures.ts
│  ├─ source/
│  │  ├─ readSource.test.ts
│  │  └─ readAccessor.test.ts
│  ├─ scene/
│  │  ├─ validateSource.test.ts
│  │  ├─ bakeMatrix.test.ts
│  │  └─ prepareMesh.test.ts
│  ├─ output/
│  │  ├─ buildPreparedGLB.test.ts
│  │  └─ validatePreparedGLB.test.ts
│  └─ cli/
│     └─ commands.test.ts
└─ fixtures/
   └─ prepared-cube.glb                checked-in cross-repository contract artifact
```

### Task 1: Scaffold the independent toolchain workspace

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `AGENTS.md`
- Create: `packages/toolchain-core/package.json`
- Create: `packages/toolchain-core/tsconfig.json`
- Create: `packages/toolchain-core/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `tests/architecture/layout.test.ts`

**Interfaces:**
- Consumes: no repository code.
- Produces: npm workspace commands `build`, `typecheck`, `test`, `test:architecture`, and `verify`; package entry points `@ice3/toolchain-core` and `ice3-tool`.

- [ ] **Step 1: Write the failing layout test**

```ts
import { expect, test } from 'node-test';
import { existsSync, readFileSync } from 'node:fs';

test('workspace contains an isolated preprocessing core and CLI', () => {
  expect(existsSync('packages/toolchain-core/package.json')).toBe(true);
  expect(existsSync('packages/cli/package.json')).toBe(true);

  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(root.private).toBe(true);
  expect(root.workspaces).toEqual(['packages/*']);
});
```

- [ ] **Step 2: Run the test and confirm the workspace is absent**

Run: `npx node-test run tests/architecture/layout.test.ts`

Expected: FAIL because `package.json` or `node-test` setup is absent.

- [ ] **Step 3: Create the workspace manifests and strict TypeScript configuration**

Root `package.json`:

```json
{
  "name": "ice3-toolchain-workspace",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": {
    "node": "^24.0.0 || >=26.0.0",
    "npm": ">=11"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false",
    "test": "node-test run",
    "test:architecture": "node-test run tests/architecture",
    "verify": "npm run test:architecture && npm run typecheck && npm test"
  },
  "devDependencies": {
    "@types/node": "24.19.2",
    "typescript": "7.0.2",
    "node-test": "5.0.5"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

Create both package manifests with `"type": "module"`, `"private": true`, and `"version": "0.0.0"`. The CLI manifest declares:

```json
{
  "name": "ice3-tool",
  "bin": {
    "ice3-tool": "./dist/main.js"
  },
  "dependencies": {
    "@ice3/toolchain-core": "0.0.0"
  }
}
```

- [ ] **Step 4: Add repository rules and build graph**

`AGENTS.md` records the same dependency, naming, current-technology, branch-and-merge, and verification rules as the engine repository, plus the additional rule that source-format adaptation belongs only in this repository.

Root `tsconfig.json` references `packages/toolchain-core` and `packages/cli`.

- [ ] **Step 5: Install and verify**

Run:

```bash
nvm use
npm install
npm run verify
```

Expected: all checks pass with one architecture test and an empty TypeScript build.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: scaffold ICE3 toolchain workspace"
```

### Task 2: Read glTF JSON and GLB containers

**Files:**
- Create: `packages/toolchain-core/src/source/readSource.ts`
- Create: `packages/toolchain-core/src/source/index.ts`
- Modify: `packages/toolchain-core/src/index.ts`
- Create: `tests/fixtures/create-fixtures.ts`
- Create: `tests/fixtures/minimal.gltf`
- Create: `tests/fixtures/minimal.bin`
- Create: `tests/source/readSource.test.ts`

**Interfaces:**

```ts
export interface ICESourceDocument {
  readonly json: Readonly<Record<string, unknown>>;
  readonly buffers: readonly Uint8Array[];
  readonly baseDirectory: string;
}

export async function readSource(path: string): Promise<ICESourceDocument>;
```

- [ ] **Step 1: Generate a minimal source fixture**

`create-fixtures.ts` writes one triangle position buffer and a JSON document with one mesh, one material, one node, and one scene. The JSON buffer uses `minimal.bin` as its URI.

- [ ] **Step 2: Write failing container tests**

```ts
import { expect, test } from 'node-test';
import { readSource } from '../../packages/toolchain-core/src/source/readSource.js';

test('reads an external-buffer glTF document', async () => {
  const source = await readSource('tests/fixtures/minimal.gltf');
  expect(source.buffers).toHaveLength(1);
  expect(source.buffers[0]!.byteLength).toBe(36);
});

test('rejects a truncated GLB JSON chunk', async () => {
  await expect(readSource('tests/fixtures/truncated.glb')).rejects.toThrow(
    /ICE3_TOOL_INVALID_SOURCE/,
  );
});
```

- [ ] **Step 3: Run the tests and verify failure**

Run: `npx node-test run tests/source/readSource.test.ts`

Expected: FAIL because resource loading and GLB framing are absent.

- [ ] **Step 4: Implement strict JSON and GLB framing**

The JSON path rejects absolute or parent-traversing resource URIs. Data URIs are decoded with Node `Buffer`. Relative paths resolve against the source directory.

The GLB path validates:

```ts
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
```

It requires version `2`, a bounded total length, JSON as the first chunk, at most one BIN chunk, and four-byte-aligned chunk lengths. Unknown chunks are ignored. JSON padding is trimmed using UTF-8 space bytes; BIN padding is preserved only as bytes and excluded through declared buffer lengths when accessors are read.

- [ ] **Step 5: Run the tests**

Run: `npx node-test run tests/source/readSource.test.ts`

Expected: PASS for valid JSON and GLB input, malformed headers, bad chunk order, truncated chunks, missing resources, and unsafe URI traversal.

- [ ] **Step 6: Commit**

```bash
git add packages/toolchain-core tests/fixtures tests/source
git commit -m "feat(toolchain): read glTF source containers"
```

### Task 3: Decode accessors and validate the supported source subset

**Files:**
- Create: `packages/toolchain-core/src/source/readAccessor.ts`
- Create: `packages/toolchain-core/src/scene/validateSource.ts`
- Create: `tests/source/readAccessor.test.ts`
- Create: `tests/scene/validateSource.test.ts`
- Modify: `packages/toolchain-core/src/index.ts`

**Interfaces:**

```ts
export type ICEAccessorData =
  | { readonly kind: 'float32'; readonly values: Float32Array; readonly components: number }
  | { readonly kind: 'uint16'; readonly values: Uint16Array; readonly components: number }
  | { readonly kind: 'uint32'; readonly values: Uint32Array; readonly components: number };

export function readAccessor(
  document: ICESourceDocument,
  accessorIndex: number,
): ICEAccessorData;

export interface ICESourceReport {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function validateSource(document: ICESourceDocument): ICESourceReport;
```

- [ ] **Step 1: Write failing accessor tests**

```ts
test('decodes a non-interleaved float position accessor', () => {
  const data = readAccessor(document, 0);
  expect(data.kind).toBe('float32');
  expect([...data.values]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
});

test('rejects an accessor that exceeds its buffer view', () => {
  expect(() => readAccessor(brokenDocument, 0)).toThrow(
    /ICE3_TOOL_ACCESSOR_OUT_OF_RANGE/,
  );
});
```

- [ ] **Step 2: Run and observe RED**

Run: `npx node-test run tests/source/readAccessor.test.ts`

Expected: FAIL because accessor decoding is missing.

- [ ] **Step 3: Implement accessor decoding**

Support accessor component types used for positions and indices, buffer-view byte offsets and strides, and `byteOffset`. Return typed arrays copied into toolchain-owned memory; runtime zero-copy guarantees do not apply to input preprocessing.

- [ ] **Step 4: Write failing subset validation tests**

```ts
test('reports animations and textures as unsupported', () => {
  const report = validateSource(documentWithAnimationAndTexture);
  expect(report.errors).toContain('ICE3_TOOL_UNSUPPORTED_ANIMATION');
  expect(report.errors).toContain('ICE3_TOOL_UNSUPPORTED_TEXTURE');
});

test('rejects a cyclic node graph', () => {
  expect(validateSource(cyclicDocument).errors).toContain(
    'ICE3_TOOL_SCENE_CYCLE',
  );
});
```

- [ ] **Step 5: Implement validation and run tests**

Validation checks every node, mesh, primitive, material, accessor, buffer view, and scene reference. It reports, rather than silently skipping, animations, skins, morph targets, cameras, textures, images, samplers, sparse accessors, compressed extensions, and external output requirements.

Run: `npx node-test run tests/source/readAccessor.test.ts tests/scene/validateSource.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/toolchain-core tests/source tests/scene/validateSource.test.ts
git commit -m "feat(toolchain): validate source geometry subset"
```

### Task 4: Prepare matrices, triangles, materials, and crease edges

**Files:**
- Create: `packages/toolchain-core/src/scene/bakeMatrix.ts`
- Create: `packages/toolchain-core/src/scene/prepareMesh.ts`
- Create: `tests/scene/bakeMatrix.test.ts`
- Create: `tests/scene/prepareMesh.test.ts`
- Modify: `packages/toolchain-core/src/index.ts`

**Interfaces:**

```ts
export interface ICEPreparedNode {
  readonly id: string;
  readonly name: string;
  readonly parent: number | null;
  readonly matrix: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ];
}

export interface ICEPreparedGeometry {
  readonly id: string;
  readonly positions: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly edgeIndices: Uint16Array | Uint32Array;
  readonly bounds: Readonly<{
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }>;
}

export function bakeLocalMatrix(
  matrix?: readonly number[],
  translation?: readonly number[],
  rotation?: readonly number[],
  scale?: readonly number[],
): readonly number[];

export function prepareMesh(
  positions: Float32Array,
  indices: Uint32Array,
  creaseAngleDegrees: number,
): ICEPreparedGeometry;
```

- [ ] **Step 1: Write failing matrix tests**

```ts
test('bakes source TRS into a local matrix', () => {
  expect(
    bakeLocalMatrix(undefined, [2, 3, 4], [0, 0, 0, 1], [1, 1, 1]),
  ).toEqual([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    2, 3, 4, 1,
  ]);
});

test('preserves a source matrix without decomposing it', () => {
  expect(bakeLocalMatrix(sourceMatrix)).toEqual(sourceMatrix);
});
```

- [ ] **Step 2: Run and implement matrix baking**

Run: `npx node-test run tests/scene/bakeMatrix.test.ts`

Expected: RED first, then PASS after implementing column-major TRS composition and matrix passthrough.

- [ ] **Step 3: Write failing triangle and edge tests**

```ts
test('triangulates a quad into two triangles', () => {
  const prepared = prepareMesh(quadPositions, quadIndices, 30);
  expect(prepared.indices).toHaveLength(6);
});

test('keeps cube boundary and crease edges but drops face diagonals', () => {
  const prepared = prepareMesh(cubePositions, cubeTriangles, 30);
  expect(prepared.edgeIndices).toHaveLength(24);
});
```

- [ ] **Step 4: Implement triangle preparation**

Accept triangle, triangle-strip, and triangle-fan modes. Emit indexed triangles. Compute finite bounds and reject non-finite positions.

- [ ] **Step 5: Implement crease-edge generation**

Unity-quantize positions before welding adjacency. Count triangle-edge occurrences and compute adjacent face normals. Emit an edge when:

- it belongs to one triangle;
- its two adjacent face normals differ by at least `creaseAngleDegrees`;
- cached output has not already emitted the same unordered vertex pair.

The default crease angle is `30`, controlled by `--crease-angle`.

- [ ] **Step 6: Run tests and commit**

Run: `npx node-test run tests/scene/bakeMatrix.test.ts tests/scene/prepareMesh.test.ts`

Expected: PASS, including cube edges without triangulation diagonals.

```bash
git add packages/toolchain-core tests/scene
git commit -m "feat(toolchain): prepare geometry and crease edges"
```

### Task 5: Emit deterministic ICE3 Prepared GLB

**Files:**
- Create: `packages/toolchain-core/src/output/buildPreparedGLB.ts`
- Create: `packages/toolchain-core/src/output/validatePreparedGLB.ts`
- Create: `tests/output/buildPreparedGLB.test.ts`
- Create: `tests/output/validatePreparedGLB.test.ts`
- Modify: `packages/toolchain-core/src/index.ts`

**Interfaces:**

```ts
export interface ICEBuildOptions {
  readonly assetId: string;
  readonly creaseAngleDegrees?: number;
}

export interface ICEPreparedGLB {
  readonly bytes: Uint8Array;
  readonly stats: Readonly<{
    nodeCount: number;
    meshCount: number;
    triangleCount: number;
    edgeSegmentCount: number;
  }>;
}

export function buildPreparedGLB(
  source: ICESourceDocument,
  options: ICEBuildOptions,
): ICEPreparedGLB;

export function validatePreparedGLB(bytes: Uint8Array): ICESourceReport;
```

- [ ] **Step 1: Write the failing deterministic build test**

```ts
test('builds byte-identical prepared GLB output', () => {
  const first = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  const second = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  expect(first).toEqual(second);
});
```

- [ ] **Step 2: Run and observe RED**

Run: `npx node-test run tests/output/buildPreparedGLB.test.ts`

Expected: FAIL because GLB output building is absent.

- [ ] **Step 3: Implement deterministic JSON and binary packing**

Emit stable key order, unique IDs, one scene, baked matrix nodes, triangle primitives, independently indexed edge primitives, and flat-color materials. Write one JSON chunk and one BIN chunk with required padding. Compute SHA-256 over the BIN chunk and place it in `asset.extras.ice3.contentDigest.value`.

- [ ] **Step 4: Write failing profile validation tests**

```ts
test('accepts a generated ICE3 profile', () => {
  const bytes = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  expect(validatePreparedGLB(bytes).errors).toEqual([]);
});

test('rejects ordinary GLB without ICE3 profile metadata', () => {
  expect(validatePreparedGLB(ordinaryGLB).errors).toContain(
    'ICE3_TOOL_PROFILE_MISSING',
  );
});
```

- [ ] **Step 5: Implement profile validation and run tests**

Validate GLB framing, profile metadata, one scene, one buffer, no external URI, node matrices, triangle/line primitive modes, accessor types and alignment, index ranges, forbidden features, ID uniqueness, digest, bounds, and stats.

Run: `npx node-test run tests/output`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/toolchain-core tests/output
git commit -m "feat(toolchain): emit prepared GLB profile"
```

### Task 6: Add inspect, build, and validate CLI commands

**Files:**
- Create: `packages/cli/src/main.ts`
- Create: `packages/cli/src/commands.ts`
- Create: `tests/cli/commands.test.ts`
- Modify: `packages/cli/package.json`

**Interfaces:**

```ts
export async function runCli(argv: readonly string[]): Promise<number>;
```

- [ ] **Step 1: Write failing CLI tests**

```ts
test('build writes a prepared GLB atomically', async () => {
  const code = await runCli([
    'build',
    'tests/fixtures/minimal.gltf',
    '--output',
    temporaryOutput,
    '--asset-id',
    'sample',
  ]);
  expect(code).toBe(0);
  expect(existsSync(temporaryOutput)).toBe(true);
});

test('build returns non-zero for unsupported input', async () => {
  expect(await runCli(['build', unsupportedFixture, '--output', output])).toBe(1);
  expect(existsSync(output)).toBe(false);
});
```

- [ ] **Step 2: Run and observe RED**

Run: `npx node-test run tests/cli/commands.test.ts`

Expected: FAIL because CLI commands are absent.

- [ ] **Step 3: Implement commands**

`inspect` prints report and statistics. `build` writes to a same-directory temporary file, validates the generated bytes, renames atomically, and removes temporary files on failure. `validate` prints the profile report.

Support `--json`, `--asset-id`, and `--crease-angle`.

- [ ] **Step 4: Run CLI tests and full toolchain verification**

Run:

```bash
npx node-test run tests/cli
npm run verify
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli tests/cli package.json package-lock.json
git commit -m "feat(cli): add ICE3 GLB asset commands"
```

### Task 7: Freeze the cross-repository contract fixture

**Files:**
- Create: `fixtures/prepared-cube.glb`
- Create: `fixtures/prepared-cube.report.json`
- Create: `tests/fixtures/contract.test.ts`
- Create: `tests/fixtures/cube.gltf`
- Create: `README.md`

**Interfaces:**
- Consumes: complete toolchain CLI.
- Produces: repository example, profile report, and checked-in GLB consumed by the engine plan.

- [ ] **Step 1: Build the contract fixture**

Run:

```bash
node packages/cli/dist/main.js build tests/fixtures/cube.gltf \
  --output fixtures/prepared-cube.glb \
  --asset-id prepared-cube
node packages/cli/dist/main.js inspect fixtures/prepared-cube.glb \
  --json > fixtures/prepared-cube.report.json
```

- [ ] **Step 2: Write contract assertions**

```ts
test('checked-in contract fixture remains valid and deterministic', async () => {
  const bytes = readFileSync('fixtures/prepared-cube.glb');
  expect(validatePreparedGLB(bytes).errors).toEqual([]);
  const rebuilt = buildPreparedGLB(
    await readSource('tests/fixtures/cube.gltf'),
    { assetId: 'prepared-cube' },
  ).bytes;
  expect(rebuilt).toEqual(bytes);
});
```

- [ ] **Step 3: Document the command surface and profile boundary**

README documents Node 24, install, inspect/build/validate examples, atomic output, source-format scope, profile rejection behavior, and the rule that no source adapter is used at runtime.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm run verify
```

Expected: all tests pass and the contract fixture validates.

- [ ] **Step 5: Commit**

```bash
git add README.md fixtures tests/fixtures/contract.test.ts
git commit -m "test: freeze prepared GLB contract fixture"
```
