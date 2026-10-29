# IFC 4.3 Source Importer 规格

> Document ID: ICE3-TOOL-SPEC-002
>
> Status: Draft
>
> Owner: ICE3 Toolchain maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 待评审 |
| 版本 | 1.0 |
| 日期 | 2026-10-29 |
| 适用范围 | `ice3-toolchain` 的 IFC 4.3 source adapter、语义映射和发布验证 |

## 1. 目标

为 Toolchain 增加 IFC 4.3 导入能力，使 `ice3-tool import plant.ifc` 生成可被现有
Pipeline 消费的标准 source GLB，并最终发布 validated Prepared GLB。

IFC adapter 必须保留工业应用真正需要的空间和业务语义，而不只是三角网格：

- IFC spatial hierarchy。
- 产品 identity、名称和类型。
- Property Set 与 Quantity Set。
- IFC system membership。
- 可稳定引用的 Selection identity。

Runtime 继续只消费 ICE3 Prepared GLB 或 Tileset，不识别 IFC，也不加载 IFC parser。

## 2. 非目标

- 不编辑 IFC，不进行 IFC authoring 或 schema migration。
- 不支持 IFC2X3、IFC4 或 IFC4.3 之前的 preview schema。
- 不执行任意外部转换程序、Python、shell 或网络请求。
- 不实现 B-Rep 运算、参数化编辑或 IFC 文件回写。
- 不承诺把 IFC 的全部 inverse relationship 无损复制到 GLB。
- 不从名称猜测设备类型、端口、流程连接或业务身份。
- 不在 Runtime 中解析 `.ifc`。

## 3. 格式与依赖策略

| 项目 | 决策 |
| --- | --- |
| 扩展名 | `.ifc`，大小写不敏感 |
| Schema | `IFC4X3` 及其正式 addendum/revision |
| Parser | 进程内 `web-ifc` `0.0.78` |
| Parser 位置 | 私有 `@ice3/ifc-importer` package |
| Parser 许可证 | MPL-2.0，进入第三方声明和发布检查 |
| WASM | 从安装后的 parser package 加载，不进入 Engine |
| 加载方式 | CLI 按 adapter ID 动态加载 |

打开 model 时必须关闭不兼容 schema alias 的 best-effort 行为。Schema 识别不在此范围
内时，返回稳定错误，不得按 IFC4X3 继续解析。

## 4. 数据流

```text
IFC 4.3 file
    ↓
schema and unit validation
    ↓
spatial structure + product + property extraction
    ↓
geometry streaming and triangle normalization
    ↓
standard source GLB
    ↓
existing readSource / validateSource / buildPreparedGLB
    ↓
Prepared GLB
```

IFC parser 只存在于 Toolchain adapter。现行 Importer Registry、CLI orchestration、
Prepared GLB builder、Partition 和 LOD 继续复用，不增加 IFC 专用 Runtime path。

## 5. 空间层级

必须保留下列 IFC spatial decomposition：

- `IfcProject`
- `IfcSite`
- `IfcBuilding`
- `IfcBuildingStorey`
- `IfcSpace`

产品通过 IFC containment/decomposition relation 挂到对应层级。层级节点即使没有自身
Geometry 也必须保留，以保证后续业务定位和 Selection Bounds 正确。

对于存在 Geometry、但无法关联到 spatial tree 的产品：

- 使用 IFC element type 和名称创建稳定 fallback node。
- Report 增加 recoverable warning。
- 不得静默丢弃产品。

## 6. Geometry 与单位

### 6.1 Geometry

- 读取 IFC parser 提供的 triangulated Geometry。
- 保留每个 placed geometry 的 local transform，并烘焙到输出 vertex position。
- 保留非空 position 和 triangle indices。
- 缺少有效 triangle 的 product 不创建空 mesh。
- 所有 position、matrix 和 Bounds 必须有限。
- 同一 product 的多个颜色 part 可以形成多个 primitive。

### 6.2 单位

