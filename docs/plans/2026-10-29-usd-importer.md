# USD Source Importer 实施计划

> Document ID: ICE3-TOOL-PLAN-005
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**目标：** 通过固定版本 Blender headless bridge 将 `.usda/.usdc` 转换为标准 source GLB，
并接入现有 Prepared GLB、partition、LOD、Tileset 和发布流程。

**架构：** 独立 `@ice3/usd-importer` package 启动白名单 Python bridge，把 USD Mesh 和
层级导出为 raw GLB；TypeScript canonicalizer 负责稳定命名、实例、Selection、
custom properties、坐标原点和最终 source GLB。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、Blender 5.2.3、
`@gltf-transform/core` 4.5.1、Node test、esbuild 和 npm workspace。

**规格：** [USD Source Importer 规格](../specs/2026-10-29-usd-importer.md)

## 全局约束

- Runtime 只接受 Prepared GLB 和受支持的本地 Tileset。
- Blender 固定 `5.2.3`，仅作为可选外部构建依赖。
- 只执行仓库内白名单 bridge 脚本。
- 仅支持 `.usda` 和 `.usdc`；首期不支持 `.usdz`。
- 不支持 animation、skeleton、camera、light、volume、复杂材质和 Runtime conversion。
- 所有成功输出为米制、right-handed y-up 标准 source GLB。
- 不提交客户 USD、派生 GLB、路径、截图或缩略图。
- Git author 和 committer 为 `damoqiongqiu <damoqiongqiu@126.com>`。
- 每次行为变化先观察测试失败，完整 suite 通过后才合入 `main`。

## 审查重点

- 大坐标必须共享一次 origin，避免 float32 丢失相对距离。
- 共享 mesh instance 必须保留独立 Node 和 Selection，不能复制 Geometry。
- Blender 对象重命名和导出顺序变化不得改变 canonical ordinal Selection 规则。
- timeout 后忽略 SIGTERM 的进程必须被 SIGKILL。
- 失败路径不得在最终目标留下 raw GLB、source GLB 或 Prepared GLB。

---

### Task 1：建立合成 USD fixture

**文件：**

- 新建：`tests/fixtures/usd/generate-synthetic-usd.py`
- 新建：`tests/fixtures/usd/synthetic-plant.usda`
- 新建：`tests/fixtures/usd/synthetic-plant.usdc`
- 新建：`tests/usd/fixture.test.ts`

**接口：**

- 产出：两个表示相同合成结构的 USD 文件，供 bridge、adapter、CLI 和 release 测试复用。

- [ ] **步骤 1：编写 fixture 验证测试**

```ts
test('fixtures contain ASCII and binary USD', async () => {
  const ascii = await readFile('tests/fixtures/usd/synthetic-plant.usda', 'utf8');
  const binary = await readFile('tests/fixtures/usd/synthetic-plant.usdc');
  expect(ascii).toContain('#usda 1.0');
  expect(ascii).toContain('PrimaryPump');
  expect(binary.subarray(0, 8).toString('ascii')).toBe('PXR-USDC');
});
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/usd/fixture.test.ts`

预期：FAIL，fixture 尚不存在。

- [ ] **步骤 3：生成 fixture**

Generator 创建 `TreatmentLine`、`PrimaryPump`、`PumpInstanceA` 和 `BufferTank`，
设置 `EquipmentTag=P-101`，分别用 `.usda` 和 `.usdc` export。

运行：

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python \
  tests/fixtures/usd/generate-synthetic-usd.py -- \
  --output-dir tests/fixtures/usd
```

- [ ] **步骤 4：运行 fixture 测试**

运行：`npm test -- tests/usd/fixture.test.ts`

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add tests/fixtures/usd tests/usd/fixture.test.ts
git commit -m "test(toolchain): add synthetic USD fixtures"
```

---

### Task 2：实现 USD Blender runtime 与 bridge

**文件：**

- 新建：`packages/usd-importer/package.json`
- 新建：`packages/usd-importer/tsconfig.json`
- 新建：`packages/usd-importer/src/types.ts`
- 新建：`packages/usd-importer/src/blenderRuntime.ts`
- 新建：`packages/usd-importer/src/runBridge.ts`
- 新建：`packages/usd-importer/scripts/usd-to-glb.py`
- 新建：`tests/usd/runBridge.test.ts`

**接口：**

