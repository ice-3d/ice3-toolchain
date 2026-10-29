# IFC 4.3 Source Importer 实施计划

> Document ID: ICE3-TOOL-PLAN-003
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**目标：** 为 `ice3-tool import` 增加 IFC 4.3 adapter，生成保留空间层级、产品身份、
属性集和系统的 validated Prepared GLB。

**架构：** 私有 `@ice3/ifc-importer` 在 Node process 内使用固定版本的 IFC parser，把 IFC
转换为标准 source GLB。现有 Registry、Prepared GLB builder、Partition、LOD 和 Runtime
contract 保持不变；IFC parser 与 WASM 不进入 Browser Runtime。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、`web-ifc` 0.0.78、
`@gltf-transform/core` 4.5.1、Node test、esbuild 和现有 npm workspace。

**规格：** [IFC 4.3 Source Importer 规格](../specs/2026-10-29-ifc-4-3-importer.md)

## 全局约束

- Runtime 只接受 Prepared GLB 和受支持的本地 Tileset。
- 只接受 IFC4X3 系列 schema；拒绝 IFC2X3、IFC4 和不兼容 schema alias。
- IFC parser 只存在于私有 `@ice3/ifc-importer`，不得进入 Engine 或 Browser bundle。
- 输出单位为米，坐标为 right-handed y-up。
- 不执行任意 Python、shell、外部转换器或网络请求。
- 不根据名称猜测设备 tag、端口、介质、流向或流程连接。
- 成功输出是 Prepared GLB；临时 source GLB、model handle 和 WASM Geometry 必须清理。
- 失败时不得发布部分 output。
- 自动测试只使用完全合成的 IFC fixture。
- Node.js 固定为 `24.22.1`，Git author 和 committer 为 `damoqiongqiu`。
- 每项行为先写失败测试，完整 suite 通过后才能合入 `main`。

## 审查重点

- 大型 georeferenced IFC：所有节点必须共享一次 document-local origin 平移，保持相对
  位置并在 float32 下保持可分辨精度。
- 有 Geometry 但不在 spatial tree 的产品：必须创建稳定 fallback node 并 warning，不
  得静默丢失。
- 复杂 Property Set：不可序列化值不得进入 GLB JSON；必须确定性省略并 warning。
- GlobalId 缺失或重复：必须生成 collision-free Selection ID，不能按名称伪造设备身份。
- 多 placed geometry、matrix 与颜色组合：triangle、Bounds、material 和相对位置必须
  同时正确。

---

### Task 1：让 Prepared GLB 保留 IFC metadata

**文件：**

- 修改：`packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 修改：`tests/output/buildPreparedGLB.test.ts`

**接口：**

- 消费：source node `extras.ice3.ifc`。
- 产出：Prepared node 中同名 `extras.ice3.ifc` 的 JSON-compatible metadata。

- [ ] **步骤 1：编写 metadata 保留失败测试**

在现有 `preserves equipment business metadata for prepared nodes` 后增加测试：

```ts
test('preserves explicit IFC source metadata for prepared nodes', () => {
  const source = createPreparedSource();
  const nodes = source.json.nodes as Array<Record<string, unknown>>;
  nodes[0] = {
    ...nodes[0],
    extras: {
      ice3: {
        id: 'ifc-demo/source/0',
        selectionId: 'ifc-demo/ifc/2O2Fr$t4X7Zf8NOew3FLKr',
        ifc: {
          schema: 'IFC4X3',
          expressId: 42,
          ifcType: 'IFCPUMP',
          globalId: '2O2Fr$t4X7Zf8NOew3FLKr',
          propertySets: [{
            name: 'Pset_PumpTypeCommon',
            properties: { FlowRate: 12.5 },
          }],
          systems: [{
            globalId: '1AbC...',
            name: 'Sludge Transfer',
            ifcType: 'IFCDISTRIBUTIONSYSTEM',
          }],
        },
      },
    },
  };

  const document = readDocument(buildPreparedGLB(source, {
    assetId: 'ifc-demo',
    edges: false,
  }).bytes);

  expect(document.nodes[0]!.extras.ice3.ifc).toEqual(
    nodes[0]!.extras.ice3.ifc,
  );
});
```

- [ ] **步骤 2：确认测试失败**

运行：

```bash
npm test -- tests/output/buildPreparedGLB.test.ts
```

预期：FAIL，Prepared node 的 `extras.ice3.ifc` 为 `undefined`。

- [ ] **步骤 3：增加最小 metadata passthrough**

在 `buildPreparedGLB.ts` 的 `outputNodes` mapping 中，从 source semantic 读取：

```ts
const ifcMetadata = record(semantic?.ifc);
```

在 business metadata 后增加：

```ts
...(ifcMetadata ? { ifc: ifcMetadata } : {}),
```

不得复制 `expressId` 到 selection ID，也不得让 passthrough 覆盖现有
`selectionId`、`equipmentTag` 或 process metadata。

- [ ] **步骤 4：运行测试**

运行：

```bash
npm test -- tests/output/buildPreparedGLB.test.ts
```

预期：PASS，现有 metadata 测试继续通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/output/buildPreparedGLB.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): preserve IFC node metadata"
```

