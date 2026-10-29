# ICE3 Toolchain npm 包

> Document ID: ICE3-TOOL-RM-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

`@ice3/toolchain` 在浏览器外准备大型工业 GLB，提供 inspect、build、validate 和
partition 命令，并生成 Prepared GLB 与 OGC 3D Tiles 1.1 Tileset。

## 安装

```bash
npm install --save-dev @ice3/toolchain
```

## 命令

```bash
npx ice3-tool inspect source.glb --json
npx ice3-tool build source.glb --output prepared.glb
npx ice3-tool validate prepared.glb
npx ice3-tool partition source.glb --output tiles --asset-id example
```

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
