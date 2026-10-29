# OBJ Source Importer 实施计划

> Document ID: ICE3-TOOL-PLAN-006
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**目标：** 增加独立、进程内 OBJ/MTL adapter，把常见工业 OBJ 转为标准 source GLB，
并接入现有 Prepared、partition、LOD、Tileset 和发布流程。

**架构：** `@ice3/obj-importer` 使用隔离的 WASM importer 生成 raw GLB；TypeScript
reader 负责安全 sidecar、确定性 canonicalization、Selection、单位 warning、metadata
和 local origin。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、`assimpjs 0.0.10`、
`@gltf-transform/core` 4.5.1、Node test 和 esbuild。

**规格：** [OBJ Source Importer 规格](../specs/2026-10-29-obj-importer.md)

## 全局约束

- Runtime 只接受 Prepared GLB 和受支持的本地 Tileset。
- OBJ/MTL parsing 只在离线 Toolchain 中执行。
- OBJ 无内建单位，固定按米解释并返回 warning。
- 不读取 input 目录外、URL、绝对路径或 symlink 越界资源。
- 不提交客户资产、派生 GLB、本地路径或截图。
- 不支持 texture、复杂 PBR、animation、camera、light 和 Runtime conversion。
- Node.js 固定 `24.22.1`，Git identity 固定为 `damoqiongqiu`。
- 每项行为先观察失败测试，完整门禁通过后合入 `main`。

## 审查重点

- sidecar 路径不得逃逸 OBJ 目录或读取网络资源。
- 缺失 MTL 不得阻断纯 Geometry import，但 warning 必须进入 report。
- 多边形三角化后 triangle metric 与 Prepared GLB 一致。
- 大型坐标只能应用一次 shared origin。
- partition 和 static batching 后 OBJ metadata 不得丢失。

---

### Task 1：建立合成 OBJ/MTL fixture

**文件：**

- 新建：`tests/fixtures/obj/synthetic-plant.obj`
- 新建：`tests/fixtures/obj/synthetic-plant.mtl`
- 新建：`tests/fixtures/obj/large-origin.obj`
- 新建：`tests/fixtures/obj/empty.obj`
- 新建：`tests/fixtures/obj/truncated.obj`
- 新建：`tests/obj/fixture.test.ts`

**接口：**

- 产出：可分发、完全合成的 OBJ/MTL 测试输入。

- [ ] **步骤 1：编写 fixture 失败测试**

```ts
test('OBJ fixture contains two named objects and materials', async () => {
  const obj = await readFile('tests/fixtures/obj/synthetic-plant.obj', 'utf8');
  const mtl = await readFile('tests/fixtures/obj/synthetic-plant.mtl', 'utf8');
  expect(obj).toContain('o PrimaryPump');
  expect(obj).toContain('o BufferTank');
  expect(obj).toContain('mtllib synthetic-plant.mtl');
  expect(mtl).toContain('Kd 0.12 0.38 0.68');
});
```

- [ ] **步骤 2：确认失败**

运行：`npm test -- tests/obj/fixture.test.ts`

预期：FAIL，fixture 尚不存在。

- [ ] **步骤 3：编写 fixture**

包含两个不同颜色的 box、一个 quad face、large-origin、empty 和 truncated 输入。

- [ ] **步骤 4：验证并提交**

运行：`npm test -- tests/obj/fixture.test.ts`

```bash
git add tests/fixtures/obj tests/obj/fixture.test.ts
git commit -m "test(toolchain): add synthetic OBJ fixtures"
```

---

### Task 2：实现安全 OBJ resource reader

**文件：**

- 新建：`packages/obj-importer/src/readObjResources.ts`
- 新建：`tests/obj/readObjResources.test.ts`

**接口：**

```ts
export async function readObjResources(inputPath: string): Promise<{
  readonly obj: Buffer;
  readonly sidecars: readonly { name: string; bytes: Buffer }[];
  readonly warnings: readonly string[];
}>;
```

- [ ] **步骤 1：编写安全边界测试**

```ts
test('ignores MTL paths outside the OBJ directory', async () => {
  const result = await readObjResources(objWith('../outside.mtl'));
  expect(result.sidecars).toEqual([]);
  expect(result.warnings).toContain('ICE3_TOOL_OBJ_RESOURCE_IGNORED');
});
```

- [ ] **步骤 2：确认失败**

运行：`npm test -- tests/obj/readObjResources.test.ts`

预期：FAIL，module 不存在。

- [ ] **步骤 3：实现边界**

只接受相对路径，解析后必须仍位于 OBJ 目录；缺失 MTL 返回
`ICE3_TOOL_OBJ_MATERIAL_UNAVAILABLE`，不阻断 Geometry。

- [ ] **步骤 4：覆盖 symlink 与 deterministic warning**

对越界 symlink 返回 `ICE3_TOOL_OBJ_RESOURCE_IGNORED`，重复读取保持相同顺序。

- [ ] **步骤 5：运行并提交**

运行：`npm test -- tests/obj/readObjResources.test.ts`

```bash
git add packages/obj-importer tests/obj/readObjResources.test.ts
git commit -m "feat(toolchain): read OBJ materials safely"
```

---

### Task 3：实现 OBJ conversion 与 canonicalization

**文件：**

- 新建：`packages/obj-importer/package.json`
- 新建：`packages/obj-importer/tsconfig.json`
- 新建：`packages/obj-importer/src/convertObjToGlb.ts`
- 新建：`packages/obj-importer/src/canonicalizeObjGlb.ts`
- 新建：`tests/obj/canonicalizeObjGlb.test.ts`

**接口：**

```ts
export function createObjImporter(): ICESourceImporter;
```

