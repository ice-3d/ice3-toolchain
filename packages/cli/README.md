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
npx ice3-tool import plant.usdc --output prepared-usd.glb --asset-id usd-plant
npx ice3-tool import equipment.obj --output prepared-obj.glb --asset-id obj-equipment
ICE3_JT_CONVERTER=/path/to/converter npx ice3-tool import assembly.jt --output prepared-jt.glb --asset-id jt-equipment
npx ice3-tool inspect source.glb --json
npx ice3-tool build source.glb --output prepared.glb
npx ice3-tool validate prepared.glb
npx ice3-tool partition source.glb --output tiles --asset-id example
```

当前 source import 支持 STEP AP242、IFC 4.3、FBX、USD ASCII/Binary、OBJ 和 JT。转换在本机离线完成，输出标准
source GLB 后继续进入 Prepared GLB 与 Tileset pipeline；Browser Runtime 不需要任何
CAD、DCC 或 WASM 转换依赖。IFC、FBX 和 USD 的层级、业务属性、实例和 Selection metadata
会保留在 Prepared GLB。

FBX Binary 需要本机安装 Blender `5.2.3`，并通过 `BLENDER_BIN` 指向 executable。
FBX ASCII 使用随包安装的进程内 WASM fallback。

USD `.usda` 和 `.usdc` 需要本机安装 Blender `5.2.3`，通过 `BLENDER_BIN` 指向
executable；`ICE3_USD_TIMEOUT_MS` 可设置 bridge timeout。浏览器不加载 USD parser。

OBJ 在 Node process 内完成转换，只读取同目录相对 MTL。OBJ 没有标准单位，默认按米
解释并返回 warning；复杂材质和 texture 不支持。

JT 使用 `ICE3_JT_CONVERTER` 指向组织批准的离线转换器，并通过 `ICE3_JT_TIMEOUT_MS`
控制超时。Converter 输出标准 GLB；其 binary 不随 npm package 分发。

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
格式、输出和边界总览见
[Toolchain 功能指南](https://github.com/ice-3d/ice3-toolchain/blob/main/docs/guides/capabilities.md)。

本项目采用 MIT License，第三方依赖声明随包发布。
