# FBX Source Importer 实施计划

> Document ID: ICE3-TOOL-PLAN-004
>
> Status: Implemented
>
> Owner: ICE3 Toolchain maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [x]`) syntax for tracking.

**目标：** 通过固定版本 Blender headless bridge 将 ASCII/Binary FBX 转换为标准 source
GLB，并接入现有 Prepared GLB、partition、LOD、Tileset 和发布流程。

**架构：** Node adapter 启动白名单 Blender Python 脚本，把 FBX 导入临时 Scene 并导出 raw
GLB；TypeScript canonicalizer 再执行支持范围裁剪、Selection、metadata、实例和确定性
规范化。Blender binary、Python 和 FBX parser 不进入 npm runtime 或 Browser bundle。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、Blender 5.2.3、
`@gltf-transform/core` 4.5.1、Node test、esbuild 和现有 npm workspace。

**规格：** [FBX Source Importer 规格](../specs/2026-10-29-fbx-importer.md)

## 全局约束

- Runtime 只接受 Prepared GLB 和受支持的本地 Tileset。
- Blender 是可选外部构建依赖，不进入 npm dependency 或发布 tarball。
- Blender 版本固定为 `5.2.3`，缺失或版本不符不得回退。
- 只执行仓库内白名单 bridge 脚本，不执行用户 Python、shell 或表达式。
- Bridge 使用 headless 模式、独立临时目录和 120 秒 timeout。
- 只支持当前 Blender 能稳定读取的 ASCII/Binary FBX。
- 不支持 animation、skin、morph、camera、light、复杂 PBR 或 Blender node tree。
- 输出统一为米、right-handed y-up。
- 不根据对象名称猜测设备身份或业务连接。
- 不提交客户 FBX、派生 GLB、路径、截图或缩略图。
- Node.js 固定为 `24.22.1`，Git author 和 committer 为 `damoqiongqiu`。
- 每项行为先写失败测试，完整 suite 通过后才能合入 `main`。

## 审查重点

- Blender 进程超时或崩溃：必须终止并清理 raw GLB/report，不留下 output。
- 共享 mesh data：多个 FBX object 必须复用 glTF mesh，同时保留独立 node 和 Selection。
- Custom properties：循环、二进制、复杂 nested value 必须确定性省略并 warning。
- 大型世界坐标：所有节点共享一次 local origin 平移，保持 float32 相对精度。
- Blender 重新命名或导出对象顺序变化：Selection ID 仍必须基于 canonical node ordinal，
  不能漂移。

---

### Task 1：建立 Blender runtime 与 bridge 调用协议

**文件：**

- 新建：`packages/fbx-importer/package.json`
- 新建：`packages/fbx-importer/tsconfig.json`
- 新建：`packages/fbx-importer/src/types.ts`
- 新建：`packages/fbx-importer/src/blenderRuntime.ts`
- 新建：`packages/fbx-importer/src/runBridge.ts`
- 新建：`packages/fbx-importer/src/index.ts`
- 新建：`tests/fbx/blenderRuntime.test.ts`
- 新建：`tests/fbx/runBridge.test.ts`
- 修改：`tsconfig.json`
- 修改：`package-lock.json`

**接口：**

```ts
interface IFbxBridgeRequest {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly reportPath: string;
}

interface IFbxBridgeReport {
  readonly success: true;
  readonly blenderVersion: string;
  readonly objects: readonly IFbxBridgeObject[];
}

interface IFbxBridgeObject {
  readonly name: string;
  readonly objectType: 'MESH' | 'EMPTY';
  readonly parentName?: string;
  readonly meshData?: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly customProperties: Record<string, unknown>;
}

interface IFbxBridgeOptions {
  readonly blenderBinary: string;
  readonly scriptPath: string;
  readonly timeoutMs?: number;
  readonly runner?: IFbxBridgeRunner;
}

