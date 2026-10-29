# Content-Addressed 生成缓存

> Document ID: ICE3-TOOL-ADR-003
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 背景

Authoring 污水处理厂 Scene 在 Blender 中构建需要数分钟，后续 preparation 和
partitioning 只需数秒。输入未变化时，重复 test 和 demo build 不应再次支付 cold
authoring cost。

## 决策

按以下信息派生 key，并缓存最终 authored-source GLB：

- generator source file。
- Scene specification content。
- 固定的 Blender version。
- package lockfile。

Cache hit 使用 copy-on-write clone 将不可变 GLB 复制到目标 output。可用
`ICE3_BLENDER_CACHE_DIR` 重定向 cache，并用 `ICE3_BLENDER_SOURCE_CACHE=0` 禁用它。

## 备选方案

- 每次调用都重建 Blender output。
- 按 output filename 或 modification time 缓存。
- 将 100+ MiB generated source Asset 提交到 Git。

这些方案浪费时间、产生 stale output，或违反仓库 Asset-size policy。

## 影响

- 未变化 build 可跳过数分钟 Blender execution。
- generator 或 dependency 的相关变化会使 key 失效。
- Cache 位于仓库之外且不发布。
- Cold cache 仍需要完整 authored build。

## 兼容性

Cache 保存与 clean run 相同的确定性 final GLB。禁用 cache 会保留完整 build path，供
release verification 使用。

## 验证

```bash
npm test -- tests/wastewater/blender-source-cache.test.ts
ICE3_BLENDER_SOURCE_CACHE=0 npm run build:wastewater-demo
```

## 关联文档

- `ICE3-TOOL-GUIDE-002` — [Large-model performance](../guides/large-model-performance.md)
- `ICE3-TOOL-ADR-002` — [确定性原子 Publication](0002-deterministic-atomic-publication.md)
