# ICE3 Tool CLI 参考

> Document ID: ICE3-TOOL-REF-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Command 语法

```text
ice3-tool <build|import|inspect|validate|partition> [arguments]
```

安装后的 binary 为 `ice3-tool`；仓库示例使用 `node packages/cli/dist/main.js`。

## Command-Line 约定

| Option | 值 | 行为 |
|---|---|---|
| `--json` | flag | 输出一个 machine-readable JSON result |
| `--crease-angle` | 有限数值，默认 `30` | 设置 generated edge threshold |
| `--skip-edges` | flag | 省略 generated edge Geometry |

`build`、`import` 和 `partition` 接受 `--budget` 与 `--warnings-as-errors`。
`build` 和 `import` 接受 `--report`。

## `import`

```bash
ice3-tool import SOURCE \
  --output FILE \
  --asset-id ID \
  [--adapter auto|step|ifc|fbx|usd|obj|jt] \
  [--report FILE] \
  [--budget PROFILE|FILE] \
  [--warnings-as-errors] \
  [--json]
```

`import` 在 Toolchain 内把受支持的源模型转换成临时 source GLB，随后复用 `build`
的 Geometry preparation 和 Prepared GLB validation。成功发布的 `--output` 始终是
Prepared GLB，而不是源模型或中间 source GLB。

首期 adapter：

| Adapter | 扩展名 | 源能力 |
|---|---|---|
| `step` | `.step`、`.stp` | STEP AP242 Geometry、层级、名称、颜色和米制 conversion |
| `ifc` | `.ifc` | IFC 4.3 spatial hierarchy、identity、Pset、Qto、System 和米制 conversion |
| `fbx` | `.fbx` | ASCII/Binary 层级、Geometry、基础颜色、实例和 custom properties |
| `usd` | `.usda`、`.usdc` | USD 层级、Geometry、基础颜色、实例、prim path 和 custom properties |
| `obj` | `.obj` | OBJ Geometry、object/group 名称和同目录基础 MTL |
| `jt` | `.jt` | 通过 `ICE3_JT_CONVERTER` 接入的 JT 层级、Geometry、材质和 metadata |

`--adapter auto` 按 extension 选择 adapter。`--report` 在标准 Asset Report 顶层增加
`adapter` 字段，记录 adapter identity、source format、capability 和 adapter warning。
转换、Source validation、budget 或 Prepared GLB validation 失败时不会发布 output。

### Import Diagnostic