async function runFbxBridge(
  request: IFbxBridgeRequest,
  options: IFbxBridgeOptions,
): Promise<IFbxBridgeReport>;
```

- [x] **步骤 1：编写 runtime 与 bridge 失败测试**

```ts
test('accepts the pinned Blender version', () => {
  expect(parseBlenderVersion('Blender 5.2.3 LTS')).toEqual({
    version: '5.2.3',
    major: 5,
    minor: 2,
    patch: 3,
  });
  expect(() => assertBlenderVersion('5.2.2')).toThrow(
    'ICE3_TOOL_FBX_BLENDER_VERSION_INVALID',
  );
});

test('passes paths as separate arguments and reads a private report', async () => {
  const calls: string[][] = [];
  const report = await runFbxBridge({
    inputPath: '/tmp/source.fbx',
    outputPath: '/tmp/raw.glb',
    reportPath: '/tmp/report.json',
  }, {
    blenderBinary: '/tmp/Blender',
    scriptPath: '/repo/fbx-to-glb.py',
    runner: async (args) => {
      calls.push(args);
      await writeFile('/tmp/report.json', JSON.stringify({
        success: true,
        blenderVersion: '5.2.3',
        objects: [],
      }));
      return { code: 0, stdout: '', stderr: '' };
    },
  });
  expect(calls[0]).toContain('/tmp/source.fbx');
  expect(calls[0]).not.toContain('user expression');
  expect(report.blenderVersion).toBe('5.2.3');
});
```

- [x] **步骤 2：确认测试失败**

运行：

```bash
npm test -- tests/fbx/blenderRuntime.test.ts tests/fbx/runBridge.test.ts
```

预期：FAIL，module 尚不存在。

- [x] **步骤 3：增加私有 workspace package**

`package.json` 固定：

```json
{
  "name": "@ice3/fbx-importer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@gltf-transform/core": "4.5.1",
    "@ice3/toolchain-core": "0.0.0"
  }
}
```

运行：

```bash
npm install --workspace packages/fbx-importer \
  @gltf-transform/core@4.5.1
```

- [x] **步骤 4：实现 executable 与版本检查**

`resolveBlenderBinary()`：

- 优先 `BLENDER_BIN`。
- 其次显式传入 path。
- macOS 本地默认 `/Applications/Blender.app/Contents/MacOS/Blender`。
- 其他平台未配置时返回 unavailable。

`assertSupportedBlender(binary)` 调用 `--version`，精确匹配 `5.2.3`。

- [x] **步骤 5：实现 bridge process runner**

默认 runner 使用 `node:child_process.spawn`，收集有界 stdout/stderr，不直接输出。

Blender 参数：

```ts
[
  '--background',
  '--factory-startup',
  '--python-exit-code',
  '1',
  '--python',
  options.scriptPath,
  '--',
  '--input',
  request.inputPath,
  '--output',
  request.outputPath,
  '--report',
  request.reportPath,
]
```

timeout 默认 `120_000`；超时发送 SIGTERM，短暂等待后 SIGKILL，并返回
`ICE3_TOOL_FBX_TIMEOUT`。

- [x] **步骤 6：验证 report 与 output**

- exit code 非零返回 `ICE3_TOOL_FBX_IMPORT_FAILED`。
- report 不存在、JSON 无效或 `success !== true` 时返回稳定错误。
- report 的 `blenderVersion` 必须为 `5.2.3`。
- raw GLB 必须存在且大于 20 bytes。
- stdout/stderr、绝对路径和 Blender stack trace不进入最终 Diagnostic。

- [x] **步骤 7：运行测试**

```bash
npm test -- tests/fbx/blenderRuntime.test.ts tests/fbx/runBridge.test.ts
```

预期：PASS。

- [x] **步骤 8：提交**

```bash
git add packages/fbx-importer tests/fbx/blenderRuntime.test.ts tests/fbx/runBridge.test.ts \
  tsconfig.json package-lock.json
