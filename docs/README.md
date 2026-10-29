# ICE3 Toolchain 文档索引

> Document ID: ICE3-TOOL-IDX-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 从这里开始

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-RM-001` | [ICE3 Toolchain](../README.md) | Active | 构建、验证、partition 和 Asset 概览 |
| `ICE3-TOOL-POL-001` | [仓库规则](../AGENTS.md) | Active | Toolchain 架构和交付规则 |
| `ICE3-TOOL-ARC-001` | [Toolchain 架构](architecture.md) | Active | Pipeline 边界、确定性、内存和失败行为 |
| `ICE3-TOOL-IDX-002` | [架构决策](decisions/README.md) | Active | Toolchain 设计决策索引 |

## 指南

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-GUIDE-001` | [构建、验证与拆分](guides/build-validate-partition.md) | Active | 操作主要 preprocessing command |
| `ICE3-TOOL-GUIDE-002` | [大型模型性能](guides/large-model-performance.md) | Active | 使用 cache、memory 和 timing Diagnostic |

## 参考与声明

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-REF-001` | [CLI 参考](reference/cli.md) | Active | command、option、default 和失败行为 |
| `ICE3-TOOL-NOTICE-001` | [第三方声明](../THIRD_PARTY_NOTICES.md) | Active | 上游归属和许可证范围 |
| `ICE3-TOOL-REF-002` | [OGC 3D Tiles Schema 来源](../tests/fixtures/3d-tiles-1.1-schema/SOURCE.md) | Active | schema fixture bundle 的来源 |

## 决策

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-ADR-001` | [离线标准输出](decisions/0001-offline-standard-output.md) | Active | conversion 不进入 Runtime |
| `ICE3-TOOL-ADR-002` | [确定性原子发布](decisions/0002-deterministic-atomic-publication.md) | Active | 只发布完整且可重复的输出 |
| `ICE3-TOOL-ADR-003` | [Content-Addressed 生成缓存](decisions/0003-content-addressed-generation-cache.md) | Active | 避免重复生成 Blender source |

## 实施计划

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-PLAN-001` | [M1 GLB Pipeline](plans/2026-10-27-toolchain-m1-glb-pipeline.md) | Implemented | core GLB pipeline 的历史实施记录 |
