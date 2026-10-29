# OBJ Source Importer 规格

> Document ID: ICE3-TOOL-SPEC-005
>
> Status: Approved
>
> Owner: ICE3 Toolchain maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 已批准 |
| 版本 | 1.0 |
| 日期 | 2026-10-29 |
| 适用范围 | `ice3-toolchain` OBJ source import、CLI、切片和发布验证 |

## 1. 目标

为 Toolchain 增加轻量、进程内的 OBJ adapter，支持 `.obj` Geometry、object/group 名称、
三角化多边形、基础 MTL display color 和安全 sidecar MTL 读取。

输出继续进入现有 source GLB、Prepared GLB、validation、partition、LOD、
static batching 和 Tileset 管线。Browser Runtime 不识别 OBJ 或 MTL。

## 2. 支持范围

- `.obj` ASCII Geometry。
- `o` object 和 `g` group 名称。
- 三角面和多边形面的离线三角化。
- 同目录、安全的相对 `mtllib` sidecar 与 `usemtl` 基础材质。
- MTL 的 `Kd` display color。
- 米制假设 warning。
- 大型世界坐标使用一次 document-local origin。

不支持：

- texture、复杂 PBR、透明度排序、shader 和渲染器私有扩展。
- animation、skeleton、camera、light、point cloud 和 procedural geometry。
- 绝对 MTL 路径、`..` 越界资源或网络资源。
- 在 Runtime 中进行 OBJ/MTL parsing。
- 猜测设备 business identity、端口或连接关系。

## 3. 单位与坐标

OBJ 没有标准单位。Adapter 明确按米解释输入，并返回
`ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS` warning。调用方启用 warnings-as-errors 时必须阻止
publication。

输出固定为米制、right-handed y-up。Source world bounds 的 x/z 最小值写入
`extras.ice3.obj.sourceOrigin`，所有 Node 共用一次 local-origin 平移。

## 4. Adapter Interface

```ts
export function createObjImporter(): ICESourceImporter;
```

- `id`: `obj`
- `extensions`: `.obj`
- `capabilities.hierarchy`: `true`
- `capabilities.vertexColors`: `false`
- `capabilities.materialColors`: `true`
- `capabilities.instances`: `false`
- `capabilities.semanticMetadata`: `false`
- `sourceFormat`: `obj`

Node metadata 写入 `extras.ice3.obj`：

- `objectType`
- `sourceName`
- `materialNames`，只记录可映射的简化材质名
- `selectionId` 使用 `${assetId}/obj/node/${ordinal}`

## 5. 资源安全

- 只读取 input OBJ 所在目录内的 `mtllib`。
- 拒绝绝对路径、URL、空路径和解析后逃逸 input 目录的路径。
- 越界或缺失 MTL 不阻止 Geometry import，但产生稳定 warning。
- 不跟随目录 symlink 到 input 目录以外。
- 不读取纹理文件。
- 不记录绝对 source path 或 MTL path。

## 6. Diagnostic

| Code | 条件 |
| --- | --- |
| `ICE3_TOOL_OBJ_IMPORT_FAILED` | OBJ 语法、三角化或 GLB conversion 失败 |
| `ICE3_TOOL_OBJ_GEOMETRY_INVALID` | Bounds、transform 或 Geometry 无效 |
| `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY` | 成功读取但没有 triangle Geometry |
| `ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS` | 无单位信息，按米解释 |
| `ICE3_TOOL_OBJ_MATERIAL_UNAVAILABLE` | 引用的 MTL 缺失或无法读取 |
| `ICE3_TOOL_OBJ_RESOURCE_IGNORED` | 越界、URL 或不安全 sidecar 被忽略 |
| `ICE3_TOOL_OBJ_VERTEX_COLORS_UNSUPPORTED` | OBJ vertex color extension 被省略 |

Parser 原始 stderr 不暴露；标准化 warning 统一进入 import result、CLI result 和 report。

## 7. 确定性与失败

对相同 OBJ/MTL bytes、adapter version 和 dependency version，source GLB 与 Prepared
GLB 必须 byte-identical。Node 顺序、material 顺序、warning 顺序和 sourceOrigin
必须稳定。

失败时不发布 raw GLB、source GLB、report 或最终 Prepared GLB。

## 8. Fixture 与验收

仓库提交完全合成的 OBJ/MTL fixture：

- `PrimaryPump` 与 `BufferTank` 两个几何对象。
- 不同 MTL display color。
- 至少一个四边形验证离线三角化。
- georeferenced variant 验证 local origin。
- empty、truncated 和 unsafe MTL reference 验证失败或 warning 边界。

验收：

- auto 与显式 `obj` adapter 均可 import。
- partition 和 static batching 后保留 `extras.ice3.obj`。
- Prepared GLB validation 通过。
- 重复 import byte-identical。
- 发布 tarball 可实际执行 OBJ import，不包含 Blender。
- Node.js `24.22.1` 完整门禁通过。

## 关联文档

- `ICE3-TOOL-SPEC-001` — [多格式 Source Import](2026-10-29-source-import-adapters.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-TOOL-PLAN-006` — [OBJ Source Importer 实施计划](../plans/2026-10-29-obj-importer.md)
