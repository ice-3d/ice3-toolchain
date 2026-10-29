# 大型模型性能

> Document ID: ICE3-TOOL-GUIDE-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 目标结果

减少重复 preprocessing 时间，并让大型模型 build 保持有界内存，同时不把重型
conversion 移入浏览器。

## 先测量

诊断缓慢 build 时，分别运行每个阶段：

```bash
time node packages/cli/dist/main.js build source.glb --output /tmp/prepared.glb
time node packages/cli/dist/main.js partition source.glb \
  --output /tmp/tiles \
  --asset-id measure \
  --lod
```

人工设计的污水处理厂 sample 近似耗时如下：

- 完整 Prepared GLB：1.9 秒。
- 1.89M triangle partition、LOD 和 static batching：16.7 秒。
- Cold authored Blender Scene generation：9 分 18 秒。

Cold source generator 是主要成本。

## Source Cache

Authored source cache 按 content key 保存最终确定性 GLB output。Key 覆盖 generator
input、Scene specification、固定 Blender version 和 package lockfile。

```bash
# Default platform cache
npm run build:wastewater-demo

# Project-specific cache location
ICE3_BLENDER_CACHE_DIR=/var/tmp/ice3-cache npm run build:wastewater-demo

# Verify a clean generation path
ICE3_BLENDER_SOURCE_CACHE=0 npm run build:wastewater-demo
```

Cache hit 在可用时使用 operating system copy-on-write clone，并报告
`ICE3_WWTP_SOURCE_CACHE_HIT`。

## 内存

Partition command 接受：

```bash
--lod-max-memory-bytes 536870912
```

该值是 Geometry spill 前保留在内存中的 soft boundary。增加该值可减少 temporary I/O，
但不会增加 CPU parallelism。

Authored example build 并行执行 full preparation 与 tiled/LOD generation，并使用
512 MiB workspace。

## 预期结果

Authored source 未变化时，warm full demonstration build 约 17 秒，而不是九分钟。
Source 或 generator 变化会使 cache 失效，需要新的 cold Blender build。

## 关联文档

- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](build-validate-partition.md)
- `ICE3-TOOL-ADR-003` — [Content-addressed generation cache](../decisions/0003-content-addressed-generation-cache.md)