---

### Task 2：创建 IFC importer package 与合成 fixture

**文件：**

- 新建：`packages/ifc-importer/package.json`
- 新建：`packages/ifc-importer/tsconfig.json`
- 新建：`packages/ifc-importer/src/index.ts`
- 新建：`packages/ifc-importer/src/ifcApi.ts`
- 新建：`tests/fixtures/ifc/generate-synthetic-plant.py`
- 新建：`tests/fixtures/ifc/synthetic-plant.ifc`
- 新建：`tests/fixtures/ifc/unsupported-unit.ifc`
- 新建：`tests/ifc/ifcParser.test.ts`
- 修改：`tsconfig.json`
- 修改：`package-lock.json`

**接口：**

- 产出：`createIfcImporter(): ICESourceImporter`
- 产出：`createIfcApi(): Promise<IfcAPI>`
- 产出：`openIfcDocument(api, path): Promise<IIfcOpenDocument>`

```ts
interface IIfcOpenDocument {
  readonly api: IfcAPI;
  readonly modelID: number;
  readonly schema: string;
  readonly sourceBytes: Uint8Array;
}
```

- [ ] **步骤 1：编写 parser 失败测试**

```ts
test('opens the synthetic IFC4X3 fixture', async () => {
  const constructor = createIfcImporter();
  expect(constructor.id).toBe('ifc');
  expect(constructor.extensions).toEqual(['.ifc']);
  expect(constructor.capabilities).toEqual({
    hierarchy: true,
    vertexColors: false,
    materialColors: true,
    instances: false,
    semanticMetadata: true,
  });

  const api = await createIfcApi();
  const document = await openIfcDocument(
    api,
    'tests/fixtures/ifc/synthetic-plant.ifc',
  );
  try {
    expect(document.schema).toMatch(/^IFC4X3/);
    expect(document.api.GetMaxExpressID(document.modelID)).toBeGreaterThan(0);
  } finally {
    document.api.CloseModel(document.modelID);
    document.api.Dispose();
  }
});

test('rejects a length unit that cannot be normalized to meters', async () => {
  const api = await createIfcApi();
  try {
    await expect(openIfcDocument(
      api,
      'tests/fixtures/ifc/unsupported-unit.ifc',
    )).rejects.toThrow('ICE3_TOOL_IFC_UNIT_UNSUPPORTED');
  } finally {
    api.Dispose();
  }
});
```

- [ ] **步骤 2：确认测试失败**

运行：

```bash
npm test -- tests/ifc/ifcParser.test.ts
```

预期：FAIL，module 尚不存在。

- [ ] **步骤 3：增加私有 workspace package**

`package.json` 固定依赖：

```json
{
  "name": "@ice3/ifc-importer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@gltf-transform/core": "4.5.1",
    "@ice3/toolchain-core": "0.0.0",
    "web-ifc": "0.0.78"
  }
}
```

运行：

```bash
npm install --workspace packages/ifc-importer \
  web-ifc@0.0.78 @gltf-transform/core@4.5.1
```

- [ ] **步骤 4：实现 parser facade**

`createIfcApi()`：

```ts
const api = new IfcAPI();
api.SetLogLevel(LogLevel.LOG_LEVEL_ERROR);
await api.Init();
return api;
```

`openIfcDocument()`：

```ts
const sourceBytes = await readFile(path);
const modelID = api.OpenModel(new Uint8Array(sourceBytes), {
  ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: false,
  COORDINATE_TO_ORIGIN: false,
  MEMORY_LIMIT: 512 * 1024 * 1024,
});
if (modelID < 0) throw new Error('ICE3_TOOL_IFC_IMPORT_FAILED');
const schema = api.GetModelSchema(modelID);
if (!/^IFC4X3(?:[_-]|$)/u.test(schema)) {
  api.CloseModel(modelID);
  throw new Error(`ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED: ${schema}`);
}
```

