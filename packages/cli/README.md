# ICE3 Toolchain npm 包

> Document ID: ICE3-TOOL-RM-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

`@ice3/toolchain` 在浏览器外准备大型工业模型，提供 import、inspect、build、
validate 和 partition 命令，并生成 Prepared GLB 与 OGC 3D Tiles 1.1 Tileset。

## 安装

```bash
npm install --save-dev @ice3/toolchain
```

## 命令

```bash
npx ice3-tool import source.step --output prepared.glb --asset-id example
npx ice3-tool import plant.ifc --output prepared-plant.glb --asset-id plant
npx ice3-tool import equipment.fbx --output prepared-equipment.glb --asset-id equipment
npx ice3-tool inspect source.glb --json
npx ice3-tool build source.glb --output prepared.glb
npx ice3-tool validate prepared.glb
npx ice3-tool partition source.glb --output tiles --asset-id example
```

当前 source import 支持 STEP AP242、IFC 4.3 和 FBX。转换在本机离线完成，输出标准
source GLB 后继续进入 Prepared GLB 与 Tileset pipeline；Browser Runtime 不需要任何
CAD、DCC 或 WASM 转换依赖。IFC 和 FBX 的层级、业务属性、实例和 Selection metadata
会保留在 Prepared GLB。

FBX Binary 需要本机安装 Blender `5.2.3`，并通过 `BLENDER_BIN` 指向 executable。
FBX ASCII 使用随包安装的进程内 WASM fallback。

作为程序入口使用：

```ts
import { runCli } from '@ice3/toolchain';

const exitCode = await runCli([
  'validate',
  'prepared.glb',
]);
```

运行要求：Node.js 24.22.1 LTS 或兼容版本。

完整文档见
[Toolchain 文档](https://github.com/ice-3d/ice3-toolchain/blob/main/README.md)。

本项目采用 MIT License，第三方依赖声明随包发布。
