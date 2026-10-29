# 构建、验证与拆分 Asset

> Document ID: ICE3-TOOL-GUIDE-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 目标结果

在不修改 source file、失败不留部分输出的前提下，生成已校验 Prepared GLB 或 spatial
Tileset。

## 前置条件

在仓库根目录执行以下命令后运行：

```bash
nvm use
npm install
npm run build
```

## 检查

```bash
node packages/cli/dist/main.js inspect path/to/source.glb --json
```

Inspect 报告聚合 source 统计，并在长时间 build 开始前校验 source support。

## 构建完整 Prepared GLB

```bash
node packages/cli/dist/main.js build path/to/source.glb \
  --output /tmp/prepared/asset.glb \
  --report /tmp/prepared/asset.report.json \
  --asset-id example-asset \
  --budget interactive-desktop-v1 \
  --skip-edges
```

Output path 必须是文件。Report 可选。Hard budget failure 不发布 GLB。

## 验证

```bash
node packages/cli/dist/main.js validate /tmp/prepared/asset.glb
```

预期：exit code 为 `0`，JSON mode 下 `errors` 数组为空。

## Partition

```bash
node packages/cli/dist/main.js partition path/to/source.glb \
  --output /tmp/partitioned \
  --asset-id example-asset \
  --max-triangles 120000 \
  --max-bytes 16777216 \
  --lod \
  --lod-allocation adaptive \
  --lod-ratio 0.5 \
  --lod-max-triangles 240000 \
  --lod-min-unit-triangles 8 \
  --lod-max-memory-bytes 536870912 \
  --render-batch static \
  --coarse-chunk-max-bytes 8388608 \
  --skip-edges
```

Output directory 不得预先存在。成功后创建 `tileset.json`、fine partition 和请求的
coarse content。

切分算法、粗模 chunk、Tileset 层级以及 Engine loading 的完整流程见
[从 GLB 到 Engine 的完整接入流程](glb-to-engine.md)。

## 预期结果

- 每个输出 GLB 都通过 validation。
- Tileset content URL 为相对路径，并位于 output directory 内。
- Partition triangle total 与 source 一致。
- Coarse content 保留 equipment Selection ID。
- Failure 后不残留 temporary output。

## 关联文档

- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-GUIDE-002` — [大型模型性能](large-model-performance.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine 的完整接入流程](glb-to-engine.md)