```ts
export async function runUsdBridge(
  request: { inputPath: string; outputPath: string; reportPath: string },
  options: {
    blenderBinary: string;
    scriptPath: string;
    timeoutMs?: number;
  },
): Promise<IUsdBridgeReport>;
```

- [ ] **步骤 1：编写失败测试**

```ts
test('maps USD timeout without leaking process output', async () => {
  await expect(runUsdBridge(request, {
    blenderBinary: '/tmp/Blender',
    scriptPath: '/repo/usd-to-glb.py',
    timeoutMs: 1,
    runner: async () => ({
      code: null,
      stdout: '',
      stderr: 'private path',
      timedOut: true,
    }),
  })).rejects.toThrow('ICE3_TOOL_USD_TIMEOUT');
});
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/usd/runBridge.test.ts`

预期：FAIL，module 不存在。

- [ ] **步骤 3：实现受控 runtime**

精确匹配 `5.2.3`，白名单参数不接收调用方 Python，输出和 report 限制在临时目录。
超时发送 `SIGTERM`，一秒后发送 `SIGKILL`。

- [ ] **步骤 4：实现 bridge 脚本**

固定 USD import 与 GLB export 参数。成功 report 必须包含：

```json
{
  "success": true,
  "converter": "blender",
  "toolVersion": "5.2.3",
  "blenderVersion": "5.2.3",
  "objects": []
}
```

- [ ] **步骤 5：运行测试**

运行：`npm test -- tests/usd/runBridge.test.ts`

预期：PASS，包括忽略 `SIGTERM` 的进程在一秒后被强制结束。

- [ ] **步骤 6：提交**

```bash
git add packages/usd-importer tests/usd/runBridge.test.ts
git commit -m "feat(toolchain): add USD Blender bridge"
```

---

### Task 3：实现 USD canonicalizer

**文件：**

- 新建：`packages/usd-importer/src/canonicalizeUsdGlb.ts`
- 新建：`packages/usd-importer/src/mergeBridgeReport.ts`
- 新建：`tests/usd/canonicalizeUsdGlb.test.ts`

**接口：**

- 消费：raw GLB 与 `IUsdBridgeReport`。
- 产出：标准 source GLB、稳定 stats、`extras.ice3.usd`。

- [ ] **步骤 1：编写层级与实例失败测试**

```ts
test('canonicalizes USD hierarchy, instances and properties', async () => {
  const stats = await canonicalizeUsdGlb(rawGlb, sourceGlb, {
    assetId: 'synthetic-usd',
    bridgeReport,
  });
  expect(stats.instanceNodeCount).toBeGreaterThan(0);
  expect(names).toEqual(expect.arrayContaining([
    'TreatmentLine',
    'PrimaryPump',
    'PumpInstanceA',
    'BufferTank',
  ]));
  expect(pumpNode?.mesh).toBe(instanceNode?.mesh);
  expect(pump?.extras?.ice3?.usd?.customProperties?.EquipmentTag)
    .toBe('P-101');
});
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/usd/canonicalizeUsdGlb.test.ts`

预期：FAIL，canonicalizer 尚不存在。

- [ ] **步骤 3：实现稳定 canonicalization**

按 GLB Node ordinal 分配 Selection，清理不支持资源，设置基础 display Material，
写入 USD metadata，确定性过滤复杂 custom property。

- [ ] **步骤 4：验证大坐标**

对 generator 提供的 `large-origin.usda` 断言 source accessor 最大绝对坐标小于 20，
且 `sourceOrigin[0]` 大于 1,000,000。

- [ ] **步骤 5：运行测试并提交**

运行：`npm test -- tests/usd/canonicalizeUsdGlb.test.ts`

```bash
git add packages/usd-importer tests/usd
git commit -m "feat(toolchain): canonicalize USD source GLB"
```

---

### Task 4：接入 adapter、CLI 和 partition

**文件：**

- 新建：`packages/usd-importer/src/index.ts`
- 修改：`packages/cli/src/commands.ts`
- 修改：`packages/cli/package.json`
- 修改：`tsconfig.json`
- 新建：`tests/cli/usdImportCommand.test.ts`
- 新建：`tests/usd/usdImporter.test.ts`
- 新建：`tests/usd/usdPipeline.test.ts`

**接口：**

- `createUsdImporter()` 注册 `.usda/.usdc`。
- CLI auto 和显式 `--adapter usd` 均可选择该 adapter。
- partition 直接接收 `.usda/.usdc`。