`validateIfcLengthUnit(api, modelID)` 扫描 `IFCSIUNIT` 和
`IFCCONVERSIONBASEDUNIT` 的 length unit。接受可精确归一到米的 SI/metre 单位和具有
metre conversion factor 的 conversion-based unit；没有 length unit、未知 prefix、
未知 conversion 或存在冲突单位时返回 `ICE3_TOOL_IFC_UNIT_UNSUPPORTED`。

- [ ] **步骤 5：生成完全合成的 IFC4X3 fixture**

Fixture generator 使用开发环境提供的 IFC authoring API，但生成器不进入 runtime 或
npm package。Fixture 必须包含：

- 一个 Project、Site、Building、Storey。
- 一个 `IfcPump` 和一个 `IfcTank`。
- 每个产品一个 extruded solid representation。
- 两种明显不同的 display color。
- `Pset_PumpTypeCommon`、`Pset_TankTypeCommon`。
- `Qto_PumpBaseQuantities`。
- 一个 `IfcDistributionSystem`，两个产品都是 members。

生成后，fixture 通过 parser smoke test。生成器不得读取用户文件或网络。

- [ ] **步骤 6：运行测试**

运行：

```bash
npm test -- tests/ifc/ifcParser.test.ts
```

预期：PASS，fixture schema 为 IFC4X3。

- [ ] **步骤 7：提交**

```bash
git add packages/ifc-importer tests/fixtures/ifc tests/ifc/ifcParser.test.ts \
  tsconfig.json package-lock.json
git commit -m "feat(toolchain): add IFC parser foundation"
```

---

### Task 3：提取空间、产品、属性和系统语义

**文件：**

- 新建：`packages/ifc-importer/src/types.ts`
- 新建：`packages/ifc-importer/src/readIfcMetadata.ts`
- 新建：`packages/ifc-importer/src/parseIfcValues.ts`
- 新建：`tests/ifc/readIfcMetadata.test.ts`

**接口：**

```ts
interface IIfcMetadata {
  readonly projectId: number;
  readonly nodes: readonly IIfcMetadataNode[];
  readonly products: readonly IIfcProductMetadata[];
  readonly systems: readonly IIfcSystemMetadata[];
  readonly warnings: readonly string[];
}

interface IIfcMetadataNode {
  readonly expressId: number;
  readonly ifcType: string;
  readonly name: string;
  readonly children: readonly number[];
}

interface IIfcProductMetadata {
  readonly expressId: number;
  readonly ifcType: string;
  readonly globalId?: string;
  readonly selectionId: string;
  readonly name: string;
  readonly description?: string;
  readonly objectType?: string;
  readonly predefinedType?: string;
  readonly tag?: string;
  readonly propertySets: readonly IIfcPropertySetMetadata[];
  readonly systems: readonly IIfcSystemReference[];
}
```

- [ ] **步骤 1：编写 metadata 失败测试**

```ts
test('reads spatial hierarchy, properties and systems', async () => {
  const metadata = await loadFixtureMetadata();
  expect(metadata.nodes.map((node) => node.ifcType)).toEqual(
    expect.arrayContaining([
      'IFCPROJECT',
      'IFCSITE',
      'IFCBUILDING',
      'IFCBUILDINGSTOREY',
    ]),
  );
  expect(metadata.products).toHaveLength(2);
  expect(metadata.products.map((product) => product.name)).toEqual(
    expect.arrayContaining(['Primary Pump', 'Buffer Tank']),
  );
  expect(metadata.products[0]!.propertySets[0]!.properties)
    .toMatchObject({ FlowRate: 12.5 });
  expect(metadata.products[0]!.systems[0]!.name)
    .toBe('Sludge Transfer');
});
```

- [ ] **步骤 2：确认测试失败**

运行：

```bash
npm test -- tests/ifc/readIfcMetadata.test.ts
```

预期：FAIL，metadata module 尚不存在。

- [ ] **步骤 3：实现 spatial tree 与产品字段**

使用：

```ts
const spatial = await api.properties.getSpatialStructure(modelID, false);
```

递归映射 `expressID`、IFC type、name 和 children。产品名称优先使用 `Name`，其次
`ObjectType`，最后 `ifc/<TYPE>/<expressId>`。

Selection ID：

```ts
const globalId = normalizeIfcString(line.GlobalId);
const selectionId = globalId
  ? `${assetId}/ifc/${globalId}`
  : `${assetId}/ifc/express/${expressId}`;
```

