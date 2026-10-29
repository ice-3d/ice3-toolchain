# ICE3 Toolchain 功能指南

> Document ID: ICE3-TOOL-GUIDE-006
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

ICE3 Toolchain 是面向工业 3D 场景的离线 Asset 准备工具链。它把常见工程和 DCC
格式转换成可被 ICE3 Runtime 直接消费的 Prepared GLB，并为大型场景生成可直接用于
流式加载的 OGC 3D Tiles 1.1 hierarchy。

它不是一个 CAD 编辑器，也不是运行时的格式兼容层。格式解析、Geometry 处理、LOD、
空间切分和发布都在构建阶段完成，浏览器只读取准备完成的结果。

## 用户可以获得什么

| 能力 | 用户结果 |
|---|---|
| Source import | 将 7 种主流 source format 转成统一 Prepared GLB |
| Geometry preparation | 三角化、Transform bake、单位统一、Bounds、display color 和可选 edge |
| Semantic metadata | 保留格式原生提供的名称、稳定 Selection ID、属性、层级和实例关系 |
| Validation | 检查 GLB 结构、Prepared profile、Asset budget、统计和引用完整性 |
| Partitioning | 按空间和 triangle/byte budget 切分大型模型 |
| LOD | 生成 proportional/adaptive coarse Geometry、chunk 和可选 semantic proxy |
| Batching | 生成不破坏 semantic identity 的确定性 static render batch |
| Tileset | 发布标准 OGC 3D Tiles 1.1 本地 Tileset |
| Determinism | 相同输入和配置生成 byte-identical output |
| Atomic publication | 校验全部通过后才替换最终 output，失败不留下半成品 |
| Conformance | 7 种格式具有统一 Prepared output、metadata 和浏览器加载验证 |

## 支持的源格式

| 格式 | 扩展名 | 主要能力 | 外部依赖 |
|---|---|---|---|
| glTF 2.0 | `.gltf`、`.glb` | 原生 source reader、compressed mesh input | 无额外依赖 |
| STEP AP242 | `.step`、`.stp` | 三角化 Geometry、装配层级、名称、颜色、单位 conversion | 随包 WASM |
| IFC 4.3 | `.ifc` | 空间层级、GlobalId、Pset、Qto、System、业务属性 | 随包 WASM |
| FBX | `.fbx` | ASCII/Binary、层级、基础颜色、shared instance、custom properties | Binary 需 Blender `5.2.3`；ASCII 使用随包 WASM |
| USD | `.usda`、`.usdc` | USD prim path、层级、基础颜色、实例、custom properties | Blender `5.2.3` |
| OBJ | `.obj` | object/group、三角化、同目录 MTL、display color | 随包 WASM |
| JT | `.jt` | 外部 converter 产出的层级、Geometry、材质和 metadata | 必须配置 `ICE3_JT_CONVERTER` |

### 格式边界

- USD 当前不支持 `.usdz`。
- JT 不内置 parser，真实 JT 文件必须由组织批准的 converter 解析。
- OBJ 没有标准单位，因此按米解释并产生 warning。
- 不承诺旧式格式、软件私有 CAD 格式或全部 vendor extension。
- Animation、skin、morph、camera、light、texture、复杂 PBR 和 Runtime conversion
  不属于当前通用支持范围。

## 输出

### Prepared GLB

`import` 和 `build` 的最终输出是标准 GLB，并带有 ICE3 Prepared profile metadata：

- 米制、right-handed y-up 坐标。
- 已 bake 或规范化的 Transform。
- 稳定 Node identity、display name 和 Selection ID。
- 有界且可验证的 Geometry、Material 和 profile statistic。
- 上游格式提供的业务 metadata。
- 明确声明 Runtime 不需要再次转换。

### Tileset

`partition` 输出：

```text
output/
├── tileset.json
├── parts/
│   ├── part-000.glb
│   └── ...
└── coarse/
    └── ...
```

生成的 hierarchy 遵循 OGC 3D Tiles 1.1，用于相机驱动的流式加载、LOD 切换、
coarse coverage 和 static batching。

## 常用工作流

### 1. 转换一个源模型

```bash
npx ice3-tool import plant.ifc \
  --output prepared-plant.glb \
  --report prepared-plant.report.json \
  --asset-id plant
```

### 2. 验证输出

```bash
npx ice3-tool validate prepared-plant.glb
```

### 3. 切分并生成 LOD

```bash
npx ice3-tool partition plant.ifc \
  --output plant-tiles \
  --asset-id plant \
  --max-triangles 500000 \
  --max-bytes 33554432 \
  --lod \
  --lod-allocation adaptive \
  --render-batch static
```

### 4. 重新生成跨格式 Conformance 示例

```bash
npm run build:conformance
```

这个命令会用 7 种 synthetic source fixture 生成 Prepared GLB、验证统计和 manifest，
并写入相邻 Engine 示例的 `examples/m2/assets/conformance/`。

## 环境变量

| 变量 | 用途 |
|---|---|
| `BLENDER_BIN` | Binary FBX 和 USD 使用的 Blender `5.2.3` executable |
| `ICE3_FBX_TIMEOUT_MS` | FBX bridge timeout |
| `ICE3_USD_TIMEOUT_MS` | USD bridge timeout |
| `ICE3_JT_CONVERTER` | JT 外部 converter executable |
| `ICE3_JT_TIMEOUT_MS` | JT converter timeout |
| `ICE3_BLENDER_CACHE_DIR` | 自定义 authoring source cache |
| `ICE3_BLENDER_SOURCE_CACHE=0` | 禁用 authoring source cache |

## 浏览器验证

Toolchain 生成结果由相邻 Engine 示例实际加载：

```bash
cd ../ice3-engine
nvm use
npm install
npm run dev:example:m2
```

打开 `http://127.0.0.1:8115/` 后可以切换 7 种格式，查看 Prepared Profile、
语义 Node、Geometry/Material 统计和实际 WebGL 画面。

跨仓指南：
[ICE3 Engine 跨格式 Conformance 示例](https://github.com/ice-3d/ice3-engine/blob/main/docs/guides/conformance-example.md)。

## 明确不包含

- 3D 建模、CAD 编辑或 B-Rep 运算。
- 在 Browser、Runtime 或 API 请求中转换源格式。
- 自动下载外部 converter 或网络模型。
- 猜测源文件没有提供的设备 identity、端口和连接关系。
- 对无法映射的复杂材质做无损保留。
- 客户模型、派生 GLB、绝对路径或受限资产进入版本库。

## 关联文档

- `ICE3-TOOL-RM-001` — [Toolchain README](../../README.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](build-validate-partition.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine](glb-to-engine.md)
- `ICE3-TOOL-GUIDE-005` — [Conformance Assets](../../tools/conformance/README.md)
