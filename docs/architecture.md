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
source glTF / GLB
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
| Source adapter | 读取受支持 glTF/GLB，并解压声明支持的 mesh compression |
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
- Directory publication 失败时恢复上一个 Asset root。
- 无论成功或失败，temporary workspace 都会被删除。

## 关联文档

- `ICE3-TOOL-RM-001` — [README](../README.md)
- `ICE3-TOOL-IDX-001` — [文档索引](README.md)
- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](guides/build-validate-partition.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine 的完整接入流程](guides/glb-to-engine.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](reference/cli.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