| Code | 含义 |
|---|---|
| `ICE3_TOOL_IMPORT_UNSUPPORTED` | `--adapter auto` 无法从 extension 选择 adapter |
| `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE` | 显式 adapter 不存在、不可用，或 extension 不匹配 |
| `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY` | adapter 成功解析，但没有可用 triangle Geometry |
| `ICE3_TOOL_STEP_IMPORT_FAILED` | STEP 文件语法、解析或三角化失败 |
| `ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED` | IFC 文件不是 IFC4X3 系列 |
| `ICE3_TOOL_IFC_UNIT_UNSUPPORTED` | IFC 长度单位缺失、未知或冲突 |
| `ICE3_TOOL_IFC_IMPORT_FAILED` | IFC 文件截断、解析或读取失败 |
| `ICE3_TOOL_IFC_GEOMETRY_INVALID` | IFC Geometry、transform 或 index 无效 |
| `ICE3_TOOL_FBX_BLENDER_UNAVAILABLE` | Binary FBX bridge 所需 Blender 不存在 |
| `ICE3_TOOL_FBX_BLENDER_VERSION_INVALID` | Blender 版本不是 `5.2.3` |
| `ICE3_TOOL_FBX_TIMEOUT` | FBX bridge 超时 |
| `ICE3_TOOL_FBX_IMPORT_FAILED` | FBX 读取或 ASCII conversion 失败 |
| `ICE3_TOOL_FBX_EXPORT_FAILED` | Bridge 未生成有效 raw GLB |
| `ICE3_TOOL_FBX_GEOMETRY_INVALID` | FBX Geometry、Bounds 或 transform 无效 |
| `ICE3_TOOL_USD_BLENDER_UNAVAILABLE` | USD bridge 所需 Blender 不可用 |
| `ICE3_TOOL_USD_BLENDER_VERSION_INVALID` | Blender 版本不是 `5.2.3` |
| `ICE3_TOOL_USD_TIMEOUT` | USD bridge 超时 |
| `ICE3_TOOL_USD_IMPORT_FAILED` | USD 截断、语法或 import 失败 |
| `ICE3_TOOL_USD_EXPORT_FAILED` | USD bridge 未生成有效 raw GLB |
| `ICE3_TOOL_USD_GEOMETRY_INVALID` | USD Geometry、Bounds 或 transform 无效 |
| `ICE3_TOOL_OBJ_IMPORT_FAILED` | OBJ 语法、三角化或 GLB conversion 失败 |
| `ICE3_TOOL_OBJ_GEOMETRY_INVALID` | OBJ Geometry、Bounds 或 transform 无效 |
| `ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS` | OBJ 没有单位信息，按米解释 |
| `ICE3_TOOL_OBJ_MATERIAL_UNAVAILABLE` | 引用的 MTL 缺失或不可读取 |
| `ICE3_TOOL_OBJ_RESOURCE_IGNORED` | 不安全或越界 sidecar 被忽略 |
| `ICE3_TOOL_OBJ_VERTEX_COLORS_UNSUPPORTED` | OBJ vertex color extension 被省略 |
| `ICE3_TOOL_JT_CONVERTER_UNAVAILABLE` | `ICE3_JT_CONVERTER` 未配置或不可执行 |
| `ICE3_TOOL_JT_TIMEOUT` | JT converter 超时 |
| `ICE3_TOOL_JT_CONVERT_FAILED` | JT converter 返回非零或未生成 GLB |
| `ICE3_TOOL_JT_EXPORT_INVALID` | Converter output 不是有效标准 GLB |
| `ICE3_TOOL_JT_GEOMETRY_INVALID` | JT Geometry、Bounds 或 transform 无效 |

Adapter warning 会进入 report。`--warnings-as-errors` 启用时，任意 adapter 或 source
warning 都会阻止 publication。`--budget` 的 contract 与 `build` 相同。

IFC 产品使用 `GlobalId` 作为 Selection identity。重复 GlobalId 会追加 express ID；
缺失 GlobalId 使用稳定的 express-ID fallback。Pset、Qto 和 System membership 会保留
在 Prepared GLB node metadata。复杂且不可 JSON 序列化的 property 会省略并产生 warning。

FBX Binary 使用 Blender `5.2.3`。通过 `BLENDER_BIN` 指定可执行文件，通过
`ICE3_FBX_TIMEOUT_MS` 设置 bridge timeout。ASCII FBX 使用进程内 WASM。FBX 对象层级、
shared-mesh instance 和 primitive custom properties 会保留；动画、skin、camera、
light、复杂材质和 Blender node tree 不支持。

USD Binary 与 ASCII 使用同一个固定版本 Blender bridge，可通过 `BLENDER_BIN` 指定
可执行文件，通过 `ICE3_USD_TIMEOUT_MS` 设置 timeout。当前支持 `.usda` 和 `.usdc`，
不支持 `.usdz`。USD 层级、基础颜色、shared-mesh instance、prim path 和可序列化
custom properties 会保留；animation、skeleton、camera、light、volume 和复杂材质不支持。

OBJ 在进程内转换，不依赖 Blender。只读取 OBJ 同目录的相对 MTL；没有内建单位，固定按米
解释并返回 warning。object/group 名称、基础 `Kd` display color 和稳定 Selection ID
会保留。texture、复杂材质、绝对路径、URL 和目录外资源不支持。

