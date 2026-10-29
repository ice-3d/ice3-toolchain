# 多格式 Source Import 与 STEP AP242 实施计划

> Document ID: ICE3-TOOL-PLAN-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**目标：** 为 `ice3-tool` 增加统一的 source import 框架，并完成 STEP AP242 到 Prepared
GLB 的首个端到端切片。

**架构：** `toolchain-core` 定义 importer contract 和 registry；私有
`@ice3/step-importer` 使用进程内 CAD/WASM 依赖把 STEP 转换为标准 source GLB；
CLI 在临时 workspace 编排 import、Prepared GLB build、validation 和原子发布。Engine
和现有 Runtime Asset contract 不变。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、现有 CLI、`@gltf-transform/core`
4.5.1、`occt-import-js` 0.0.23、Node test 和现有 npm workspace。

**规格：** [多格式 Source Import 适配器与 STEP AP242 首期规格](../specs/2026-10-29-source-import-adapters.md)

## 全局约束

- Runtime 仍只接受 Prepared GLB 和受支持的本地 Tileset。
- 首期只实现 STEP AP242；其它格式只保留 registry 扩展点。
- 不执行任意 `bpy`、Python、shell 或网络下载。
- STEP 输出统一为右手 y-up、meter 和标准 glTF 2.0。
- 无 Geometry、单位不明、无效层级或 validation 失败时不得发布输出。
- 失败时删除全部临时文件，正常结束时旧输出保持可用。
- 不提交客户模型或客户派生数据。
- Node.js 固定为 `24.22.1`，Git author 和 committer 为 `damoqiongqiu`。
- 每项行为先写失败测试，完整 suite 通过后才能合入 `main`。

## 审查重点

- STEP 只含装配层级但无 mesh：必须 `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY`，不能发布空 GLB。
- STEP 单位不明或混用：必须失败，不能默认当作米。
- 节点名称重复或为空：必须生成稳定 ID，不能丢失层级。
- Adapter 在写出 source GLB 前失败：不得在最终 output 留下文件。
- 通过 `import` 产出的文件：必须是 Prepared GLB，而不是临时 source GLB。

---

### Task 1：定义 importer contract 与 registry

**文件：**

- 新建：`packages/toolchain-core/src/import/types.ts`
- 新建：`packages/toolchain-core/src/import/createImporterRegistry.ts`
- 新建：`packages/toolchain-core/src/import/index.ts`
- 修改：`packages/toolchain-core/src/index.ts`
- 新建：`tests/import/importerRegistry.test.ts`

**接口：**

- 产出：`ICESourceImportInput`、`ICESourceImportContext`、`ICESourceImportResult`、
  `ICESourceImporter`
- 产出：`createImporterRegistry(importers): ICEImporterRegistry`
- 产出：`ICEImporterRegistry.resolve(path, requestedAdapter?)`
- 产出：`ICEImporterRegistry.import(input, context)`

- [ ] **步骤 1：编写 registry 失败测试**

```ts
import { createImporterRegistry } from
  '../../packages/toolchain-core/src/import/createImporterRegistry.js';

const importer = {
  id: 'fake',
  extensions: ['.step', '.stp'],
  capabilities: {
    hierarchy: true,
    vertexColors: true,
    materialColors: true,
    instances: true,
    semanticMetadata: false,
  },
  import: async () => ({
    adapterId: 'fake',
    sourceFormat: 'step',
    sourceGlbPath: '/tmp/source.glb',
    warnings: [],
  }),
};

test('selects an importer by normalized extension', () => {
  expect(createImporterRegistry([importer]).resolve('/tmp/gear.STP').id)
    .toBe('fake');
});

test('rejects an unsupported format and mismatched explicit adapter', () => {
  const registry = createImporterRegistry([importer]);
  expect(() => registry.resolve('/tmp/model.ifc')).toThrow(
    'ICE3_TOOL_IMPORT_UNSUPPORTED',
  );
  expect(() => registry.resolve('/tmp/model.step', 'other')).toThrow(
    'ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE',
  );
});
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/import/importerRegistry.test.ts`

预期：FAIL，因为 importer registry module 尚不存在。

- [ ] **步骤 3：实现最小 contract 和 registry**

Registry 使用 `extname(path).toLowerCase()`，拒绝重复 importer ID 和重复扩展名。
`auto` 仅选择第一个匹配扩展名；显式选择不匹配时返回稳定错误码。

- [ ] **步骤 4：运行契约测试**

运行：`npm test -- tests/import/importerRegistry.test.ts`

预期：PASS。

### Task 2：实现 STEP importer package

**文件：**