重复 GlobalId 时第二个及后续值使用 `${selectionId}/express/${expressId}`，并增加稳定
warning。

- [ ] **步骤 4：实现 safe property flattening**

只允许：

- `string`
- 有限 `number`
- `boolean`
- 有限 primitive array

递归 reference、对象循环、binary 和 undefined 值省略。每个产品最多生成一条聚合
warning，包含 omitted property count。

- [ ] **步骤 5：实现系统 membership**

扫描 `IFCSYSTEM` 及其 inherited types，再从每个 `IfcRelAssignsToGroup` 读取
`RelatingGroup` 和 `RelatedObjects`。按 GlobalId/name/type 排序，避免 relation 文件
顺序改变输出 bytes。

- [ ] **步骤 6：运行测试**

运行：

```bash
npm test -- tests/ifc/readIfcMetadata.test.ts
```

预期：PASS，两个产品均包含属性和系统。

- [ ] **步骤 7：提交**

```bash
git add packages/ifc-importer/src tests/ifc/readIfcMetadata.test.ts
git commit -m "feat(toolchain): map IFC semantics"
```

---

### Task 4：生成 IFC source GLB

**文件：**

- 新建：`packages/ifc-importer/src/buildIfcSourceGlb.ts`
- 新建：`packages/ifc-importer/src/geometry.ts`
- 修改：`packages/ifc-importer/src/index.ts`
- 新建：`tests/ifc/buildIfcSourceGlb.test.ts`

**接口：**

```ts
async function buildIfcSourceGlb(
  document: IIfcOpenDocument,
  metadata: IIfcMetadata,
  outputPath: string,
): Promise<IIfcSourceStats>;
```

- [ ] **步骤 1：编写 Geometry GLB 失败测试**

```ts
test('converts IFC geometry and hierarchy to a y-up meter source GLB', async () => {
  const stats = await fixtureSourceGlb();
  expect(stats.triangleCount).toBeGreaterThan(0);
  expect(stats.productCount).toBe(2);

  const source = await readSource(stats.outputPath);
  expect(source.json.nodes?.map((node) => node.name))
    .toEqual(expect.arrayContaining([
      'Synthetic IFC Plant',
      'Primary Pump',
      'Buffer Tank',
    ]));
  expect(source.json.materials?.length).toBeGreaterThanOrEqual(2);
  expect(source.json.asset?.extras?.ice3?.coordinateSystem)
    .toMatchObject({
      handedness: 'right',
      upAxis: 'y',
      linearUnit: 'meter',
    });
});
```

- [ ] **步骤 2：确认测试失败**

运行：

```bash
npm test -- tests/ifc/buildIfcSourceGlb.test.ts
```

预期：FAIL，source GLB builder 尚不存在。

- [ ] **步骤 3：实现 deterministic geometry extraction**

使用 `StreamAllMeshes(modelID, callback, true)`，在 callback 中：

1. 按 `FlatMesh.expressID` 查找 product metadata。
2. 遍历 `FlatMesh.geometries`。
3. 读取 `IfcGeometry` position/index buffers。
4. 应用 `PlacedGeometry.flatTransformation`。
5. 把 IFC `(x,y,z)` 转为 `(x,z,-y)`。
6. 记录全局 Bounds。
7. callback 末尾调用 `flatMesh.delete()` 和 `geometry.delete()`。

对于无法映射 product 的 mesh，使用稳定 fallback product metadata，并 warning。

- [ ] **步骤 4：实现 document-local origin**

收集全部 position 后计算：

```ts
origin = [bounds.min[0], 0, bounds.min[2]];
```

对全部 position 减去同一个 origin。把 original origin 写入 source Asset
`extras.ice3.ifc.sourceOrigin`。不得逐节点选择 origin。

- [ ] **步骤 5：写入 hierarchy、material 和 IFC extras**

spatial node 和 product node 都写入稳定名称。产品 node 写入：

```ts
extras: {
  ice3: {
    selectionId: product.selectionId,
    displayName: product.name,
    ...(product.tag ? { equipmentTag: product.tag } : {}),
    ifc: product.ifcExtras,
  },
}
```

每个 distinct RGBA color 创建一个 material，设置 metallic `0`、roughness `1`。每个
placed geometry 的 triangle index 形成独立 primitive。

- [ ] **步骤 6：运行测试**

运行：

```bash
npm test -- tests/ifc/buildIfcSourceGlb.test.ts
```