- [ ] **步骤 1：编写失败转换测试**

```ts
test('preserves OBJ names, materials and local origin', async () => {
  const result = await createObjImporter().import(input, context);
  const source = await readSource(result.sourceGlbPath);
  expect(names).toEqual(expect.arrayContaining(['PrimaryPump', 'BufferTank']));
  expect(result.warnings).toContain('ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS');
});
```

- [ ] **步骤 2：确认失败**

运行：`npm test -- tests/obj/canonicalizeObjGlb.test.ts`

预期：FAIL，converter 和 canonicalizer 尚不存在。

- [ ] **步骤 3：实现 WASM conversion**

`assimpjs` 接收 OBJ 和安全 sidecar，输出 GLB；不开启 Blender 或 Runtime dependency。

- [ ] **步骤 4：实现 canonical metadata**

写入 `extras.ice3.obj`，设置平光材质，移除 unsupported resources，并应用 local origin。

- [ ] **步骤 5：验证 warning 与大坐标**

断言 unit warning 必存在，large-origin source accessor 最大绝对坐标小于 20。

- [ ] **步骤 6：运行并提交**

运行：`npm test -- tests/obj/canonicalizeObjGlb.test.ts`

```bash
git add packages/obj-importer tests/obj/canonicalizeObjGlb.test.ts
git commit -m "feat(toolchain): canonicalize OBJ source GLB"
```

---

### Task 4：接入 CLI、partition 和 metadata pipeline

**文件：**

- 修改：`packages/cli/src/commands.ts`
- 修改：`packages/cli/package.json`
- 修改：`packages/cli/tsconfig.json`
- 修改：`tsconfig.json`
- 修改：`packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 新建：`tests/cli/objImportCommand.test.ts`
- 新建：`tests/obj/objPipeline.test.ts`

**接口：**

- `--adapter auto` 和显式 `--adapter obj` 均可工作。
- partition 直接接受 `.obj` 并保留 OBJ metadata。

- [ ] **步骤 1：编写失败测试**

```ts
expect(await runCli([
  'import', 'tests/fixtures/obj/synthetic-plant.obj',
  '--output', output, '--asset-id', 'synthetic-obj', '--json',
])).toBe(0);
expect(JSON.parse(await readFile(report, 'utf8')).adapter.id).toBe('obj');
```

- [ ] **步骤 2：确认失败**

运行：`npm test -- tests/cli/objImportCommand.test.ts tests/obj/objPipeline.test.ts`

预期：FAIL，registry 未注册 OBJ。

- [ ] **步骤 3：实现注册与 metadata 保留**

仅在 auto 或显式 obj 时 lazy import adapter。

- [ ] **步骤 4：运行并提交**

运行：`npm test -- tests/cli/objImportCommand.test.ts tests/obj/objPipeline.test.ts`

```bash
git add packages/cli packages/toolchain-core tsconfig.json tests/cli tests/obj
git commit -m "feat(toolchain): expose OBJ import command"
```

---

### Task 5：覆盖失败、确定性和发布

**文件：**

- 新建：`tests/obj/objFailures.test.ts`
- 新建：`tests/obj/objDeterminism.test.ts`
- 修改：`tests/architecture/layout.test.ts`
- 修改：`scripts/build-release-package.mjs`
- 修改：`scripts/check-release-package.mjs`
- 修改：`tests/release/package.test.ts`

**接口：**

- 成功输出不包含 source 或 sidecar 路径。
- 发布 tarball 可在有 Node.js 的环境中直接导入 OBJ。

- [ ] **步骤 1：编写 determinism 测试**

```ts
test('repeated OBJ imports are byte-identical', async () => {
  const first = await importObj('first');
  const second = await importObj('second');
  expect(await readFile(first.output)).toEqual(await readFile(second.output));
});
```

- [ ] **步骤 2：编写失败测试**

覆盖 empty、truncated、unsafe sidecar 和无 warnings-as-errors。

- [ ] **步骤 3：确认失败并实现**

运行：`npm test -- tests/obj/objFailures.test.ts tests/obj/objDeterminism.test.ts`

- [ ] **步骤 4：更新架构与 release check**

从真实 tarball 安装后执行 OBJ import、Prepared validation 和 batching metadata。

- [ ] **步骤 5：运行并提交**

```bash
npm run test:architecture
npm test -- tests/obj tests/cli/objImportCommand.test.ts
npm run release:check
git add tests scripts
git commit -m "test(toolchain): verify OBJ import boundaries"
```

---

### Task 6：文档、完整门禁和合并

**文件：**

- 修改：`README.md`
- 修改：`docs/README.md`
- 修改：`docs/architecture.md`
- 修改：`docs/reference/cli.md`
- 修改：`docs/specs/2026-10-29-source-import-adapters.md`
- 修改：`packages/cli/README.md`
- 修改：`THIRD_PARTY_NOTICES.md`
- 修改：本计划

- [ ] **步骤 1：更新文档**

记录 `.obj`、sidecar MTL、米制 warning、资源边界、Diagnostic 和 CLI 示例。

- [ ] **步骤 2：运行完整门禁**

```bash
nvm use
npm run docs:check
npm run typecheck
npm test
npm run test:architecture
npm run release:check
npm run verify
```

- [ ] **步骤 3：整分支审查**

检查 sidecar 越界、WASM 资源、local origin、triangle metric、metadata、敏感路径和禁用名称。

- [ ] **步骤 4：提交并合并**

确认 author/committer 为 `damoqiongqiu <damoqiongqiu@126.com>`，完整门禁通过后：

```bash
git merge --no-ff feat/obj-importer
npm run verify
npm run release:check
```

合入后更新计划为 `Implemented`，删除功能分支。
