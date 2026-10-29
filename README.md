# ICE3 Toolchain

> Document ID: ICE3-TOOL-RM-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

ICE3 Toolchain 为 ICE3 Runtime 准备大型工业 source model，在浏览器外完成所有 source
parsing、normalization、simplification、spatial partitioning 和 GLB packing。

Runtime 输出保持为带 ICE3 Prepared GLB Profile 的标准 GLB；需要流式加载时，输出
OGC 3D Tiles 1.1 hierarchy。

## 能力

| 领域 | 当前能力 |
|---|---|
| 输入 | glTF 2.0 JSON 和受支持 mesh-compression extension 的 GLB |
| 准备 | Geometry normalization、平光 display color、transform、profile metric 和可选 edge |
| 验证 | GLB 结构检查、Asset budget、确定性报告和 Tileset validation |
| Partitioning | 空间 leaf、hierarchical LOD、coarse chunk 和稳定 semantic ID |
| LOD | Proportional/adaptive device budget，以及可选 semantic proxy |
| Batch | 确定性 static render batch |
| 发布 | 原子 publication 和安全的 Asset 目录替换 |
| 构建加速 | Content-addressed Blender source cache 和并行后处理 |

## 快速开始

运行要求：

- Node.js 24.22.1 LTS
- npm 11 或更高版本
- 仅在重新构建人工设计的污水处理厂 source 时需要 Blender 5.2.3

```bash
git clone https://github.com/ice-3d/ice3-toolchain.git
cd ice3-toolchain
nvm use
npm install
npm run build
```

作为 npm package 安装：

```bash
npm install --save-dev @ice3/toolchain
npx ice3-tool inspect tests/fixtures/minimal.gltf --json
```

检查、构建、验证并拆分 Asset：

```bash
node packages/cli/dist/main.js inspect tests/fixtures/minimal.gltf --json

node packages/cli/dist/main.js build tests/fixtures/cube.gltf \
  --output /tmp/prepared-cube.glb \
  --report /tmp/prepared-cube.report.json \
  --asset-id prepared-cube \
  --budget interactive-desktop-v1

node packages/cli/dist/main.js validate /tmp/prepared-cube.glb

node packages/cli/dist/main.js partition tests/fixtures/partition-source.gltf \
  --output /tmp/partition-result \
  --asset-id partition-demo \
  --max-triangles 500000 \
  --max-bytes 33554432
```

每条命令都会校验输入，并拒绝发布不完整输出。完整选项和默认值见
[CLI 参考](docs/reference/cli.md)。

## 污水处理厂演示

重新构建完整的合成污水处理厂 Asset 集：

```bash
npm run build:wastewater-demo
```

该命令生成 authoring source、完整 Prepared preview、细粒度 partition、粗模 LOD、
static batch、validation report 和最终 Tileset。只有全部产物都通过检查后，才会替换
engine example 目录。

生成的 Scene 完全虚构。单体 source 和 prepared preview 保留在被 Git 忽略的本地路径，
版本库只提交 runtime slices。

## 构建性能

Authoring source generator 使用 content-addressed cache；缓存 key 包含 generator
source、Scene specification、Blender version 和 package lockfile。

```bash
# Override the cache directory
ICE3_BLENDER_CACHE_DIR=/tmp/ice3-cache npm run build:wastewater-demo

# Force a clean Blender generation
ICE3_BLENDER_SOURCE_CACHE=0 npm run build:wastewater-demo
```

Source 生成后，full-model preparation 与 tiled/LOD pipeline 并行执行。Authoring build
使用 512 MiB 的 LOD workspace。详见
[大型模型性能](docs/guides/large-model-performance.md)。

## 验证

```bash
npm run docs:check
npm run test:architecture
npm run typecheck
npm run typecheck:tools
npm test
npm run verify
```

## 文档

- [文档索引](docs/README.md)
- [处理架构](docs/architecture.md)
- [构建、验证与拆分](docs/guides/build-validate-partition.md)
- [从 GLB 到 Engine 的完整接入流程](docs/guides/glb-to-engine.md)
- [AI 控制 Blender 建模工作流](docs/guides/ai-blender-modeling.md)
- [大型模型性能](docs/guides/large-model-performance.md)
- [CLI 参考](docs/reference/cli.md)
- [架构决策](docs/decisions/README.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

跨仓库格式与兼容性的权威 contract 是
[Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md).

## AI 辅助开发

本项目在设计和实现过程中大量使用了 AI 辅助开发。AI 参与建模的安全集成方式见
[AI 控制 Blender 建模工作流](docs/guides/ai-blender-modeling.md)；AI 不直接执行任意
Blender Python，也不进入 Browser Runtime。

## 许可证

ICE3 自有代码和文档采用 [MIT License](LICENSE) 许可。
