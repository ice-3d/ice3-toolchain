# ICE3 工具链 M1 GLB 管线实施计划

> Document ID: ICE3-TOOL-PLAN-001
>
> Status: Implemented
>
> Owner: ICE3 Toolchain maintainers
> **面向智能体执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐项执行此计划。使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 构建一个独立工具链，将源 glTF 2.0 资产转换为确定性的 ICE3 Prepared GLB Profile v1 文件，同时不引入运行时转换管线。

**架构：** 该工具链仓库使用 npm 工作区，包含纯预处理核心和轻量 CLI。核心接受 glTF JSON 或 GLB 输入，规范化受支持的子集，烘焙节点矩阵，准备三角形和边缓冲区，添加 ICE3 Profile 元数据，并写出标准的单 BIN GLB。不导入任何引擎运行时包。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、ESM、原生 Node API、通过 `tsx` 使用的 Node 测试运行器、npm 工作区。

**规范：** [ICE3 引擎 M1 资产设计](https://github.com/ice-3d/ice3-engine/blob/main/docs/specs/2026-10-27-engine-m1-asset-design.md)

## 全局约束

- 源格式解析以及所有重型变换仅在此工具链中执行。
- M1 源格式仅为 glTF 2.0 JSON 和 GLB。
- 输出为带一个 JSON 块和一个 BIN 块的标准 GLB。
- 每个输出均携带 `asset.extras.ice3`，其中包含 `profile: "ice3-prepared"` 和 `profileVersion: "1.0"`。
- 输出节点使用标准的 16 元素 `matrix` 值；不输出节点 TRS。
- 三角形图元使用模式 `4`；生成的边图元使用模式 `1`。
- 位置为非规范化的 `FLOAT` `VEC3`；索引为非规范化的 `UNSIGNED_SHORT` 或 `UNSIGNED_INT`。
- 拒绝纹理、图像、动画、蒙皮、变形目标、相机、光源、稀疏访问器、外部 URI 和必需的扩展。
- 节点、网格、几何体和材质 ID 在相同构建之间保持稳定。
- 相同的源和选项生成逐字节一致的输出。
- 不增加旧版或遗留传输兼容性。
- 任何文档、源文件、标识符或测试输出均不得包含受限的产品或供应商名称。

## 审查重点

- 一个源 GLB 在其 JSON 或 BIN 块内部被截断：转换以结构化错误失败，且不生成输出文件。
- 一个源节点包含四元数 TRS：工具链将其烘焙为矩阵，运行时永远不会看到 TRS。
- 一个立方体使用对角边进行三角化：只有边界边或超过阈值的折痕边会成为可见线图元。
- 存在不支持的动画或纹理：`inspect` 会报告该问题，`build` 会拒绝构建，而不会静默丢弃。
- 同一输入被构建两次：JSON 顺序、填充、ID 和 SHA-256 保持一致。
- 构建在完成前被中断：最终输出路径绝不会留下部分 GLB。

---

## 文件结构

```text
ice3-toolchain/
├─ package.json                         workspace scripts and tool versions
├─ package-lock.json                    reproducible dependency graph
├─ .gitignore                           build and temporary output
├─ .nvmrc                               Node.js 24.22.1
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

### 任务 1：搭建独立的工具链工作区

**文件：**
- 创建：`package.json`
- 创建：`.nvmrc`
- 创建：`.gitignore`
- 创建：`tsconfig.base.json`
- 创建：`tsconfig.json`
- 创建：`AGENTS.md`
- 创建：`packages/toolchain-core/package.json`
- 创建：`packages/toolchain-core/tsconfig.json`
- 创建：`packages/toolchain-core/src/index.ts`
- 创建：`packages/cli/package.json`
- 创建：`packages/cli/tsconfig.json`
- 创建：`tests/architecture/layout.test.ts`

**接口：**
- 使用：无仓库代码。
- 生成：npm 工作区命令 `build`、`typecheck`、`test`、`test:architecture` 和 `verify`；包入口 `@ice3/toolchain-core` 和 `ice3-tool`。

- [ ] **步骤 1：编写失败的布局测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { existsSync, readFileSync } from 'node:fs';

test('workspace contains an isolated preprocessing core and CLI', () => {
  expect(existsSync('packages/toolchain-core/package.json')).toBe(true);
  expect(existsSync('packages/cli/package.json')).toBe(true);

  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(root.private).toBe(true);
  expect(root.workspaces).toEqual(['packages/*']);
});
```

- [ ] **步骤 2：运行测试并确认工作区不存在**

运行：`npm test -- tests/architecture/layout.test.ts`

预期：FAIL，因为 `test runner setup is absent.

- [ ] **步骤 3：创建工作区清单和严格的 TypeScript 配置**

根目录 `package.json`：

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
    "test": "node scripts/run-tests.mjs",
    "test:architecture": "node scripts/run-tests.mjs tests/architecture",
    "verify": "npm run test:architecture && npm run typecheck && npm test"
  },
  "devDependencies": {
    "@types/node": "24.19.2",
    "typescript": "7.0.2",
    "expect": "30.5.2",
    "jest-mock": "30.5.2",
    "tsx": "4.23.15"
  }
}
```

`tsconfig.base.json`：

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

创建两个包清单，包含 `"type": "module"`、`"private": true` 和 `"version": "0.0.0"`。CLI 清单声明：

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

- [ ] **步骤 4：添加仓库规则和构建图**

`AGENTS.md` 记录与引擎仓库相同的依赖、命名、当前技术、分支与合并以及验证规则，并额外规定源格式适配仅属于此仓库。

根目录 `tsconfig.json` 引用 `packages/toolchain-core` 和 `packages/cli`。

- [ ] **步骤 5：安装并验证**

运行：

```bash
nvm use
npm install
npm run verify
```

预期：所有检查均通过，包含一个架构测试和一次空的 TypeScript 构建。

- [ ] **步骤 6：提交**

```bash
git add .
git commit -m "chore: scaffold ICE3 toolchain workspace"
```

### 任务 2：读取 glTF JSON 和 GLB 容器

**文件：**
- 创建：`packages/toolchain-core/src/source/readSource.ts`
- 创建：`packages/toolchain-core/src/source/index.ts`
- 修改：`packages/toolchain-core/src/index.ts`
- 创建：`tests/fixtures/create-fixtures.ts`
- 创建：`tests/fixtures/minimal.gltf`
- 创建：`tests/fixtures/minimal.bin`
- 创建：`tests/source/readSource.test.ts`

**接口：**

```ts
export interface ICESourceDocument {
  readonly json: Readonly<Record<string, unknown>>;
  readonly buffers: readonly Uint8Array[];
  readonly baseDirectory: string;
}

export async function readSource(path: string): Promise<ICESourceDocument>;
```

- [ ] **步骤 1：生成最小源测试夹具**

`create-fixtures.ts` 写入一个三角形位置缓冲区，以及一个包含一个网格、一个材质、一个节点和一个场景的 JSON 文档。JSON 缓冲区使用 `minimal.bin` 作为其 URI。

- [ ] **步骤 2：编写失败的容器测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 3：运行测试并验证失败**

运行：`npm test -- tests/source/readSource.test.ts`

预期：FAIL，因为缺少资源加载和 GLB 分帧。

- [ ] **步骤 4：实现严格的 JSON 和 GLB 分帧**

JSON 路径拒绝绝对资源 URI 或穿越父目录的资源 URI。数据 URI 使用 Node `Buffer` 解码。相对路径相对于源目录解析。

GLB 路径验证：

```ts
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
```

它要求版本为 `2`、总长度受限、JSON 作为第一个块、最多一个 BIN 块，并且块长度按四字节对齐。未知块会被忽略。JSON 填充使用 UTF-8 空格字节去除；BIN 填充仅作为字节保留，并在读取访问器时通过声明的缓冲区长度排除。

- [ ] **步骤 5：运行测试**

运行：`npm test -- tests/source/readSource.test.ts`

预期：针对有效的 JSON 和 GLB 输入、格式错误的头部、错误的块顺序、截断的块、缺失资源以及不安全的 URI 穿越的测试均返回 PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/toolchain-core tests/fixtures tests/source
git commit -m "feat(toolchain): read glTF source containers"
```

### 任务 3：解码访问器并验证受支持的源子集

**文件：**
- 创建：`packages/toolchain-core/src/source/readAccessor.ts`
- 创建：`packages/toolchain-core/src/scene/validateSource.ts`
- 创建：`tests/source/readAccessor.test.ts`
- 创建：`tests/scene/validateSource.test.ts`
- 修改：`packages/toolchain-core/src/index.ts`

**接口：**

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

- [ ] **步骤 1：编写失败的访问器测试**

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

- [ ] **步骤 2：运行并观察 RED**

运行：`npm test -- tests/source/readAccessor.test.ts`

预期：FAIL，因为缺少访问器解码。

- [ ] **步骤 3：实现访问器解码**

支持位置和索引使用的访问器分量类型、缓冲区视图字节偏移和步长，以及 `byteOffset`。返回复制到工具链自有内存中的类型化数组；运行时零拷贝保证不适用于输入预处理。

- [ ] **步骤 4：编写失败的子集验证测试**

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

- [ ] **步骤 5：实现验证并运行测试**

验证会检查每个节点、网格、图元、材质、访问器、缓冲区视图和场景引用。它会报告动画、蒙皮、变形目标、相机、纹理、图像、采样器、稀疏访问器、压缩扩展和外部输出要求，而不会静默跳过。

运行：`npm test -- tests/source/readAccessor.test.ts tests/scene/validateSource.test.ts`

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/toolchain-core tests/source tests/scene/validateSource.test.ts
git commit -m "feat(toolchain): validate source geometry subset"
```

### 任务 4：准备矩阵、三角形、材质和折痕边

**文件：**
- 创建：`packages/toolchain-core/src/scene/bakeMatrix.ts`
- 创建：`packages/toolchain-core/src/scene/prepareMesh.ts`
- 创建：`tests/scene/bakeMatrix.test.ts`
- 创建：`tests/scene/prepareMesh.test.ts`
- 修改：`packages/toolchain-core/src/index.ts`

**接口：**

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

- [ ] **步骤 1：编写失败的矩阵测试**

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

- [ ] **步骤 2：运行并实现矩阵烘焙**

运行：`npm test -- tests/scene/bakeMatrix.test.ts`

预期：首先为 RED，然后在实现列主序 TRS 组合和矩阵直通后变为 PASS。

- [ ] **步骤 3：编写失败的三角形和边测试**

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

- [ ] **步骤 4：实现三角形准备**

接受 triangle、triangle-strip 和 triangle-fan 模式。输出索引三角形。计算有限边界，并拒绝非有限位置。

- [ ] **步骤 5：实现折痕边生成**

在焊接相邻关系之前，对位置进行均匀量化。统计三角形边的出现次数，并计算相邻面的法线。满足以下条件时输出一条边：

- 它属于一个三角形；
- 其两个相邻面的法线差异至少为 `creaseAngleDegrees`；
- 缓存的输出尚未发出相同的无序顶点对。

默认折痕角为 `30`，由 `--crease-angle` 控制。

- [ ] **步骤 6：运行测试并提交**

运行：`npm test -- tests/scene/bakeMatrix.test.ts tests/scene/prepareMesh.test.ts`

预期：PASS，其中立方体边不包含三角化对角线。

```bash
git add packages/toolchain-core tests/scene
git commit -m "feat(toolchain): prepare geometry and crease edges"
```

### 任务 5：生成确定性的 ICE3 Prepared GLB

**文件：**
- 创建：`packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 创建：`packages/toolchain-core/src/output/validatePreparedGLB.ts`
- 创建：`tests/output/buildPreparedGLB.test.ts`
- 创建：`tests/output/validatePreparedGLB.test.ts`
- 修改：`packages/toolchain-core/src/index.ts`

**接口：**

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

- [ ] **步骤 1：编写失败的确定性构建测试**

```ts
test('builds byte-identical prepared GLB output', () => {
  const first = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  const second = buildPreparedGLB(source, { assetId: 'sample' }).bytes;
  expect(first).toEqual(second);
});
```

- [ ] **步骤 2：运行并观察 RED**

运行：`npm test -- tests/output/buildPreparedGLB.test.ts`

预期：FAIL，因为缺少 GLB 输出构建。

- [ ] **步骤 3：实现确定性的 JSON 和二进制打包**

输出稳定的键顺序、唯一 ID、一个场景、烘焙后的矩阵节点、三角形图元、独立索引的边图元以及纯色材质。写入一个 JSON 块和一个带所需填充的 BIN 块。对 BIN 块计算 SHA-256，并将其放入 `asset.extras.ice3.contentDigest.value`。

- [ ] **步骤 4：编写失败的 Profile 验证测试**

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

- [ ] **步骤 5：实现 Profile 验证并运行测试**

验证 GLB 分帧、Profile 元数据、一个场景、一个缓冲区、无外部 URI、节点矩阵、三角形/线图元模式、访问器类型和对齐、索引范围、禁止的特性、ID 唯一性、摘要、边界和统计信息。

运行：`npm test -- tests/output`

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/toolchain-core tests/output
git commit -m "feat(toolchain): emit prepared GLB profile"
```

### 任务 6：添加 inspect、build 和 validate CLI 命令

**文件：**
- 创建：`packages/cli/src/main.ts`
- 创建：`packages/cli/src/commands.ts`
- 创建：`tests/cli/commands.test.ts`
- 修改：`packages/cli/package.json`

**接口：**

```ts
export async function runCli(argv: readonly string[]): Promise<number>;
```

- [ ] **步骤 1：编写失败的 CLI 测试**

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

- [ ] **步骤 2：运行并观察 RED**

运行：`npm test -- tests/cli/commands.test.ts`

预期：FAIL，因为缺少 CLI 命令。

- [ ] **步骤 3：实现命令**

`inspect` 输出报告和统计信息。`build` 写入同一目录中的临时文件，验证生成的字节，原子重命名，并在失败时删除临时文件。`validate` 输出 Profile 报告。

支持 `--json`、`--asset-id` 和 `--crease-angle`。

- [ ] **步骤 4：运行 CLI 测试和完整工具链验证**

运行：

```bash
npm test -- tests/cli
npm run verify
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add packages/cli tests/cli package.json package-lock.json
git commit -m "feat(cli): add ICE3 GLB asset commands"
```

### 任务 7：冻结跨仓库契约测试夹具

**文件：**
- 创建：`fixtures/prepared-cube.glb`
- 创建：`fixtures/prepared-cube.report.json`
- 创建：`tests/fixtures/contract.test.ts`
- 创建：`tests/fixtures/cube.gltf`
- 创建：`README.md`

**接口：**
- 使用：完整的工具链 CLI。
- 生成：仓库示例、Profile 报告，以及由引擎计划使用的已入库 GLB。

- [ ] **步骤 1：构建契约测试夹具**

运行：

```bash
node packages/cli/dist/main.js build tests/fixtures/cube.gltf \
  --output fixtures/prepared-cube.glb \
  --asset-id prepared-cube
node packages/cli/dist/main.js inspect fixtures/prepared-cube.glb \
  --json > fixtures/prepared-cube.report.json
```

- [ ] **步骤 2：编写契约断言**

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

- [ ] **步骤 3：记录命令接口与 Profile 边界**

README 记录 Node.js 24.22.1 LTS、安装、inspect/build/validate 示例、原子输出、源格式范围、Profile 拒绝行为，以及运行时不得使用源适配器的规则。

- [ ] **步骤 4：运行完整验证**

运行：

```bash
npm run verify
```

预期：所有测试均通过，且契约测试夹具验证通过。

- [ ] **步骤 5：提交**

```bash
git add README.md fixtures tests/fixtures/contract.test.ts
git commit -m "test: freeze prepared GLB contract fixture"
```

## 相关文档

- `ICE3-TOOL-IDX-001` — [文档索引](../README.md)
- `ICE3-TOOL-ARC-001` — [工具链架构](../architecture.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