- [ ] **步骤 1：编写 CLI 与 partition 失败测试**

```ts
expect(await runCli([
  'import', 'tests/fixtures/usd/synthetic-plant.usda',
  '--output', output, '--asset-id', 'synthetic-usd', '--json',
])).toBe(0);
expect(JSON.parse(await readFile(report, 'utf8')).adapter.id).toBe('usd');
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/cli/usdImportCommand.test.ts tests/usd/usdPipeline.test.ts`

预期：FAIL，registry 未注册 USD。

- [ ] **步骤 3：注册 adapter 与 workspace**

只在 `auto` 或显式 `usd` 时 lazy import package，不增加 Runtime dependency。

- [ ] **步骤 4：验证 metadata 穿越 processing**

对 `.usdc` 执行 static batching partition，断言
`extras.ice3.usd.customProperties.EquipmentTag` 和 `instanceGroup` 保留。

- [ ] **步骤 5：运行全部 USD 测试**

运行：`npm test -- tests/usd tests/cli/usdImportCommand.test.ts`

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/usd-importer packages/cli tsconfig.json tests/usd tests/cli
git commit -m "feat(toolchain): expose USD import command"
```

---

### Task 5：覆盖失败、确定性与发布

**文件：**

- 新建：`tests/usd/usdFailures.test.ts`
- 新建：`tests/usd/usdDeterminism.test.ts`
- 修改：`tests/architecture/layout.test.ts`
- 修改：`scripts/build-release-package.mjs`
- 修改：`scripts/check-release-package.mjs`
- 修改：`tests/release/package.test.ts`

**接口：**

- 产出：Blender 缺失、版本错误、timeout、截断、空 Mesh 和 byte determinism 的证据。
- 发布 tarball 包含 `dist/usd/usd-to-glb.py`，不包含 Blender binary。

- [ ] **步骤 1：编写失败与 determinism 测试**

```ts
test('repeated USD imports are byte-identical', async () => {
  const first = await importUsd('first');
  const second = await importUsd('second');
  expect(await readFile(first.output)).toEqual(await readFile(second.output));
});
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/usd/usdFailures.test.ts tests/usd/usdDeterminism.test.ts`

预期：FAIL，failure mapping 或 determinism 尚不完整。

- [ ] **步骤 3：实现稳定失败和资源清理**

确保所有失败码符合规格，并验证 output 不存在。

- [ ] **步骤 4：更新发布 package**

Tarball 包含 USD bridge script，release check 实际从 tarball 执行 `.usda` 和 `.usdc`
import、validate 和 batching metadata 检查。

- [ ] **步骤 5：运行 USD、架构和 release 测试**

```bash
npm run test:architecture
npm test -- tests/usd tests/cli/usdImportCommand.test.ts
npm run release:check
```

预期：全部 PASS。

- [ ] **步骤 6：提交**

```bash
git add tests scripts
git commit -m "test(toolchain): verify USD import boundaries"
```

---

### Task 6：更新文档与完成门禁

**文件：**

- 修改：`README.md`
- 修改：`docs/README.md`
- 修改：`docs/architecture.md`
- 修改：`docs/reference/cli.md`
- 修改：`packages/cli/README.md`
- 修改：`THIRD_PARTY_NOTICES.md`
- 修改：本计划

- [ ] **步骤 1：更新公开文档**

记录 `.usda/.usdc`、Blender `5.2.3`、`ICE3_USD_TIMEOUT_MS`、支持边界、Diagnostic、
import/partition 示例和发布脚本位置。

- [ ] **步骤 2：更新文档索引**

加入 `ICE3-TOOL-SPEC-004` 与 `ICE3-TOOL-PLAN-005`，并保持有效引用关系。

- [ ] **步骤 3：运行完整门禁**

```bash
nvm use
npm run docs:check
npm run typecheck
npm test
npm run test:architecture
npm run release:check
npm run verify
```

- [ ] **步骤 4：整分支审查**

重点检查 process timeout、shared mesh、Selection 稳定性、custom property 深度、
local origin、partition metadata、敏感路径和禁用名称。

- [ ] **步骤 5：提交并合并**

确认 author/committer 为 `damoqiongqiu <damoqiongqiu@126.com>`，完整门禁通过后：

```bash
git merge --no-ff feat/usd-importer
npm run verify
npm run release:check
```

合入后更新本计划为 `Implemented`，删除功能分支。