git commit -m "feat(toolchain): add FBX Blender bridge runner"
```

---

### Task 2：创建真正独立的 FBX bridge 脚本

**文件：**

- 新建：`packages/fbx-importer/scripts/fbx-to-glb.py`
- 新建：`tests/fbx/bridgeScript.test.ts`

**接口：**

- CLI 参数：`--input FILE --output FILE --report FILE`
- Report：与 Task 1 的 `IFbxBridgeReport` 一致，额外允许失败对象：

```json
{
  "success": false,
  "code": "ICE3_TOOL_FBX_IMPORT_FAILED"
}
```

- [x] **步骤 1：编写 bridge 失败测试**

```ts
test('bridge writes a report for an import failure', async () => {
  const result = await runToolchainBridge(
    'tests/fixtures/fbx/truncated.fbx',
    root,
  );
  expect(result.status).not.toBe(0);
  const report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8'));
  expect(report).toEqual({
    success: false,
    code: 'ICE3_TOOL_FBX_IMPORT_FAILED',
  });
  await expect(readFile(join(root, 'raw.glb'))).rejects.toThrow();
});
```

- [x] **步骤 2：确认测试失败**

```bash
npm test -- tests/fbx/bridgeScript.test.ts
```

预期：FAIL，script/fixture 尚不存在。

- [x] **步骤 3：实现参数解析与 scene reset**

脚本只使用 `argparse` 读取三个路径。启动后：

```python
bpy.ops.wm.read_factory_settings(use_empty=True)
```

不加载用户 startup file、add-on 或工作区外资源。

- [x] **步骤 4：固定 FBX import 参数**

```python
bpy.ops.import_scene.fbx(
    filepath=input_path,
    use_manual_orientation=False,
    global_scale=1.0,
    bake_space_transform=False,
    use_custom_normals=True,
    use_image_search=False,
    use_alpha_decals=False,
    use_anim=False,
    use_subsurf=False,
    use_custom_props=True,
    use_custom_props_enum_as_string=True,
    ignore_leaf_bones=True,
    force_connect_children=False,
    automatic_bone_orientation=False,
    use_prepost_rot=True,
)
```

- [x] **步骤 5：删除不支持对象并生成 report**

只保留 `MESH` 和 `EMPTY`。

按 object name 排序。Report 记录：

- 名称。
- 类型。
- parent name。
- mesh data name。
- vertex/triangle count。
- JSON-safe custom properties，最大 depth 8、最大 array 256。

Report 不记录 input/output absolute path。

- [x] **步骤 6：固定 glTF export 参数**

```python
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
    export_normals=True,
    export_texcoords=False,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_skins=False,
    export_morph=False,
    export_extras=True,
    export_gpu_instances=False,
)
```

- [x] **步骤 7：原子写 report 和错误映射**

- 先写同目录 temp file，再 `os.replace()`。
- 成功时才允许报告 `success: true`。
- 捕获异常后删除部分 raw GLB，写稳定错误 report，进程非零退出。
- 不把 exception traceback 写入 report。

- [x] **步骤 8：运行 script 失败测试**

```bash
npm test -- tests/fbx/bridgeScript.test.ts
```

预期：PASS；失败 report 稳定，raw GLB 不存在。

- [x] **步骤 9：提交**

```bash
git add packages/fbx-importer/scripts/fbx-to-glb.py \
  tests/fbx/bridgeScript.test.ts
