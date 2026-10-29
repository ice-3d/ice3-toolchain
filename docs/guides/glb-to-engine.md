# 从 GLB 到 Engine 的完整接入流程

> Document ID: ICE3-TOOL-GUIDE-003
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 目标结果

把一份工业 GLB 转换为细粒度 Prepared GLB、层级粗模和标准 OGC 3D Tiles 1.1
Tileset，并由 ICE3 Engine 按 camera 增量加载。

```text
source GLB
    ↓ inspect
source validation
    ↓ partition
parts/*.glb + coarse/*.glb + tileset.json
    ↓ 静态发布
/assets/<asset-id>/tileset.json
    ↓ ICETilesetLoader.open()
coarse coverage → camera 局部细化 → fine GLB
```

所有 source parsing、空间分区、简化、粗模生成和 GLB packing 都在 Toolchain 中完成。
Engine 只读取已经准备好的 GLB 和 Tileset，不在浏览器中重切或简化 Geometry。

## 前置条件

- Node.js 24.22.1 LTS 和 npm 11 或更高版本。
- 已按 [README](../../README.md) 完成 `nvm use`、`npm install` 和 `npm run build`。
- source 是当前支持的 glTF 2.0 JSON 或 GLB。
- 输出目录在发布前不存在；Toolchain 会自行创建并原子发布。

## 1. 检查 source

```bash
node packages/cli/dist/main.js inspect path/to/source.glb --json
```

先确认 `errors` 为空。`inspect` 会读取 source、检查当前支持范围并汇总预算指标，
避免在大型模型完成全部构建后才暴露格式问题。

## 2. 生成细模、粗模和 Tileset

下面的配置启用 hierarchical LOD、adaptive 粗模预算、静态 render batch 和粗模
chunk：

```bash
node packages/cli/dist/main.js partition path/to/source.glb \
  --output /tmp/plant \
  --asset-id plant \
  --max-triangles 120000 \
  --max-bytes 16777216 \
  --budget interactive-desktop-v1 \
  --lod \
  --lod-allocation adaptive \
  --lod-ratio 0.5 \
  --lod-max-triangles 240000 \
  --lod-min-unit-triangles 8 \
  --lod-max-memory-bytes 536870912 \
  --coarse-chunk-max-bytes 8388608 \
  --render-batch static \
  --skip-edges \
  --json
```

关键参数：

| 参数 | 作用 |
|---|---|
| `--max-triangles` | 规划叶子 Tile 时每片的三角形上限 |
| `--max-bytes` | 叶子 GLB 发布前的字节上限 |
| `--lod` | 为内部 Tile 生成粗模；未启用时不生成 `coarse/` |
| `--lod-allocation` | `proportional` 使用统一比例；`adaptive` 按设备误差曲线分配预算 |
| `--lod-ratio` | 粗模名义三角形比例；adaptive 模式仍用它计算当前 Tile 的预算上限 |
| `--lod-max-triangles` | 单个内部 Tile 粗模的三角形上限 |
| `--lod-min-unit-triangles` | 单个设备粗模保留的最低三角形数 |
| `--lod-max-memory-bytes` | LOD 中间 Geometry 在写入 temporary file 前的 soft memory boundary |
| `--coarse-chunk-max-bytes` | 单个粗模内容的 chunk 目标大小 |
| `--semantic-proxy auto` | 仅在 adaptive 模式下允许用保守 OBB 或 cylinder 参与粗模候选选择 |

## GLB 如何切分

当前 pipeline 不切割单个 mesh。基本的原子单元是 source 中有 Geometry 的
semantic node；引用同一 source mesh 的多个节点会进入同一个原子组，避免重复几何。

空间树按确定性的最长轴中位切分生成：

1. 计算每个原子单元的世界包围盒和中心。
2. 在中心跨度最大的轴上排序；同坐标时按稳定节点 ID 排序。
3. 按三角形累计数量选择近似中点，递归拆成左右子树。
4. 当前子树满足 `--max-triangles` 后先生成 Prepared GLB。
5. 如果实际 GLB 超过 `--max-bytes` 且仍有多个语义单元，则继续切分并重建。
6. 单个语义单元自身超过 `--max-bytes` 时以
   `ICE3_TOOL_PARTITION_UNSPLITTABLE` 失败，不发布半成品。

每个叶子 GLB 都烘焙世界变换，并保留稳定的 equipment Selection ID。因此叶子可以
独立下载和加载，不依赖其他分区的场景祖先。

## 粗模如何拆分和表达

启用 `--lod` 后，每个有子节点的内部空间 Tile 会生成一份覆盖该子树全部设备的粗模。
叶子 Tile 仍只用 fine GLB。Tileset 中所有节点使用标准 `REPLACE`：

- camera 的 screen-space error 较大时，显示内部 Tile 的粗模。
- 局部视图满足误差阈值后，用完整可用的子级 coverage 替换父级粗模。
- 子级未完成或失败时继续显示父级粗模，不产生可见空洞。
- `geometricError` 使用世界米制误差，由粗模实测简化误差和子节点误差共同决定。

粗模自身超过 `--coarse-chunk-max-bytes` 时，会继续按语义单元拆成多个 Prepared
GLB。它们仍属于同一个 Tileset 节点，通过标准 `contents` 数组列出，不是另一层
私有 LOD。单个设备无法继续拆分时保留完整语义单元，并可在 Toolchain statistics
中通过 `oversizedCoarseChunks` 观察。

