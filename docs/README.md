# ICE3 Toolchain Documentation Index

> Document ID: ICE3-TOOL-IDX-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Start Here

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-TOOL-RM-001` | [ICE3 Toolchain](../README.md) | Active | Build, validation, partition, and asset overview |
| `ICE3-TOOL-POL-001` | [Repository policy](../AGENTS.md) | Active | Toolchain architecture and delivery rules |
| `ICE3-TOOL-ARC-001` | [Toolchain Architecture](architecture.md) | Active | Pipeline boundaries, determinism, memory, and failure behavior |
| `ICE3-TOOL-IDX-002` | [Architecture Decisions](decisions/README.md) | Active | Index of toolchain design decisions |

## Guides

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-TOOL-GUIDE-001` | [Build, Validate, and Partition](guides/build-validate-partition.md) | Active | Operate the main preprocessing commands |
| `ICE3-TOOL-GUIDE-002` | [Large-Model Performance](guides/large-model-performance.md) | Active | Use caching, memory, and timing diagnostics |

## Reference And Notices

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-TOOL-REF-001` | [CLI Reference](reference/cli.md) | Active | Commands, options, defaults, and failure behavior |
| `ICE3-TOOL-NOTICE-001` | [Third-Party Notices](../THIRD_PARTY_NOTICES.md) | Active | Upstream attribution and license scope |
| `ICE3-TOOL-REF-002` | [OGC 3D Tiles Schema Source](../tests/fixtures/3d-tiles-1.1-schema/SOURCE.md) | Active | Provenance for the schema fixture bundle |

## Decisions

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-TOOL-ADR-001` | [Offline Standard Output](decisions/0001-offline-standard-output.md) | Active | Keep conversion outside runtime |
| `ICE3-TOOL-ADR-002` | [Deterministic Atomic Publication](decisions/0002-deterministic-atomic-publication.md) | Active | Publish only complete repeatable output |
| `ICE3-TOOL-ADR-003` | [Content-Addressed Generation Cache](decisions/0003-content-addressed-generation-cache.md) | Active | Avoid repeated Blender source generation |

## Implementation Plans

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-TOOL-PLAN-001` | [M1 GLB Pipeline](plans/2026-10-27-toolchain-m1-glb-pipeline.md) | Implemented | Historical implementation record for the core GLB pipeline |
