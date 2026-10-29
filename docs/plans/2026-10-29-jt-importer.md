# JT Source Importer 实施计划

> Document ID: ICE3-TOOL-PLAN-007
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**目标：** 通过受控外部 converter bridge 将 `.jt` 转为标准 source GLB，并接入现有
Prepared、partition、LOD、Tileset 和发布流程。

**架构：** `@ice3/jt-importer` 固定参数启动 `ICE3_JT_CONVERTER`，读取标准 GLB；
TypeScript canonicalizer 负责 JT metadata、Selection、实例、材质、坐标和确定性。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、`@gltf-transform/core` 4.5.1、
Node child process、Node test 和 esbuild。

**规格：** [JT Source Importer 规格](../specs/2026-10-29-jt-importer.md)

## 全局约束

- Runtime 只接收 Prepared GLB 和本地 Tileset。
- JT parser/converter 不进入 npm tarball 或 Browser bundle。
- Converter 只从 `ICE3_JT_CONVERTER` 或显式 injection 获取。
- 使用 `spawn` 和独立参数，不使用 shell。
- Converter output 必须为米制、right-handed y-up 标准 GLB。
- 不自动下载 converter，不调用网络服务。
- 不提交客户 JT、派生 GLB、路径或截图。
- Node.js `24.22.1`，Git identity `damoqiongqiu`。
- 行为变化遵循 RED-GREEN-REFACTOR，完整门禁后才合入。

## 审查重点

- Converter process 超时后必须终止，即使在忽略 SIGTERM 时。
- Stdout/stderr、绝对路径和 converter traceback 不进入最终 report。
- 无效 GLB 与空 Geometry 必须产生不同 Diagnostic。
- 共享 mesh instance 保留独立 Selection。
- Partition/static batching 后 JT metadata 不丢失。

---

### Task 1：建立 converged fixture 与 contract runner

**文件：**

- 新建：`tests/fixtures/jt/synthetic-contract.jt`
- 新建：`tests/fixtures/jt/fake-converter.mjs`
- 新建：`tests/fixtures/jt/slow-converter.sh`
- 新建：`tests/jt/converter.test.ts`
- 新建：`packages/jt-importer/src/runConverter.ts`

**接口：**

```ts
runJtConverter(request, {
  converterBinary,
  timeoutMs,
  runner,
}): Promise<void>
```

- [ ] **步骤 1：编写 converter 失败与成功测试**

```ts
await expect(runJtConverter(request, {
  converterBinary: missing,
})).rejects.toThrow('ICE3_TOOL_JT_CONVERTER_UNAVAILABLE');
await runJtConverter(request, { converterBinary, runner });
expect((await stat(output)).size).toBeGreaterThan(20);
```

- [ ] **步骤 2：确认缺失实现**

运行：`npm test -- tests/jt/converter.test.ts`

预期：FAIL，module 不存在。

- [ ] **步骤 3：实现 converter bridge**

固定 `--input/--output`，有界 buffer，timeout 发送 `SIGTERM`，一秒后 `SIGKILL`。

- [ ] **步骤 4：实现合成 converter**

读取 contract marker，生成带两个设备、材质、层级、JT metadata 和共享 mesh 的 GLB。

- [ ] **步骤 5：运行并提交**

```bash
npm test -- tests/jt/converter.test.ts
git add packages/jt-importer tests/fixtures/jt tests/jt
git commit -m "feat(toolchain): add controlled JT converter bridge"
```

---

### Task 2：实现 JT canonicalizer

**文件：**

- 新建：`packages/jt-importer/src/canonicalizeJtGlb.ts`
- 新建：`tests/jt/canonicalizeJtGlb.test.ts`

**接口：**

- 消费 converter 输出的标准 GLB。
- 产出标准 source GLB、stats 和 `extras.ice3.jt`。

- [ ] **步骤 1：编写失败测试**

```ts
expect(names).toEqual(expect.arrayContaining(['PrimaryPump', 'BufferTank']));
expect(pump.extras.ice3.jt.objectId).toBe('JT-PUMP-101');
expect(pump.extras.ice3.jt.customProperties.EquipmentTag).toBe('P-101');
```