- 新建：`packages/step-importer/package.json`
- 新建：`packages/step-importer/tsconfig.json`
- 新建：`packages/step-importer/src/index.ts`
- 新建：`packages/step-importer/src/convertOcctResult.ts`
- 修改：`tsconfig.json`
- 修改：`package-lock.json`
- 新建：`tests/step/convertOcctResult.test.ts`

**接口：**

- 产出：`createStepImporter(): ICESourceImporter`
- 产出：`convertOcctResult(document, outputPath): Promise<ICEImportedGeometryStats>`
- 使用：`occt-import-js.ReadStepFile(bytes, params)`

- [ ] **步骤 1：编写失败测试**

```ts
test('maps OCCT hierarchy, meshes and colors into ICE3 source GLB', async () => {
  const output = join(root, 'source.glb');
  const stats = await convertOcctResult({
    success: true,
    root: {
      name: 'root',
      meshes: [],
      children: [{
        name: 'Pump A',
        meshes: [0],
        children: [],
      }],
    },
    meshes: [{
      name: 'Pump A Body',
      color: [0.2, 0.4, 0.6],
      attributes: {
        position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      },
      index: { array: [0, 1, 2] },
    }],
  }, output);

  expect(stats.triangleCount).toBe(1);
  const source = await readSource(output);
  expect(source.json.nodes).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Pump A' }),
    expect.objectContaining({ name: 'Pump A Body' }),
  ]));
});

test('rejects successful STEP results with no triangle geometry', async () => {
  await expect(convertOcctResult({
    success: true,
    root: { name: 'empty', meshes: [], children: [] },
    meshes: [],
  }, join(root, 'empty.glb'))).rejects.toThrow(
    'ICE3_TOOL_IMPORT_EMPTY_GEOMETRY',
  );
});
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/step/convertOcctResult.test.ts`

预期：FAIL，因为 STEP importer module 尚不存在。

- [ ] **步骤 3：增加私有 workspace package**

`@ice3/step-importer` 保持 `private: true`，只作为 `@ice3/toolchain` 的传递依赖。
运行：

```bash
npm install --workspace packages/step-importer \
  occt-import-js@0.0.23 @gltf-transform/core@4.5.1
```

- [ ] **步骤 4：实现 STEP 读取和转换**

`ReadStepFile()` 使用 `linearUnit: 'meter'` 和 bounded triangulation 参数。
OCCT mesh 写入 `@gltf-transform/core`，保留节点名称、层级、mesh 和颜色；输出采用
右手 y-up。`NodeIO.writeBinary()` 写入临时 source GLB。

- [ ] **步骤 5：实现稳定身份**

空名称使用 `step/node/<ordinal>`；重复名称追加稳定索引。不得按显示名称做设备
identity。输出 mesh 至少包含 POSITION 和 triangle indices。

- [ ] **步骤 6：运行 STEP converter 测试**

运行：`npm test -- tests/step/convertOcctResult.test.ts`

预期：PASS。

### Task 3：实现 `ice3-tool import`

**文件：**

- 修改：`packages/cli/src/commands.ts`
- 修改：`packages/cli/src/main.ts`
- 修改：`packages/cli/package.json`
- 修改：`packages/cli/tsconfig.json`
- 新建：`tests/cli/importCommand.test.ts`
- 修改：`docs/reference/cli.md`

**接口：**

- 消费：`ICEImporterRegistry.import()`
- 产出：`ice3-tool import SOURCE --output FILE --asset-id ID [--adapter step]`

- [ ] **步骤 1：编写 CLI 失败测试**

