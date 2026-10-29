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
| `ICE3-TOOL-RM-002` | [npm package toolchain](../packages/cli/README.md) | Active | 发布 package 和 `ice3-tool` 命令的安装说明 |
| `ICE3-TOOL-POL-001` | [仓库规则](../AGENTS.md) | Active | Toolchain 架构和交付规则 |
| `ICE3-TOOL-ARC-001` | [Toolchain 架构](architecture.md) | Active | Pipeline 边界、确定性、内存和失败行为 |
| `ICE3-TOOL-IDX-002` | [架构决策](decisions/README.md) | Active | Toolchain 设计决策索引 |

## 指南

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-GUIDE-001` | [构建、验证与拆分](guides/build-validate-partition.md) | Active | 操作主要 preprocessing command |
| `ICE3-TOOL-GUIDE-002` | [大型模型性能](guides/large-model-performance.md) | Active | 使用 cache、memory 和 timing Diagnostic |
| `ICE3-TOOL-GUIDE-003` | [从 GLB 到 Engine 的完整接入流程](guides/glb-to-engine.md) | Active | partition、coarse LOD、发布和 Runtime loading 的端到端说明 |
| `ICE3-TOOL-GUIDE-004` | [AI 控制 Blender 建模工作流](guides/ai-blender-modeling.md) | Active | 受控 AI authoring、Scene Specification、Blender build 和验证闭环 |

## 参考与声明

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-REF-001` | [CLI 参考](reference/cli.md) | Active | command、option、default 和失败行为 |
| `ICE3-TOOL-NOTICE-001` | [第三方声明](../THIRD_PARTY_NOTICES.md) | Active | 上游归属和许可证范围 |
| `ICE3-TOOL-REF-002` | [OGC 3D Tiles Schema 来源](../tests/fixtures/3d-tiles-1.1-schema/SOURCE.md) | Active | schema fixture bundle 的来源 |

## Spec

| ID | 标题 | Status | 用途 |
|---|---|---|---|
| `ICE3-TOOL-SPEC-001` | [多格式 Source Import 适配器与 STEP AP242 首期规格](specs/2026-10-29-source-import-adapters.md) | Approved | 定义 adapter contract、CLI 和首个 STEP 纵向切片 |
| `ICE3-TOOL-SPEC-002` | [IFC 4.3 Source Importer 规格](specs/2026-10-29-ifc-4-3-importer.md) | Approved | 定义 IFC Geometry、空间结构、属性、系统和发布边界 |
| `ICE3-TOOL-SPEC-003` | [FBX Source Importer 规格](specs/2026-10-29-fbx-importer.md) | Approved | 定义 Blender bridge、FBX 层级、实例、属性和发布边界 |
| `ICE3-TOOL-SPEC-004` | [USD Source Importer 规格](specs/2026-10-29-usd-importer.md) | Approved | 定义 USD ASCII/Binary、实例、属性和发布边界 |
| `ICE3-TOOL-SPEC-005` | [OBJ Source Importer 规格](specs/2026-10-29-obj-importer.md) | Approved | 定义 OBJ/MTL、单位 warning、资源边界和发布验证 |
| `ICE3-TOOL-SPEC-006` | [JT Source Importer 规格](specs/2026-10-29-jt-importer.md) | Approved | 定义外部 converter contract、metadata 和发布边界 |

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
| `ICE3-TOOL-PLAN-002` | [多格式 Source Import 与 STEP AP242](plans/2026-10-29-source-import-adapters.md) | Implemented | adapter contract、STEP import 和发布验证的实施记录 |
| `ICE3-TOOL-PLAN-003` | [IFC 4.3 Source Importer](plans/2026-10-29-ifc-4-3-importer.md) | Implemented | IFC Geometry、语义、CLI、fixture 和发布验证的实施记录 |
| `ICE3-TOOL-PLAN-004` | [FBX Source Importer](plans/2026-10-29-fbx-importer.md) | Implemented | Blender bridge、FBX 实例、metadata、CLI 和发布验证的实施记录 |
| `ICE3-TOOL-PLAN-005` | [USD Source Importer](plans/2026-10-29-usd-importer.md) | Implemented | USD bridge、实例、metadata、CLI 和发布验证的实施记录 |
| `ICE3-TOOL-PLAN-006` | [OBJ Source Importer](plans/2026-10-29-obj-importer.md) | Implemented | OBJ/MTL、metadata、CLI 和发布验证的实施记录 |
| `ICE3-TOOL-PLAN-007` | [JT Source Importer](plans/2026-10-29-jt-importer.md) | Implemented | 外部 converter、metadata、CLI 和发布验证的实施记录 |