git commit -m "feat(toolchain): add controlled FBX bridge"
```

---

### Task 3：建立合成 ASCII/Binary FBX fixture

**文件：**

- 新建：`tests/fixtures/fbx/generate-synthetic-fbx.py`
- 新建：`tests/fixtures/fbx/synthetic-binary.fbx`
- 新建：`tests/fixtures/fbx/synthetic-ascii.fbx`
- 新建：`tests/fixtures/fbx/empty.fbx`
- 新建：`tests/fixtures/fbx/truncated.fbx`
- 新建：`tests/fbx/fixture.test.ts`

**接口：**

- 产出：不含客户信息的 synthetic FBX，供 bridge、adapter、CLI 和 release 测试复用。

- [x] **步骤 1：编写 fixture 失败测试**

```ts
test('fixtures contain binary and ASCII FBX', async () => {
  const binary = await readFile('tests/fixtures/fbx/synthetic-binary.fbx');
  const ascii = await readFile('tests/fixtures/fbx/synthetic-ascii.fbx', 'utf8');
  expect(binary.subarray(0, 18).toString('ascii')).toContain('Kaydara FBX Binary');
  expect(ascii).toContain('FBXHeaderExtension');
  expect(`${binary.toString('latin1')}${ascii}`).not.toContain('customer');
});
```

- [x] **步骤 2：确认测试失败**

```bash
npm test -- tests/fbx/fixture.test.ts
```

预期：FAIL，fixtures 尚不存在。

- [x] **步骤 3：生成 Binary fixture**

Blender generator 创建：

- `Root`
- `TreatmentLine`
- `Equipment`
- `Primary Pump`
- `Buffer Tank`
- 两个 linked duplicate object，共用同一 mesh data。
- 三种基础颜色。
- `EquipmentTag`、`DesignFlow` 和 `BusinessArea` custom properties。

导出时使用：

```python
bpy.ops.export_scene.fbx(
    filepath=output_path,
    use_selection=False,
    object_types={'EMPTY', 'MESH'},
    use_custom_props=True,
    use_triangles=True,
    axis_forward='-Z',
    axis_up='Y',
    bake_anim=False,
)
```

- [x] **步骤 4：创建 ASCII fixture**

ASCII fixture 是独立编写的最小合法 FBX 7.4 文档，包含：

- `FBXHeaderExtension`
- `GlobalSettings`
- `Definitions`
- 一个 `Geometry`
- 一个 `Model`
- 一个 triangle
- `Connections`

不得从第三方测试包复制。Blender importer 必须成功读取。

- [x] **步骤 5：创建空与截断 fixture**

- `empty.fbx` 只包含合法 `Root` empty，不含 Geometry。
- `truncated.fbx` 在 Binary fixture 的 Objects section 中间截断。

- [x] **步骤 6：运行 fixture 与 parser smoke test**

```bash
npm test -- tests/fbx/fixture.test.ts
```

预期：PASS，ASCII/Binary 都能被固定 Blender 读取。

- [x] **步骤 7：提交**

```bash
git add tests/fixtures/fbx tests/fbx/fixture.test.ts
git commit -m "test(toolchain): add synthetic FBX fixtures"
```

---

### Task 4：实现 FBX canonicalizer 与实例语义

**文件：**

- 新建：`packages/fbx-importer/src/canonicalizeFbxGlb.ts`
- 新建：`packages/fbx-importer/src/mergeBridgeReport.ts`
- 新建：`tests/fbx/canonicalizeFbxGlb.test.ts`

**接口：**

```ts
interface IFbxCanonicalizeOptions {
  readonly assetId: string;
  readonly bridgeReport: IFbxBridgeReport;
}

interface IFbxSourceStats {
  readonly outputPath: string;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly instanceNodeCount: number;
  readonly sourceOrigin: readonly [number, number, number];
  readonly warnings: readonly string[];
}

