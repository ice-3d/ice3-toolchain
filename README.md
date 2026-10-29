# ICE3 Toolchain

> Document ID: ICE3-TOOL-RM-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

ICE3 Toolchain 为 ICE3 Runtime 准备大型工业 source model，在浏览器外完成 source
parsing、Geometry normalization、LOD simplification、spatial partitioning、render
batching 和 GLB packing。

Runtime 输出保持为带 ICE3 Prepared GLB Profile 的标准 GLB；需要流式加载时，输出
OGC 3D Tiles 1.1 hierarchy。

**它解决的是“把客户已有的工业模型稳定接入 Runtime”，而不是做 CAD 编辑工具。**
功能、依赖、输出和边界总览见
[ICE3 Toolchain 功能指南](docs/guides/capabilities.md)。

## 能力

| 领域 | 当前能力 |
|---|---|
| 输入 | glTF 2.0、STEP AP242、IFC 4.3、FBX、USD、OBJ、JT |
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
- Binary FBX、USD 和污水处理厂 authoring rebuild 需要 Blender 5.2.3
- JT 需要部署方提供 `ICE3_JT_CONVERTER`

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

仓库内开发时检查、构建、验证并拆分 Asset：

```bash
node --import tsx packages/cli/src/main.ts inspect tests/fixtures/minimal.gltf --json

node --import tsx packages/cli/src/main.ts import tests/fixtures/step/synthetic-skid.step \
  --output /tmp/prepared-skid.glb \
  --report /tmp/prepared-skid.report.json \
  --asset-id synthetic-skid

node --import tsx packages/cli/src/main.ts import tests/fixtures/ifc/synthetic-plant.ifc \
  --output /tmp/prepared-ifc-plant.glb \
  --report /tmp/prepared-ifc-plant.report.json \
  --asset-id synthetic-ifc-plant

node --import tsx packages/cli/src/main.ts import tests/fixtures/fbx/synthetic-binary.fbx \
  --output /tmp/prepared-fbx.glb \
  --report /tmp/prepared-fbx.report.json \
  --asset-id synthetic-fbx

node --import tsx packages/cli/src/main.ts import tests/fixtures/usd/synthetic-plant.usda \
  --output /tmp/prepared-usd.glb \
  --report /tmp/prepared-usd.report.json \
  --asset-id synthetic-usd

node --import tsx packages/cli/src/main.ts import tests/fixtures/obj/synthetic-plant.obj \
  --output /tmp/prepared-obj.glb \
  --report /tmp/prepared-obj.report.json \
  --asset-id synthetic-obj

ICE3_JT_CONVERTER=/path/to/approved-jt-converter \
  node --import tsx packages/cli/src/main.ts import assembly.jt \
  --output /tmp/prepared-jt.glb \
  --report /tmp/prepared-jt.report.json \
  --asset-id jt-assembly

node --import tsx packages/cli/src/main.ts build tests/fixtures/cube.gltf \
  --output /tmp/prepared-cube.glb \
  --report /tmp/prepared-cube.report.json \
  --asset-id prepared-cube \
  --budget interactive-desktop-v1

node --import tsx packages/cli/src/main.ts validate /tmp/prepared-cube.glb

node --import tsx packages/cli/src/main.ts partition tests/fixtures/partition-source.gltf \
  --output /tmp/partition-result \
  --asset-id partition-demo \
  --max-triangles 500000 \
  --max-bytes 33554432

node --import tsx packages/cli/src/main.ts partition tests/fixtures/ifc/synthetic-plant.ifc \
  --output /tmp/ifc-tiles \
  --asset-id synthetic-ifc-plant
```

每条命令都会校验输入，并拒绝发布不完整输出。完整选项和默认值见
[CLI 参考](docs/reference/cli.md)。

## Source 格式

| 阶段 | 格式 | 支持范围 |
|---|---|---|
| 当前 | glTF 2.0 `.gltf` / `.glb` | 原生 source reader；可选 mesh compression |
| 当前 | STEP AP242 `.step` / `.stp` | 三角化 Geometry、装配层级、节点名称、颜色和米制 conversion |
| 当前 | IFC 4.3 `.ifc` | 空间结构、产品 identity、Property Set、Quantity Set、System membership |
| 当前 | FBX `.fbx` | ASCII/Binary 层级、Geometry、基础颜色、实例和 custom properties |
| 当前 | USD `.usda` / `.usdc` | 层级、Geometry、基础颜色、实例和 custom properties |
| 当前 | OBJ `.obj` | Geometry、object/group 名称和同目录基础 MTL |
| 当前 | JT `.jt` | 通过组织批准的离线 converter 接入层级、Geometry、材质和 metadata |