```ts
test('import publishes a validated Prepared GLB', async () => {
  const output = join(root, 'prepared.glb');
  const report = join(root, 'prepared.report.json');
  const code = await runCli([
    'import',
    'tests/fixtures/step/synthetic-skid.step',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-skid',
    '--json',
  ]);

  expect(code).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
  expect(JSON.parse(await readFile(report, 'utf8')).adapter.id)
    .toBe('step');
});

test('import does not publish output when an adapter fails', async () => {
  const output = join(root, 'missing.glb');
  const code = await runCli([
    'import',
    'tests/fixtures/step/truncated.step',
    '--output',
    output,
    '--asset-id',
    'broken',
  ]);

  expect(code).toBe(1);
  await expect(readFile(output)).rejects.toThrow();
});
```

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/cli/importCommand.test.ts`

预期：FAIL，因为 CLI 没有 `import` command。

- [ ] **步骤 3：实现临时 workspace**

Import command 使用 `mkdtemp()`；adapter 把 source GLB 写入该目录。完成后用现有
`readSource()`、`validateSource()`、`buildPreparedGLB()` 和 atomic write 发布 Prepared
GLB。`finally` 删除 workspace。

- [ ] **步骤 4：实现选项和 JSON output**

支持 `--adapter auto|step`、`--report`、`--budget`、`--warnings-as-errors` 和
`--json`。Report 顶层增加：

```json
{
  "adapter": {
    "id": "step",
    "sourceFormat": "step-ap242",
    "capabilities": {}
  }
}
```

- [ ] **步骤 5：更新 CLI help 与 package assembly**

`@ice3/toolchain` 发布包把 `@ice3/step-importer` bundle 进 CLI，external 化
`occt-import-js` 及其 wasm runtime。`@ice3/step-importer` 不单独发布。

- [ ] **步骤 6：运行 CLI 测试**

运行：`npm test -- tests/cli/importCommand.test.ts`

预期：PASS。

### Task 4：建立合成 STEP fixture 与端到端验证

**文件：**

- 新建：`tests/fixtures/step/synthetic-skid.step`
- 新建：`tests/fixtures/step/truncated.step`
- 新建：`tests/step/stepEndToEnd.test.ts`
- 新建：`tests/step/stepDeterminism.test.ts`

**接口：**

- 消费：公开 `import` command 和 STEP importer。
- 产出：可重复的 STEP-to-Prepared GLB 端到端证据。

- [ ] **步骤 1：创建完全合成的 fixture**

Fixture 包含两个命名 assembly component、两个实体、毫米单位和两种颜色。不得包含
真实设备、厂商或客户名称。

- [ ] **步骤 2：编写端到端测试**

验证 Prepared GLB 的 node、triangle、Bounds、颜色和 Selection fallback 均可读取；
`validatePreparedGLB()` 无 errors。

- [ ] **步骤 3：编写确定性测试**

连续 import 两次，比较 output bytes 和 report 中除目标路径外的内容完全一致。

- [ ] **步骤 4：验证错误路径**

断言空 Geometry、截断 STEP 和不匹配 adapter 都返回稳定错误码，且不发布输出。

- [ ] **步骤 5：运行 STEP suite**

运行：`npm test -- tests/step`

预期：PASS。

### Task 5：接入后续格式扩展点

**文件：**

- 修改：`packages/toolchain-core/src/import/types.ts`
- 修改：`packages/toolchain-core/src/import/createImporterRegistry.ts`
- 修改：`packages/toolchain-core/src/import/index.ts`
- 修改：`packages/toolchain-core/src/index.ts`
- 新建：`tests/import/extensionPlan.test.ts`

**接口：**

- 产出：未来 IFC、FBX、USD、OBJ、JT adapter 可注册的稳定 contract。

- [ ] **步骤 1：编写扩展注册测试**

用一个非 STEP fake adapter 注册 `.ifc`，断言 registry 能解析且不会加载 STEP dependency。

- [ ] **步骤 2：实现按需加载**

Registry 不直接导入任何具体 adapter；CLI 根据 adapter ID 动态加载对应模块。未安装
adapter 依赖时返回 `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE`，并给出安装提示。

- [ ] **步骤 3：运行 registry suite**

运行：`npm test -- tests/import`

预期：PASS。

### Task 6：文档、发布与完整验证

**文件：**

- 修改：`README.md`
- 修改：`docs/README.md`
- 修改：`docs/architecture.md`
- 修改：`docs/reference/cli.md`
- 修改：`THIRD_PARTY_NOTICES.md`
- 修改：`tests/architecture/layout.test.ts`

**接口：**

- 产出：可安装的 `@ice3/toolchain` STEP import 能力。
- 产出：完整且可审计的第三方依赖声明。

- [ ] **步骤 1：更新公开文档**

记录支持格式表、CLI 示例、STEP 能力等级、警告语义、失败码和发布边界。

- [ ] **步骤 2：更新第三方声明**

加入 `occt-import-js` 的 LGPL-2.1 归属、wasm runtime 文件和获取源的方式。

- [ ] **步骤 3：更新发布检查**

在 `scripts/check-release-package.mjs` 中安装 tarball 后执行：

```bash
ice3-tool import tests/fixtures/step/synthetic-skid.step \
  --output /tmp/synthetic-skid.glb \
  --asset-id synthetic-skid
```

同时确认 tarball 包含 adapter code、wasm dependency 声明和第三方声明。

- [ ] **步骤 4：运行完整门禁**

```bash
nvm use
npm run docs:check
npm run typecheck
npm test
npm run test:architecture
npm run release:check
npm run verify
```

- [ ] **步骤 5：合并**

在 `feat/source-import-adapters` 完成全部验证后提交，并以 `--no-ff` 合入 `main`。
确认 Git author/committer 均为
`damoqiongqiu <damoqiongqiu@126.com>`。