async function canonicalizeFbxGlb(
  rawGlbPath: string,
  outputPath: string,
  options: IFbxCanonicalizeOptions,
): Promise<IFbxSourceStats>;
```

- [x] **步骤 1：编写 canonicalizer 失败测试**

```ts
test('canonicalizes FBX hierarchy, instances and custom properties', async () => {
  const stats = await importFixtureSource();
  expect(stats.instanceNodeCount).toBe(1);
  expect(stats.triangleCount).toBeGreaterThan(0);

  const source = await readSource(stats.outputPath);
  expect(source.json.nodes?.map((node) => node.name))
    .toEqual(expect.arrayContaining([
      'TreatmentLine',
      'Equipment',
      'Primary Pump',
      'Buffer Tank',
    ]));
  const pump = source.json.nodes?.find((node) => node.name === 'Primary Pump');
  expect(pump?.extras?.ice3?.fbx?.customProperties)
    .toMatchObject({ EquipmentTag: 'P-101' });
});
```

- [x] **步骤 2：确认测试失败**

```bash
npm test -- tests/fbx/canonicalizeFbxGlb.test.ts
```

预期：FAIL，module 尚不存在。

- [x] **步骤 3：清理 raw GLB**

使用 `@gltf-transform/core` `NodeIO`：

- 删除 animation、skin、camera、texture、image。
- 删除未使用资源。
- 材质 metallic 设为 `0`，roughness 设为 `1`。
- 保留场景 hierarchy、mesh 和 display color。

- [x] **步骤 4：合并 bridge report**

按 node name 与 report object name 匹配。匹配失败时：

- 保留 node。
- 写入 `fbx.unmatchedObject: true` warning。
- 不根据 parent 猜测对象身份。

为每个 node 写：

```ts
extras.ice3 = {
  selectionId: `${assetId}/fbx/node/${ordinal}`,
  displayName: node.name,
  fbx: {
    objectType: reportObject.objectType,
    meshData: reportObject.meshData,
    instanceGroup: instanceGroupFor(reportObject.meshData),
    customProperties: safeProperties(reportObject.customProperties),
  },
};
```

- [x] **步骤 5：保证 shared mesh instance**

根据 bridge report 的 `meshData`：

- 同一 mesh data 的 nodes 必须共享同一个 glTF mesh。
- 如果 raw GLB 已共享 mesh，只验证。
- 如果 raw GLB 复制 mesh，canonicalizer 按 accessor bytes/material 重新关联到首个 mesh。
- 无法安全复用时保留独立 mesh并 warning，`instanceNodeCount` 不虚报。

- [x] **步骤 6：建立 local origin**

计算全部 world-space position bounds，统一平移 x/z 到局部原点；y 保留模型高度。

```ts
const sourceOrigin = [bounds.min[0], 0, bounds.min[2]];
```

所有 node 使用同一个 origin，不逐 node 选择。

- [x] **步骤 7：确定性写 GLB**

稳定 node、mesh、material 和 accessor 顺序。`NodeIO.write` 到 output path。相同 raw
semantic content、report 和 options 必须产生 byte-identical source GLB。

- [x] **步骤 8：运行测试**

```bash
npm test -- tests/fbx/canonicalizeFbxGlb.test.ts
```

预期：PASS，instance group、custom property 和 hierarchy 正确。

- [x] **步骤 9：提交**

```bash
git add packages/fbx-importer/src tests/fbx/canonicalizeFbxGlb.test.ts
git commit -m "feat(toolchain): canonicalize FBX source GLB"
```

---

### Task 5：接入 FBX importer、CLI 和 partition

**文件：**

- 修改：`packages/fbx-importer/src/index.ts`
- 修改：`packages/cli/src/commands.ts`
- 修改：`packages/cli/package.json`
- 修改：`packages/cli/tsconfig.json`
- 新建：`tests/cli/fbxImportCommand.test.ts`
- 新建：`tests/fbx/fbxImporter.test.ts`

**接口：**

- 产出：`createFbxImporter(): ICESourceImporter`
- CLI：`import SOURCE.fbx --output FILE --asset-id ID`
- Partition：直接接受 `.fbx`

- [x] **步骤 1：编写 importer/CLI 失败测试**

```ts
test('imports FBX through the controlled Blender bridge', async () => {
  const code = await runCli([
    'import',
    'tests/fixtures/fbx/synthetic-binary.fbx',
    '--output',
    output,
    '--asset-id',
    'synthetic-fbx',
    '--adapter',
    'fbx',
    '--json',
  ]);
  expect(code).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
});
```

- [x] **步骤 2：确认测试失败**

```bash
npm test -- tests/cli/fbxImportCommand.test.ts tests/fbx/fbxImporter.test.ts
```

预期：FAIL，adapter/CLI 尚未接入。

- [x] **步骤 3：实现 importer orchestration**

`createFbxImporter().import(input, context)`：

1. resolve 并验证 Blender。
2. 在 CLI 提供的 temp workspace 创建 raw/report path。
3. 调 `runFbxBridge()`。
4. 调 `canonicalizeFbxGlb()`。
5. 返回 `adapterId: 'fbx'`、`sourceFormat: 'fbx'` 和 warnings。

任何异常均清理 raw GLB 和 report。

- [x] **步骤 4：扩展 CLI dynamic loader**

`loadSourceImporters()` 支持：

- `auto|step`
- `auto|ifc`
- `auto|fbx`

`auto` 加载已实现的全部 adapter。显式 fbx 失败时返回
`ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE` 或更具体的 `ICE3_TOOL_FBX_*`。

- [x] **步骤 5：扩展 partition source import**

现有 `readPartitionSource()` 对非 glTF 调用 `loadSourceImporters('auto')`。确认
`.fbx` 使用相同路径，不增加第二套临时目录逻辑。

- [x] **步骤 6：验证 public package asset**

公开 package 的 esbuild 将 FBX TypeScript adapter 打包进 `main.js`，并把
`fbx-to-glb.py` 复制到 `dist/fbx/`。Blender binary 不进入 tarball。

- [x] **步骤 7：运行 CLI 测试**

```bash
npm test -- tests/cli/fbxImportCommand.test.ts tests/fbx/fbxImporter.test.ts
```

预期：PASS。

- [x] **步骤 8：提交**

```bash
git add packages/fbx-importer packages/cli tests/cli/fbxImportCommand.test.ts \
  tests/fbx/fbxImporter.test.ts