预期：PASS；Bounds 有限，两个产品存在，颜色数量至少为二。

- [ ] **步骤 7：提交**

```bash
git add packages/ifc-importer/src tests/ifc/buildIfcSourceGlb.test.ts
git commit -m "feat(toolchain): build IFC source GLB"
```

---

### Task 5：接入 CLI、Adapter Registry 与发布包

**文件：**

- 修改：`packages/cli/src/commands.ts`
- 修改：`packages/cli/package.json`
- 修改：`packages/cli/tsconfig.json`
- 修改：`scripts/build-release-package.mjs`
- 修改：`scripts/check-release-package.mjs`
- 新建：`tests/cli/ifcImportCommand.test.ts`

**接口：**

- 消费：`createIfcImporter(): ICESourceImporter`
- 产出：`ice3-tool import SOURCE.ifc --output FILE --asset-id ID`

- [ ] **步骤 1：编写 CLI 失败测试**

```ts
test('import selects IFC by extension and publishes Prepared GLB', async () => {
  const output = join(root, 'ifc.glb');
  const report = join(root, 'ifc.report.json');
  const code = await runCli([
    'import',
    'tests/fixtures/ifc/synthetic-plant.ifc',
    '--output',
    output,
    '--report',
    report,
    '--asset-id',
    'synthetic-ifc',
    '--json',
  ]);

  expect(code).toBe(0);
  expect(validatePreparedGLB(await readFile(output)).errors).toEqual([]);
  expect(JSON.parse(await readFile(report, 'utf8')).adapter.id).toBe('ifc');
});
```

- [ ] **步骤 2：确认测试失败**

运行：

```bash
npm test -- tests/cli/ifcImportCommand.test.ts
```

预期：FAIL，`auto` 尚未加载 IFC adapter。

- [ ] **步骤 3：扩展按需 loader**

```ts
async function loadSourceImporters(requestedAdapter: string) {
  const importers = [];
  if (requestedAdapter === 'auto' || requestedAdapter === 'step') {
    const module = await import('../../step-importer/src/index.js');
    importers.push(module.createStepImporter());
  }
  if (requestedAdapter === 'auto' || requestedAdapter === 'ifc') {
    const module = await import('../../ifc-importer/src/index.js');
    importers.push(module.createIfcImporter());
  }
  if (importers.length === 0) {
    throw new Error(
      `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE: ${requestedAdapter}; install an adapter provider with this id`,
    );
  }
  return importers;
}
```

- [ ] **步骤 4：实现完整 IFC importer**

`createIfcImporter().import()` 必须：

1. `mkdtemp` 由 CLI 创建。
2. 初始化 parser。
3. 打开 IFC 并校验 schema。
4. 读取 metadata。
5. 构建 source GLB。
6. `finally CloseModel` 和 `Dispose`。
7. 返回 `sourceFormat: 'ifc-4x3'`、warnings 和 capability。

- [ ] **步骤 5：发布 package 外部化 parser**

公开 package 的 runtime dependency 和 esbuild external 增加：

```js
'web-ifc': '0.0.78'
```

发布检查实际安装 tarball 后执行 IFC fixture import、Prepared validation、WASM 文件检查
和 MPL-2.0 notice 检查。

- [ ] **步骤 6：运行 CLI 与发布测试**

运行：

```bash
npm test -- tests/cli/ifcImportCommand.test.ts
npm run release:check
```

预期：PASS，安装后的 `ice3-tool` 可处理合成 IFC。

- [ ] **步骤 7：提交**

```bash
git add packages/cli scripts tests/cli/ifcImportCommand.test.ts
git commit -m "feat(toolchain): expose IFC import command"
```

---

### Task 6：覆盖失败、精度和确定性

**文件：**

- 新建：`tests/fixtures/ifc/ifc4-legacy.ifc`
- 新建：`tests/fixtures/ifc/truncated.ifc`
- 新建：`tests/fixtures/ifc/empty-model.ifc`
- 新建：`tests/ifc/ifcFailures.test.ts`
- 新建：`tests/ifc/ifcDeterminism.test.ts`
- 修改：`tests/fixtures/ifc/generate-synthetic-plant.py`

**接口：**

- 消费：公开 import command 和 IFC importer。
- 产出：schema、unit、empty、truncated 和确定性证据。

- [ ] **步骤 1：编写失败测试**