`import` 将源模型转换为临时标准 source GLB，再复用现有 validation、Prepared GLB、
partition、LOD 和 Tileset pipeline。Browser Runtime 不加载任何 source format，也不
执行格式转换。

`partition` 对 glTF/GLB 直接读取；对 STEP、IFC、FBX、USD、OBJ 和 JT 会先在临时目录执行对应
importer，完成切分与 LOD 后删除中间 source GLB。

STEP import 保证 L1 Mesh/Transform/Bounds 和 L2 Unit/Hierarchy/Name/Color。Source 缺失
设备 identity、端口和连接时，不猜测业务语义。未知格式、不可用 adapter、空 Geometry
和无效 Prepared GLB 分别返回稳定的 `ICE3_TOOL_IMPORT_*` Diagnostic。

IFC import 额外提供 L3 语义：IFC `GlobalId`、Pset、Qto 和 Distribution System 会进入
Prepared GLB metadata。大型 georeferenced model 使用统一的 document-local origin，
避免世界坐标压缩到 float32 后丢失相对间距。旧 IFC schema、未知长度单位、无效
Geometry 和截断文件会稳定失败。

FBX Binary 使用固定的 Blender `5.2.3` headless bridge；ASCII FBX 使用进程内 WASM
fallback。Blender 是可选系统依赖，不进入 npm package 或 Runtime。通过 `BLENDER_BIN`
指定 executable，通过 `ICE3_FBX_TIMEOUT_MS` 设置 bridge timeout。对象层级、基础颜色、
shared-mesh instance 和可序列化 custom properties 会保留在 Prepared GLB metadata。

USD source 通过固定版本 Blender `5.2.3` headless bridge 导入 `.usda` 和 `.usdc`。
`ICE3_USD_TIMEOUT_MS` 控制 bridge timeout；`BLENDER_BIN` 指定可执行文件。层级、
基础颜色、shared-mesh instance、USD prim path 和可序列化 custom properties 会写入
Prepared GLB metadata。首期不支持 `.usdz`、animation、camera、light、复杂材质和
Runtime conversion。

OBJ adapter 在进程内完成 Geometry 和多边形三角化，并只读取同目录下的安全相对 MTL
sidecar。OBJ 没有标准单位，因此固定按米解释并返回
`ICE3_TOOL_OBJ_UNIT_ASSUMED_METERS` warning；启用 `--warnings-as-errors` 时会阻止
publication。复杂材质、texture、绝对路径、URL 和目录外资源不支持。

JT 不内置 parser。通过 `ICE3_JT_CONVERTER` 指向组织批准的离线转换器，调用参数固定为
`--input` 和 `--output`；`ICE3_JT_TIMEOUT_MS` 控制 timeout。Converter 必须输出米制、
right-handed y-up 标准 GLB，并可把 object ID、assembly path 和 properties 写入
`node.extras.jt`。Converter 不进入 npm package、Runtime 或版本库 release tarball。

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

## 跨格式 Conformance

`npm run build:conformance` 使用七种 synthetic source fixture 生成 Prepared GLB 和
`manifest.json`，并输出到相邻 Engine 示例的 `examples/m2/assets/conformance/`。
统一测试同时验证 Profile、预期 Node、Geometry、Material 和 byte determinism。
方法和失败样例矩阵见 [Conformance Assets](tools/conformance/README.md)。对应浏览器示例位于
[ICE3 Engine Conformance 示例](https://github.com/ice-3d/ice3-engine/blob/main/docs/guides/conformance-example.md)。

## 构建性能

Authoring source generator 使用 content-addressed cache；缓存 key 包含 generator
source、Scene specification、Blender version 和 package lockfile。

```bash
# 指定不同的缓存目录
ICE3_BLENDER_CACHE_DIR=/tmp/ice3-cache npm run build:wastewater-demo

# 强制重新生成
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
- [功能指南](docs/guides/capabilities.md)
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
