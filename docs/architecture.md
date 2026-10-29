# ICE3 Toolchain 架构

> Document ID: ICE3-TOOL-ARC-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 系统上下文

Toolchain 将 model-authoring format 转换为有界 Runtime format。它是离线构建组件，
Browser Runtime 永不导入。

```text
source glTF / GLB / STEP AP242 / IFC 4.3 / FBX / USD
       ↓
adapter registry → standard source GLB
       ↓
source validation
       ↓
geometry normalization
       ↓
prepared profile ──────→ full preview GLB
       ↓
spatial partition plan
       ↓
fine GLBs + coarse LOD + batches
       ↓
OGC 3D Tiles 1.1
```

## 组件

| 组件 | 职责 |
|---|---|
| Source reader | 读取受支持 glTF/GLB，并解压声明支持的 mesh compression |
| Source importer | 按 extension 或显式 ID 选择 adapter，把 STEP 等源格式转换为标准 source GLB |
| Geometry preparation | 烘焙 Node transform、归一化 triangle data、保留 display color，并可选生成 edge |
| Profile builder | 生成带 ICE3 metadata 的确定性 single-JSON/single-BIN GLB |
| Partition planner | 将原子 semantic unit 组织为 spatial tree |
| LOD generator | 生成 proportional 或 adaptive coarse Geometry 与 chunk |
| Semantic proxy generator | 生成保守 OBB 和 cylinder candidate |
| Render-batch builder | 合并不改变 semantic Node 的兼容 static Geometry |
| Validator | 检查 accessor、profile field、Bounds、budget 和 Tileset reference |
| Publisher | 写入 staging，并原子替换已完成 output |

## Source 与 Prepared 边界

Browser 只接收 Prepared profile。Source-format parsing、compression decoding、
transform、simplification 和 Material conversion 都留在本仓库。

Contract 由 `ICE3-DOC-CTR-001` 管理；本 Toolchain 只定义本地实现，不定义竞争格式。

Source importer 是一次性构建边界，不进入 Browser package。首期 STEP adapter 使用隔离
的 CAD/WASM 依赖，在 Node process 内完成单位、坐标和三角网格转换。后续格式通过相同
`ICESourceImporter` contract 注册，不得增加 Runtime conversion path。

IFC 4.3 adapter 在独立 Toolchain package 内解析 spatial hierarchy、产品字段、
Property Set、Quantity Set 和 System membership。它把 georeferenced Geometry 转换到
统一的米制 y-up document-local 坐标系，并将原始原点与 IFC metadata 写入 source GLB。
IFC parser 和 WASM 不进入 Engine package 或 Browser bundle。

FBX Binary 使用固定版本的无界面 Blender bridge；白名单 Python 脚本只负责 DCC import 和
raw GLB export。ASCII FBX 使用进程内 WASM fallback。两条路径最终都经过同一个
TypeScript canonicalizer，由其负责实例、Selection、custom properties、坐标和确定性。
Blender 与 FBX parser 都不进入 Engine package 或 Browser bundle。

USD adapter 同样使用固定版本 Blender bridge，支持 ASCII `.usda` 和 binary `.usdc`
Mesh、层级、基础颜色与 native instance。Bridge 使用标准 USD stage 识别 instanceable
prim，把 instance 物化为共享 mesh data 的独立 Node。TypeScript canonicalizer 负责
Selection、USD prim path、custom properties、local origin 和确定性发布；`.usdz`、
animation、camera、light 和复杂 material 不在当前支持范围。

## Source Import 边界

| 等级 | 能力 | STEP 首期 |
|---|---|---|
| L1 | Mesh、transform、Bounds | 必须 |
| L2 | Unit、assembly hierarchy、node name、color | 必须，缺失时 warning 或明确失败 |
| L3 | Equipment identity、port、connection | 仅映射 source 已有信息 |
| L4 | 完整业务属性与源对象追踪 | 不在首期 |

Success 输出始终是 Prepared GLB。Import adapter 返回的 source GLB 和临时 workspace
只存在于构建过程中，不作为发布格式。

`partition` 对 STEP、IFC、FBX 和 USD 直接调用同一 adapter，在临时 workspace 获得 source GLB 后
继续 spatial partition、LOD 和 Tileset publication。调用方不需要自行保存或传递中间
source GLB。

## 确定性

对于相同 input bytes、option、dependency version 和 tool version：

- JSON object key 顺序稳定。
- Collection 顺序稳定。
- 生成的 Node 和 partition ID 稳定。
- Prepared bytes 和 report 具有确定性。
- 最终文件只通过临时路径写入，再 rename 发布。

## 内存与并发

LOD Geometry 被归一化到有界 workspace。超过配置 in-memory budget 的 Geometry 写入
唯一 temporary file。Authoring example 使用 512 MiB workspace，CLI 默认值为 64 MiB。

Source model 就绪后，authoring build 并行执行 full-model preparation 和 spatial/LOD
generation。Source generation cache 使用 content-addressed key，避免重建未变化的
Blender output。

## 失败行为

- 无效 input 在任何 final output path 创建前失败。
- Hard budget violation 使 build 失败。
- Validation 失败阻止 publication。
- Source format 无法识别时返回 `ICE3_TOOL_IMPORT_UNSUPPORTED`。
- 可选 adapter 未安装时返回 `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE`。
- STEP 没有可用 triangle Geometry 时返回 `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY`。
- Adapter 解析失败时返回 `ICE3_TOOL_STEP_IMPORT_FAILED`，且不发布目标 output。
- IFC schema 或单位不支持时分别返回 `ICE3_TOOL_IFC_SCHEMA_UNSUPPORTED` 和
  `ICE3_TOOL_IFC_UNIT_UNSUPPORTED`。
- IFC parser 或 Geometry 失败时返回稳定 `ICE3_TOOL_IFC_*` Diagnostic，不泄漏
  temporary path 或 parser handle。
- FBX Blender 缺失、版本错误、timeout 和导入失败分别返回稳定 `ICE3_TOOL_FBX_*`
  Diagnostic，且不发布 output。
- USD Blender 缺失、版本错误、timeout、导入或 Geometry 失败分别返回稳定
  `ICE3_TOOL_USD_*` Diagnostic，且不发布 output。
- Directory publication 失败时恢复上一个 Asset root。
- 无论成功或失败，temporary workspace 都会被删除。

## 关联文档

- `ICE3-TOOL-RM-001` — [README](../README.md)
- `ICE3-TOOL-IDX-001` — [文档索引](README.md)
- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](guides/build-validate-partition.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine 的完整接入流程](guides/glb-to-engine.md)
- `ICE3-TOOL-GUIDE-004` — [AI 控制 Blender 建模工作流](guides/ai-blender-modeling.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](reference/cli.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