```ts
test('rejects legacy schema without publishing output', async () => {
  const error = await runImportFailure(
    'tests/fixtures/ifc/ifc4-legacy.ifc',
    output,
  );
  expect(error).toContain('ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED');
  await expect(readFile(output)).rejects.toThrow();
});

test('rejects a readable model without geometry', async () => {
  const error = await runImportFailure(
    'tests/fixtures/ifc/empty-model.ifc',
    output,
  );
  expect(error).toContain('ICE3_TOOL_IMPORT_EMPTY_GEOMETRY');
  await expect(readFile(output)).rejects.toThrow();
});
```

- [ ] **步骤 2：确认测试失败**

运行：

```bash
npm test -- tests/ifc/ifcFailures.test.ts
```

预期：fixture 或稳定诊断尚不存在。

- [ ] **步骤 3：补齐失败 fixture**

- Legacy fixture 使用 IFC4 schema，但保留相同 geometry 和关系。
- Truncated fixture 在 DATA section 中截断。
- Empty fixture 保留 spatial hierarchy，但移除所有 Representation。
- Unsupported-unit fixture 将 Project unit context 改成无已知 metre conversion 的
  non-SI length unit。
- 通过 fixture generator 修改合成模型的 source origin，使其大于 `1e6` 米，验证
  document-local origin 后 float32 Bounds 仍保持产品间距。

- [ ] **步骤 4：实现稳定错误映射**

Parser 错误、WASM 异常和 invalid geometry 不得直接泄漏临时路径或 parser handle。
按规格将错误映射为：

- `ICE3_TOOL_IFC_IMPORT_FAILED`
- `ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED`
- `ICE3_TOOL_IFC_UNIT_UNSUPPORTED`
- `ICE3_TOOL_IFC_GEOMETRY_INVALID`
- `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY`

- [ ] **步骤 5：编写确定性测试**

```ts
test('repeated IFC imports are byte-identical', async () => {
  const first = await importFixture(root, 'first');
  const second = await importFixture(root, 'second');
  expect(await readFile(first.output)).toEqual(await readFile(second.output));
  expect(JSON.parse(await readFile(first.report, 'utf8')))
    .toEqual(JSON.parse(await readFile(second.report, 'utf8')));
});
```

- [ ] **步骤 6：运行 IFC suite**

运行：

```bash
npm test -- tests/ifc tests/cli/ifcImportCommand.test.ts
```

预期：PASS，所有失败 output 不存在，连续 import bytes 相同。

- [ ] **步骤 7：提交**

```bash
git add tests/fixtures/ifc tests/ifc packages/ifc-importer
git commit -m "test(toolchain): verify IFC import boundaries"
```

---

### Task 7：完成文档、第三方声明和完整门禁

**文件：**

- 修改：`README.md`
- 修改：`docs/README.md`
- 修改：`docs/architecture.md`
- 修改：`docs/reference/cli.md`
- 修改：`docs/plans/2026-10-29-ifc-4-3-importer.md`
- 修改：`THIRD_PARTY_NOTICES.md`
- 修改：`packages/cli/README.md`
- 修改：`tests/architecture/layout.test.ts`

**接口：**

- 产出：公开 IFC 支持说明、MPL-2.0 归属、发布边界和完整验证记录。

- [ ] **步骤 1：更新公开文档**

记录：

- `.ifc` 支持 IFC4X3。
- L1-L3 能力、Property Set 和 System membership。
- 稳定 Diagnostic。
- 大型坐标、单位、颜色和 Selection fallback。
- IFC 不支持项。

- [ ] **步骤 2：更新第三方声明**

加入 `web-ifc` `0.0.78`、MPL-2.0、Node WASM 文件、源码获取方式和未修改声明。
确认发布 package 不嵌入 parser 的 WASM binary。

- [ ] **步骤 3：更新架构检查**

`tests/architecture/layout.test.ts` 断言：

- `packages/ifc-importer` 是私有 workspace。
- parser 依赖只出现在 Toolchain package。
- Engine workspace 不引用 IFC parser。

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

- [ ] **步骤 5：整分支审查**

执行 executing-plans 的最终审查，重点检查：

- property 递归上限和循环引用。
- parser/WASM 资源在所有异常路径关闭。
- 大坐标精度。
- Prepared metadata 不被 partition 或 batching 丢失。

- [ ] **步骤 6：提交并合并**

确认 Git author/committer 为：

```text
damoqiongqiu <damoqiongqiu@126.com>
```

完整门禁通过后执行：

```bash
git merge --no-ff feat/ifc-importer
```

合入 `main` 后重新运行 `npm run verify` 和 `npm run release:check`，再删除功能分支。