`proportional` 适合需要稳定、可预测结果的初始配置。`adaptive` 会为设备采样不同的
三角形和误差组合，把预算优先分配给轮廓贡献更大的设备；它计算更多，但通常能在相同
目标预算下获得更均匀的视觉误差。

## 输出目录

一个典型输出如下：

```text
plant/
├── tileset.json
├── parts/
│   ├── part-000.glb
│   ├── part-001.glb
│   └── ...
└── coarse/
    ├── group-root.glb
    ├── group-root-0.glb
    ├── group-root-1.glb
    └── group-root-1/
        ├── part-000.glb
        └── part-001.glb
```

具体文件数量由模型、空间树和预算决定：

- `parts/part-NNN.glb` 是可独立加载的叶子 fine content。
- `coarse/<tile-id>.glb` 是某个内部 Tile 的单文件粗模。
- `coarse/<tile-id>/part-NNN.glb` 是该内部 Tile 因 chunk budget 继续拆出的多个
  coarse content。
- `tileset.json` 是唯一入口，内部 URI 全部为相对于自身目录的路径。

不要单独发布 `parts/` 或 `coarse/` 中的文件，也不要重命名目录后手工修改 Tileset
URI。整个输出目录必须作为一个 Asset root 原样部署。

## 3. 发布到 Engine 静态 Asset 目录

把完整输出目录放到 Engine example 的 static asset root 下，例如：

```text
examples/m1/assets/plant/
├── tileset.json
├── parts/
└── coarse/
```

示例仓库中 `examples/m1/` 是开发服务器的 static root，因此该目录对应的 URL 前缀是
`/assets/`。

开发服务器映射到 `/assets/` 后，Tileset URL 为：

```text
/assets/plant/tileset.json
```

部署时必须保留 `parts/`、`coarse/` 和 `tileset.json` 的相对层级。静态服务器需要
能够读取同源目录中的 `.json` 和 `.glb` 文件；如果 Asset 放在另一个 origin，则必须
正确配置 CORS。

## 4. 在 Engine 中加载

```ts
import {
  ICE3,
  ICEOrbitController,
  ICEPerspectiveCamera,
  ICETilesetLoader,
} from 'ice3';

const host = document.querySelector<HTMLElement>('#stage');
if (!host) throw new Error('stage element is required');

const engine = new ICE3().init(host);
engine.setBackgroundColor('#000000');

const camera = new ICEPerspectiveCamera({
  id: 'camera',
  fov: 45,
  near: 0.1,
  far: 1000,
  position: [30, 20, 40],
  target: [0, 0, 0],
});
const orbit = new ICEOrbitController(engine, camera).start();

const loader = new ICETilesetLoader(engine, {
  camera,
  maxConcurrentTiles: 2,
  maxResidentTiles: 24,
  maxResidentBytes: 256 * 1024 * 1024,
  maxCommitsPerFrame: 1,
  maxScreenSpaceErrorPixels: 16,
});
const asset = await loader.open('/assets/plant/tileset.json');

engine.setScene(asset.scene).setCamera(camera).start();
await asset.whenReady();
await asset.whenIdle();

// 页面结束时由应用释放 Tileset、camera controller 和 engine。
asset.dispose();
orbit.dispose();
engine.destroy();
```

`open()` 只等待 `tileset.json` 校验完成并建立空统一 Scene，不等待全部 GLB。第一个
coverage 内容提交后 `whenReady()` resolve；`whenIdle()` 等待当前 camera work set
完成。camera 移动后可以形成新的工作集，因此该 API 有意不提供“所有 Tile 永远
加载完成”的全局 promise。

## 验证结果

在浏览器 Network 面板中应看到：

1. 首先请求 `/assets/plant/tileset.json`。
2. 全景阶段优先请求根粗模或必要的 coarse chunk。
3. 聚焦局部区域后请求对应的 `parts/*.glb`，未聚焦区域继续保留粗模。
4. 子级切换完成后父级粗模释放；请求失败时已有 coverage 继续显示。

也可以通过 Tileset handle 检查 `stats.resident`、`stats.lod.coarseResident`、
`stats.lod.fineResident`、`stats.lod.fallback` 和 `tileState(tileId)`。诊断信息不依赖
私有旁路文件。

## 常见问题

| 现象 | 检查 |
|---|---|
| `tileset.json` 返回 404 | 确认完整输出目录映射到了 `/assets/plant/` |
| Tileset 已加载但没有内容 | 检查 `content.uri` 指向的 relative path 和目标文件是否都发布 |
| 一直只有粗模 | 降低 `maxScreenSpaceErrorPixels`，或将 camera 聚焦到目标设备 |
| 局部切换为空 | 检查对应 `parts/*.glb` 是否可访问，以及 Network 中的 GLB validation error |
| 粗模 chunk 仍偏大 | 检查 statistics 的 `oversizedCoarseChunks`；无法继续拆分通常是一个语义设备本身超限 |
| 选中状态在 LOD 切换后丢失 | 确认 fine 和 coarse GLB 都保留相同的 Selection ID contract |

## 边界

- Runtime 不执行 mesh simplification、空间切分、source conversion 或必需 compression
  decoding。
- 当前只支持显式本地 Cartesian Tileset 子集，不支持 external Tileset、`region`、
  implicit tiling、animation、skins、morph targets 或 textures。
- 真实客户 source、partition output、粗模、截图和包含本地路径的 report 不得进入
  Git、测试、示例、日志或发布包。

## 关联文档

- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](build-validate-partition.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-ENG-GUIDE-002` — [Engine Asset 加载](https://github.com/ice-3d/ice3-engine/blob/main/docs/guides/asset-loading.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