JT parser 不在 Toolchain 中。配置 `ICE3_JT_CONVERTER` 后，adapter 以固定
`--input SOURCE.jt --output RAW.glb` 启动 converter，`ICE3_JT_TIMEOUT_MS` 设置超时。
Converter 必须输出米制、right-handed y-up 标准 GLB；`node.extras.jt` 可提供 objectId、
assemblyPath 和 customProperties。Converter binary 不随 npm package 分发。

## `inspect`

```bash
ice3-tool inspect SOURCE \
  [--asset-id ID] \
  [--crease-angle DEGREES] \
  [--skip-edges] \
  [--json]
```

读取 source model 或 Prepared GLB，并报告聚合 format 与 profile statistic。

## `build`

```bash
ice3-tool build SOURCE \
  --output FILE \
  [--report FILE] \
  [--asset-id ID] \
  [--budget PROFILE|FILE] \
  [--crease-angle DEGREES] \
  [--skip-edges] \
  [--warnings-as-errors] \
  [--json]
```

`--output` 必填。Output publication 是原子的。Hard-budget failure 或无效 generated
profile 不会留下最终 GLB。

## `validate`

```bash
ice3-tool validate FILE [--json]
```

校验 ICE3 Prepared GLB。Exit code `1` 表示一个或多个 error。

## `partition`

```bash
ice3-tool partition SOURCE \
  --output DIRECTORY \
  --asset-id ID \
  [--max-triangles 500000] \
  [--max-bytes 33554432] \
  [--budget PROFILE|FILE] \
  [--crease-angle DEGREES] \
  [--skip-edges] \
  [--render-batch off|static] \
  [--lod] \
  [--lod-ratio 0.15] \
  [--lod-max-triangles 250000] \
  [--lod-min-unit-triangles 8] \
  [--lod-allocation proportional|adaptive] \
  [--lod-curve-samples 8] \
  [--lod-max-memory-bytes 67108864] \
  [--coarse-chunk-max-bytes 33554432] \
  [--semantic-proxy off|auto] \
  [--json]
```

`SOURCE` 可以是 glTF/GLB，也可以是 `.step`、`.stp`、`.ifc`、`.fbx`、`.usda`、
`.usdc`、`.obj` 或 `.jt`。非 glTF source 会先由
对应 adapter 转为临时标准 source GLB，再执行同一 partition/LOD pipeline；中间文件
不会进入最终 Tileset。

### Partition 约束

| Option | 约束 |
|---|---|
| `--max-triangles` | 正数 |
| `--max-bytes` | 正数 byte count |
| `--lod-ratio` | 大于 0 且小于 1 |
| `--lod-max-triangles` | 正整数 |
| `--lod-min-unit-triangles` | 正整数，且不大于 `--lod-max-triangles` |
| `--lod-curve-samples` | `4` 到 `32` 的整数 |
| `--lod-max-memory-bytes` | 正整数 |
| `--coarse-chunk-max-bytes` | 正整数 |
| `--semantic-proxy auto` | 需要 `--lod --lod-allocation adaptive` |

Output directory 不得预先存在。成功后发布：

```text
tileset.json
parts/part-NNN.glb
coarse/... (when LOD is enabled)
```

`--coarse-chunk-max-bytes` 控制单个粗模 chunk 的目标大小。一个内部 Tile 可以发布
单个 `coarse/<tile-id>.glb`，也可以通过标准 `contents` 发布多个
`coarse/<tile-id>/part-NNN.glb`。详见
[从 GLB 到 Engine 的完整接入流程](../guides/glb-to-engine.md)。

## Exit Status

- `0`：command 完成且全部 required validation 通过。
- `1`：无效 argument、不支持 input、validation failure、budget failure、publication
  failure 或 Runtime exception。

## 关联文档

- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](../guides/build-validate-partition.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine 的完整接入流程](../guides/glb-to-engine.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-ENG-REF-001` — [Runtime diagnostics](https://github.com/ice-3d/ice3-engine/blob/main/docs/diagnostics.md)