git commit -m "feat(toolchain): expose FBX import command"
```

---

### Task 6：覆盖 Blender 失败、实例和确定性

**文件：**

- 新建：`tests/fbx/fbxFailures.test.ts`
- 新建：`tests/fbx/fbxDeterminism.test.ts`
- 新建：`tests/fbx/fbxPipeline.test.ts`
- 修改：`tests/fbx/canonicalizeFbxGlb.test.ts`

**接口：**

- 消费：公开 import/partition command。
- 产出：稳定失败、实例、batching metadata 和 byte determinism 证据。

- [x] **步骤 1：编写失败测试**

```ts
test('reports Blender unavailable without publishing output', async () => {
  const error = await runImportFailure(binaryFixture, {
    BLENDER_BIN: '/tmp/missing-blender',
  });
  expect(error).toContain('ICE3_TOOL_FBX_BLENDER_UNAVAILABLE');
  await expect(access(output)).rejects.toThrow();
});

test('reports bridge timeout without publishing output', async () => {
  const error = await runImportFailure(binaryFixture, {
    ICE3_FBX_TIMEOUT_MS: '1',
  });
  expect(error).toContain('ICE3_TOOL_FBX_TIMEOUT');
  await expect(access(output)).rejects.toThrow();
});
```

- [x] **步骤 2：确认测试失败**

```bash
npm test -- tests/fbx/fbxFailures.test.ts
```

预期：FAIL，稳定错误和测试注入尚不存在。

- [x] **步骤 3：实现可测试的环境边界**

- `BLENDER_BIN`
- `ICE3_FBX_TIMEOUT_MS`

只允许这两项 adapter option，不允许任意 Blender CLI 参数透传。

- [x] **步骤 4：覆盖损坏与空 Geometry**

Assertions：

- `truncated.fbx` → `ICE3_TOOL_FBX_IMPORT_FAILED`
- `empty.fbx` → `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY`
- Blender version mismatch → `ICE3_TOOL_FBX_BLENDER_VERSION_INVALID`
- 失败时 raw GLB、report 和 final output 均不存在

- [x] **步骤 5：编写 determinism test**

```ts
test('repeated FBX imports are byte-identical', async () => {
  const first = await importFbx(root, 'first');
  const second = await importFbx(root, 'second');
  expect(await readFile(first.output)).toEqual(await readFile(second.output));
  expect(JSON.parse(await readFile(first.report, 'utf8')))
    .toEqual(JSON.parse(await readFile(second.report, 'utf8')));
});
```

- [x] **步骤 6：验证 partition 与 batching metadata**

直接对 Binary FBX 执行：

```bash
ice3-tool partition synthetic-binary.fbx \
  --output tiles \
  --asset-id synthetic-fbx \
  --max-triangles 1 \
  --render-batch static