- IFC length unit 转换为米。
- 输出声明 `linearUnit: meter`。
- 遇到未知、无定义或彼此矛盾的长度单位时失败。
- 不默认把无单位数值当作米或毫米。

### 6.3 坐标与精度

IFC 使用工程坐标习惯。Adapter 必须一次性转换为 right-handed y-up：

```text
gltfX = ifcX
gltfY = ifcZ
gltfZ = -ifcY
```

对大型 georeferenced model，Adapter 使用单一 document-local origin，避免将世界坐标
直接压入 float32。源 origin 写入 source Asset extras 和 adapter report；所有节点共享
同一次平移，不改变模型内部相对位置。

## 7. 语义映射

### 7.1 Selection identity

- 有 IFC `GlobalId` 的产品使用 `${assetId}/ifc/${GlobalId}` 作为 `selectionId`。
- 缺少 `GlobalId` 时不得根据名称伪造设备身份；使用带 IFC express ID 的稳定 fallback，
  并产生 warning。
- 重复 `GlobalId` 产生 warning，后续值追加稳定 express ID，避免 Selection 冲突。

### 7.2 节点基础字段

对可映射产品保留：

- `ifcType`
- `globalId`
- `expressId`
- `name`
- `description`
- `objectType`
- `predefinedType`
- `tag`

名称映射为 GLB node name。能明确解释为设备 tag 的 `IfcElement.Tag` 写入
`extras.ice3.equipmentTag`；不根据 name 猜测 tag。

### 7.3 Property Set 与 Quantity Set

对每个产品保留有限、可序列化的 property：

- Scalar string、number、boolean、enum label。
- 一维 scalar array。
- Property Set / Quantity Set name。
- Property name。

复杂 reference、nested aggregate、binary 和无法稳定序列化的值省略，并在 report 中给出
一条按 product 聚合的 warning。不得把循环对象直接写入 GLB JSON。

租户只需要设备业务属性的应用，应能直接读取 Prepared GLB 中的 metadata，无需重新
解析 IFC。

### 7.4 System membership

对 `IfcSystem`、`IfcDistributionSystem` 及其兼容 group relation 保留：

- system GlobalId
- system name
- system type
- member product selection IDs

System membership 写入产品 metadata。缺少系统关系时不猜测介质、流向或流程连接。

## 8. Source GLB Metadata

产品节点使用以下稳定结构：

```json
{
  "extras": {
    "ice3": {
      "id": "asset/node/12",
      "selectionId": "asset/ifc/2O2Fr$t4X7Zf8NOew3FLKr",
      "displayName": "Primary Transfer Pump",
      "equipmentTag": "P-101",
      "ifc": {
        "schema": "IFC4X3",
        "expressId": 42,
        "ifcType": "IFCPUMP",
        "globalId": "2O2Fr$t4X7Zf8NOew3FLKr",
        "predefinedType": "USERDEFINED",
        "propertySets": [
          {
            "name": "Pset_PumpTypeCommon",
            "properties": {
              "FlowRate": 12.5
            }
          }
        ],
        "systems": [
          {
            "globalId": "1AbC...",
            "name": "Sludge Transfer",
            "ifcType": "IFCDISTRIBUTIONSYSTEM"
          }
        ]
      }
    }
  }
}
```

Prepared GLB builder 必须允许显式、无歧义的 `extras.ice3.ifc` metadata 通过，同时保持
现有 selection、equipmentTag 和 process metadata 行为。

Source Asset extras 记录：

- IFC schema。
- source application。
- sourceOrigin。
- 单位转换结果。
- 被省略 property 数量和 warning 数。

不得记录 source 文件绝对路径、客户名称或本地用户名。

## 9. 颜色与材质

- 使用 IFC material/style 提供的 display RGBA。
- 将同色 placed geometry 合并为兼容 primitive。
- 无法解释的复杂材质降级为稳定 display color，并产生 warning。
- 不把 IFC 材质系统扩展成 PBR authoring 工具。
- 输出保持工业用途的大平光基础参数：metallic 为零、roughness 为一。

