# 离线标准输出

> Document ID: ICE3-TOOL-ADR-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 背景

Source format conversion 和 Mesh simplification 成本较高；其错误应阻止 publication，
而不是降低 interactive Runtime 质量。生成 Asset 还必须可供标准 GLB 和 Tileset
tooling 使用。

## 决策

所有 source adaptation 和重型 Geometry processing 都在 Toolchain 中执行。Runtime
artifact 使用带 ICE3 Prepared GLB Profile 的 GLB；空间分发使用 OGC 3D Tiles 1.1。

Toolchain 不为任一标准定义私有单体替代格式。

## 备选方案

- 在 Engine 中解析任意 source format。
- 定义私有 file container。
- 在 Rendering 时简化 Geometry。

这些方案增加 Runtime cost 并降低 interoperability。

## 影响

- Conversion error 阻止 build。
- Runtime loading 更小且可预测。
- Format compatibility 明确且可测试。
- Tooling 和 CDN infrastructure 可以检查或托管标准输出。

## 兼容性

`ICE3-DOC-CTR-001` 仍是权威 profile 与 compatibility authority。

## 验证

```bash
npm run typecheck
npm test
```

## 关联文档

- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