- [ ] **步骤 2：确认失败并实现**

运行：`npm test -- tests/jt/canonicalizeJtGlb.test.ts`

实现层级、材质、instanceGroup、Selection、property sanitization、local origin 和
unit contract metadata。

- [ ] **步骤 3：验证空 Geometry 与 metadata**

空 GLB 返回 `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY`。

- [ ] **步骤 4：提交**

```bash
git add packages/jt-importer tests/jt
git commit -m "feat(toolchain): canonicalize JT source GLB"
```

---

### Task 3：接入 adapter、CLI、partition 和 Prepared

**文件：**

- 新建：`packages/jt-importer/package.json`
- 新建：`packages/jt-importer/tsconfig.json`
- 新建：`packages/jt-importer/src/index.ts`
- 修改：`packages/cli/*`
- 修改：`tsconfig.json`
- 修改：`packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 新建：`tests/cli/jtImportCommand.test.ts`
- 新建：`tests/jt/jtPipeline.test.ts`

**接口：**

- `createJtImporter()` 注册 `.jt`，使用 `ICE3_JT_CONVERTER` 与 `ICE3_JT_TIMEOUT_MS`。
- auto、显式 `jt`、partition 和 batching 全部可用。

- [ ] **步骤 1：编写失败测试**

```ts
expect(await runCli([
  'import', 'tests/fixtures/jt/synthetic-contract.jt',
  '--output', output, '--asset-id', 'synthetic-jt', '--json',
])).toBe(0);
expect(JSON.parse(await readFile(report, 'utf8')).adapter.id).toBe('jt');
```

- [ ] **步骤 2：确认失败**

运行：`npm test -- tests/cli/jtImportCommand.test.ts tests/jt/jtPipeline.test.ts`

- [ ] **步骤 3：注册 adapter 与 metadata preservation**

- [ ] **步骤 4：运行并提交**

```bash
git add packages/jt-importer packages/cli packages/toolchain-core tsconfig.json tests
git commit -m "feat(toolchain): expose JT import command"
```

---

### Task 4：失败、确定性、架构和发布

**文件：**

- 新建：`tests/jt/jtFailures.test.ts`
- 新建：`tests/jt/jtDeterminism.test.ts`
- 修改：`tests/architecture/layout.test.ts`
- 修改：`scripts/check-release-package.mjs`

**接口：**

- Tarball 包含 JT adapter code，不包含 converter。
- Release check 使用合成 contract converter 验证 adapter integration。

- [ ] **步骤 1：编写失败测试**

覆盖 unavailable、timeout、non-zero、invalid output、empty geometry 和
`warnings-as-errors`。

- [ ] **步骤 2：实现并对失败进行稳定映射**

- [ ] **步骤 3：运行 release check**

```bash
npm run test:architecture
npm test -- tests/jt tests/cli/jtImportCommand.test.ts
npm run release:check
```

- [ ] **步骤 4：提交**

```bash
git add tests scripts
git commit -m "test(toolchain): verify JT import boundaries"
```

---

### Task 5：文档、完整门禁和合并

**文件：**

- 修改：`README.md`
- 修改：`docs/README.md`
- 修改：`docs/architecture.md`
- 修改：`docs/reference/cli.md`
- 修改：`docs/specs/2026-10-29-source-import-adapters.md`
- 修改：`packages/cli/README.md`
- 修改：本计划

- [ ] **步骤 1：更新文档**

明确 `ICE3_JT_CONVERTER`、`ICE3_JT_TIMEOUT_MS`、converter contract、Diagnostic 和
“JT parser 不在 Toolchain/Runtime”的边界。

- [ ] **步骤 2：完整门禁**

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

检查 process lifecycle、output validation、metadata、实例、坐标、敏感路径和禁用名称。

- [ ] **步骤 4：提交并合并**

确认 Git author/committer，完整门禁通过后：

```bash
git merge --no-ff feat/jt-importer
npm run verify
npm run release:check
```

合入后把本计划更新为 `Implemented`，删除功能分支。