```

分片 node 必须继续包含 `extras.ice3.fbx.customProperties`、Selection ID 和 instanceGroup。

- [x] **步骤 7：运行 FBX suite**

```bash
npm test -- tests/fbx tests/cli/fbxImportCommand.test.ts
```

预期：PASS。

- [x] **步骤 8：提交**

```bash
git add tests/fbx tests/cli/fbxImportCommand.test.ts packages/fbx-importer
git commit -m "test(toolchain): verify FBX import boundaries"
```

---

### Task 7：完成文档、发布和完整门禁

**文件：**

- 修改：`README.md`
- 修改：`docs/README.md`
- 修改：`docs/architecture.md`
- 修改：`docs/reference/cli.md`
- 修改：`docs/plans/2026-10-29-fbx-importer.md`
- 修改：`packages/cli/README.md`
- 修改：`scripts/build-release-package.mjs`
- 修改：`scripts/check-release-package.mjs`
- 修改：`tests/architecture/layout.test.ts`
- 修改：`tests/release/package.test.ts`

**接口：**

- 产出：公开 FBX 支持说明、Blender 外部依赖说明和发布验证记录。

- [x] **步骤 1：更新公开文档**

记录：

- `.fbx` ASCII/Binary 支持。
- Blender 5.2.3 是可选系统依赖。
- `BLENDER_BIN` 和 `ICE3_FBX_TIMEOUT_MS`。
- 支持和不支持的对象、材质与 metadata。
- 稳定 Diagnostic。
- Import/partition 使用示例。
- 安全边界：只运行白名单 bridge。

- [x] **步骤 2：更新发布 package**

- bundle FBX TypeScript adapter。
- 复制 `fbx-to-glb.py` 到 `dist/fbx/`。
- 不把 Blender binary 放入 tarball。
- 发布 tarball 安装后，在 Blender 可用环境执行 Binary FBX import 和 Prepared validation。

- [x] **步骤 3：更新架构检查**

断言：

- `packages/fbx-importer` 为私有 workspace。
- npm dependency 不存在 Blender package/binary。
- bridge script存在并在发布文件列表中。
- Engine/workspace 不引用 FBX adapter。

- [x] **步骤 4：运行完整门禁**

```bash
nvm use
npm run docs:check
npm run typecheck
npm test
npm run test:architecture
npm run release:check
npm run verify
```

- [x] **步骤 5：整分支审查**

重点检查：

- process timeout、stderr 有界和资源清理。
- shared-mesh instance 是否真实复用。
- custom property 深度/数组限制。
- Blender raw output 到 canonical output 的 metadata 是否保留。
- 大型坐标 local origin。
- partition 和 batching 后 FBX metadata。

- [x] **步骤 6：提交并合并**

确认 Git author/committer 为：

```text
damoqiongqiu <damoqiongqiu@126.com>
```

完整门禁通过后：

```bash
git merge --no-ff feat/fbx-importer
```

合入 `main` 后重新运行 `npm run verify` 和 `npm run release:check`，再删除功能分支。
