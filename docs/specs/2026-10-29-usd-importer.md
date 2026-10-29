# USD Source Importer 规格

> Document ID: ICE3-TOOL-SPEC-004
>
> Status: Approved
>
> Owner: ICE3 Toolchain maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 已批准 |
| 版本 | 1.0 |
| 日期 | 2026-10-29 |
| 适用范围 | `ice3-toolchain` USD source import、CLI、切片和发布验证 |

## 1. 目标

为 Toolchain 增加独立的 USD source adapter，支持当前工业内容管线中最常见的
`.usda` 和 `.usdc` 文件，把层级、Geometry、变换、基础颜色和可序列化 custom
properties 转换为标准 source GLB。

输出继续进入现有 `readSource()`、Prepared GLB、validation、partition、LOD、
static batching 和 Tileset 管线。Browser Runtime 不增加 USD parser、转换逻辑或
新增依赖。

## 2. 支持范围

- `.usda` ASCII USD。
- `.usdc` binary USD。
- USD stage 中可见的 `Xform`、`Scope`、`Mesh` 和可导入的场景实例。
- 对象层级、名称、变换、三角面或可三角化 Mesh。
- Blender USD importer 可映射的基础 display color。
- 标量、字符串、布尔值和有限深度的数组 custom properties。
- 米制 y-up、right-handed 输出。
- 大型世界坐标使用一次 document-local origin。

不承诺：

- `.usdz` package。
- composition、variants、schemas 和作用域的完整无损往返。
- animation、skeleton、blend shape、camera、light、volume、curve 和 point cloud。
- texture、复杂 PBR、MaterialX 或 Blender node tree。
- 修改或重新导出原始 USD stage。
- 在 Runtime、Browser 或 npm dependency 中携带作者应用。

## 3. 架构

```text
.usda / .usdc
      ↓
usd adapter
      ↓ fixed-version headless Blender bridge
raw GLB + private bridge report
      ↓ TypeScript canonicalizer
standard ICE3 source GLB
      ↓
existing preparation / partition / LOD / Tileset
```

Blender `5.2.3` 是可选外部构建依赖，不进入 npm dependency、发布 tarball 或 Runtime。
Bridge 只执行仓库内白名单 Python 文件，不执行调用方提供的 Python、shell 或表达式。

## 4. Adapter Interface

```ts
export function createUsdImporter(): ICESourceImporter;
```

- `id`: `usd`
- `extensions`: `.usda`, `.usdc`
- `capabilities.hierarchy`: `true`
- `capabilities.vertexColors`: `false`
- `capabilities.materialColors`: `true`
- `capabilities.instances`: `true`
- `capabilities.semanticMetadata`: `true`
- `sourceFormat`: `usd`

Component metadata 写入 `extras.ice3.usd`，包括：

- `objectType`
- `meshData`，仅 Mesh object 存在
- `instanceGroup`，仅复用 shared mesh data 时存在
- `customProperties`，仅保留可安全序列化的值
- `unmatchedObject`，仅 bridge report 无法匹配时存在

Selection ID 使用
`${assetId}/usd/node/${ordinal}`，ordinal 基于 canonical node 顺序，不依赖 importer
重命名、时间戳或 process pointer。

## 5. Bridge 参数

Bridge 固定调用：

```text
--background
--factory-startup
--python-exit-code 1
--python <repository-script>
-- --input <path> --output <path> --report <path>
```

USD import 固定：

- `import_meshes=True`
- `import_materials=True`
- `import_cameras=False`
- `import_lights=False`
- `import_curves=False`
- `import_skeletons=False`
- `import_blendshapes=False`
- `import_points=False`
- `import_textures_mode='IMPORT_NONE'`
- `apply_unit_conversion_scale=True`
- `validate_meshes=True`

GLB export 固定：

- `export_format='GLB'`
- `export_yup=True`
- `export_apply=True`
- `export_materials='EXPORT'`
- `export_cameras=False`
- `export_lights=False`
- `export_animations=False`
- `export_skins=False`
- `export_morph=False`
- `export_extras=True`

## 6. 失败与安全

| Code | 条件 |
| --- | --- |
| `ICE3_TOOL_USD_BLENDER_UNAVAILABLE` | Blender 不可执行或 bridge script 缺失 |
| `ICE3_TOOL_USD_BLENDER_VERSION_INVALID` | Blender 版本不是 `5.2.3` |
| `ICE3_TOOL_USD_TIMEOUT` | bridge 超过 timeout |
| `ICE3_TOOL_USD_IMPORT_FAILED` | USD 截断、语法无效或 import 失败 |
| `ICE3_TOOL_USD_EXPORT_FAILED` | bridge 未生成有效 raw GLB |
| `ICE3_TOOL_USD_GEOMETRY_INVALID` | 无 finite Bounds 或 transform 无效 |
| `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY` | USD 成功读取但没有 Mesh Geometry |

Timeout 默认 120 秒，可由 `ICE3_USD_TIMEOUT_MS` 覆盖。超时先发送 `SIGTERM`，
一秒后发送 `SIGKILL`。stdout、stderr、绝对路径和 Python traceback 不进入最终
Diagnostic。

失败时不发布临时 raw GLB、bridge report、source GLB 或最终 Prepared GLB。

## 7. 确定性与坐标

相同 input bytes、option、dependency version 和 tool version 必须生成 byte-identical
source GLB 与 Prepared GLB。Node 顺序、custom property key、warning 和 instance
group 顺序必须稳定。

Canonicalizer 计算完整 world bounds，把 x/z 最小点作为 shared source origin，写入：

```json
{
  "ice3": {
    "coordinateSystem": {
      "handedness": "right",
      "upAxis": "y",
      "linearUnit": "meter"
    },
    "usd": {
      "bridgeVersion": "1.0",
      "sourceOrigin": [0, 0, 0]
    }
  }
}
```

## 8. Fixture

提交完全合成的 USD fixture，不包含客户、真实设施、厂商或本地路径：

- 一个 `TreatmentLine` hierarchy。
- 一个命名为 `PrimaryPump` 的 Mesh。
- 一个复用相同 mesh data 的 `PumpInstanceA`。
- 一个命名为 `BufferTank` 的独立 Mesh。
- 基础颜色和 `EquipmentTag=P-101` custom property。
- `.usda` 与 `.usdc` 表示同一合成结构。

Fixture generator 必须固定 Blender `5.2.3`，不得读取客户目录。

## 9. 验收

- `import` 的 auto 与显式 `usd` 均能处理 `.usda/.usdc`。
- `partition` 能直接读取两种 extension。
- Prepared GLB 通过现有 profile validation。
- 层级、颜色、custom property、Selection ID 和 shared-mesh instance 被保留。
- partition 和 static batching 后 `extras.ice3.usd` 仍存在。
- 重复 import 输出 byte-identical。
- Blender 缺失、版本错误、timeout、截断文件和空 Mesh 均稳定失败且不发布 output。
- 发布 tarball 包含 `dist/usd/usd-to-glb.py`，不包含 Blender binary。
- README、CLI reference、架构、索引、第三方声明和 release check 同步更新。
- Node.js `24.22.1` 下完整门禁通过。

## 关联文档

- `ICE3-TOOL-SPEC-001` — [多格式 Source Import](2026-10-29-source-import-adapters.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-TOOL-PLAN-005` — [USD Source Importer 实施计划](../plans/2026-10-29-usd-importer.md)