## 10. 失败与 Diagnostic

| Code | 条件 |
| --- | --- |
| `ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED` | 文件不是 IFC4X3 系列 |
| `ICE3_TOOL_IFC_IMPORT_FAILED` | Parser 无法打开或读取 model |
| `ICE3_TOOL_IFC_UNIT_UNSUPPORTED` | 长度单位未知、缺失或冲突 |
| `ICE3_TOOL_IFC_GEOMETRY_INVALID` | Geometry、matrix、index 或 Bounds 无效 |
| `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY` | model 可读但没有有效 triangle |
| `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE` | IFC adapter 或 parser 未安装 |

失败时：

- 不发布 Prepared GLB。
- 不留下 parser model、WASM Geometry 或临时 source GLB。
- 报告稳定 Diagnostic，不依赖 parser 的偶发文本。

## 11. 确定性

对相同 IFC bytes、adapter version、parser version 和 option：

- spatial node 顺序稳定。
- product、property set、property 和 system 顺序稳定。
- GLB nodes、materials、accessors 和 report bytes 稳定。
- 不写入当前时间、临时路径、随机 ID 或 parser handle。
- parser handle 和 express ID 仅作为确定性 fallback 的整数输入。

## 12. 测试资产

仓库必须提交完全合成的 IFC4X3 fixture，不包含客户、厂商或真实项目信息。Fixture 至少包含：

- Project、Site、Building、Storey。
- 两个具名 product。
- 两个具有三角化的独立 Geometry。
- 两种颜色。
- 两个 Property Set。
- 一个 Quantity Set。
- 一个 Distribution System 和两个 members。

其他 fixture：

- IFC4 旧 schema，必须拒绝。
- 截断文件，必须稳定失败。
- 只有 spatial hierarchy、没有产品 Geometry，必须返回 empty Geometry。
- malformed unit 或缺失 unit，必须拒绝。

## 13. 验证

### 13.1 单元与集成

- Schema/unit gate。
- Spatial tree 和 fallback node。
- Geometry、颜色和 transform。
- GlobalId、重复 ID 和缺失 ID。
- Property Set flattening 与复杂值 warning。
- System membership。
- Prepared GLB 保留 IFC metadata。
- 失败不发布 output。
- 重复 import byte-identical。

### 13.2 CLI

```bash
ice3-tool import tests/fixtures/ifc/synthetic-plant.ifc \
  --output /tmp/synthetic-plant.glb \
  --report /tmp/synthetic-plant.report.json \
  --asset-id synthetic-plant
```

验证：

- `--adapter auto` 和 `--adapter ifc` 均可用。
- `--output` 通过 `validatePreparedGLB()`。
- report 包含 IFC adapter capability、schema、warning 和 property statistic。
- Source 路径不进入 output 或 report。

### 13.3 发布包

安装 tarball 后实际执行一次 IFC import，并确认：

- IFC adapter code 位于发布 CLI。
- parser 与 Node WASM 作为独立 runtime dependency 安装。
- MPL-2.0 声明包含 parser、WASM 文件、版本和源码获取方式。
- 发布包不包含 source fixture 之外的 IFC 资产。

## 14. 验收

- `.ifc` 可通过 auto 和显式 IFC adapter 进入 Prepared GLB pipeline。
- IFC spatial hierarchy、产品 identity、Property Set 和 system membership 可读取。
- Geometry 为米、右手 y-up，Bounds 有限。
- 所有需要拒绝的 schema、unit 和 Geometry 输入均稳定失败。
- 成功和失败路径均满足原子发布与临时资源清理。
- 文档、第三方声明、npm tarball 和完整门禁通过。

## 关联文档

- `ICE3-TOOL-SPEC-001` — [多格式 Source Import 适配器与 STEP AP242 首期规格](2026-10-29-source-import-adapters.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-TOOL-NOTICE-001` — [第三方声明](../../THIRD_PARTY_NOTICES.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
