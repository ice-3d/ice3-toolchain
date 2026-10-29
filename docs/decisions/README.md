# ICE3 Toolchain 架构决策索引

> Document ID: ICE3-TOOL-IDX-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 决策

| ID | 决策 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-ADR-001` | [离线标准输出](0001-offline-standard-output.md) | Active | Conversion 留在 Runtime 外，并保持标准格式 |
| `ICE3-TOOL-ADR-002` | [确定性原子 Publication](0002-deterministic-atomic-publication.md) | Active | 只发布完整、可重复 artifact |
| `ICE3-TOOL-ADR-003` | [Content-Addressed Generation Cache](0003-content-addressed-generation-cache.md) | Active | 避免重复昂贵的 authored source generation |

## 关联文档

- `ICE3-TOOL-IDX-001` — [Toolchain 文档索引](../README.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
