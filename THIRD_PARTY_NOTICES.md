# 第三方声明

> Document ID: ICE3-TOOL-NOTICE-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## OGC 3D Tiles 1.1 JSON Schema

`tests/fixtures/3d-tiles-1.1-schema/` 中的文件复制自 OGC 22-025r4，*OGC 3D Tiles
1.1* 的 Annex B。

Copyright © 2023 Open Geospatial Consortium。

OGC 材料的使用受 OGC Document License Agreement 约束：
https://www.ogc.org/license

本仓库的 MIT License 适用于 ICE3 自有代码和文档，但不替换这些 OGC schema fixture
的上游许可证。

## STEP Adapter Runtime

`@ice3/toolchain` 的 STEP adapter 依赖：

| 项目 | 版本 | 许可证 |
|---|---|---|
| `occt-import-js` | `0.0.23` | LGPL-2.1 |

该依赖提供 STEP 解析、B-Rep 三角化和 CAD/WASM 运行时。发布 package 将
`occt-import-js` 保留为独立 runtime dependency，不把其 WASM binary 嵌入 ICE3 自有
source。安装后，相关文件位于 package 的 `dist/` 目录：

- `dist/occt-import-js.js`
- `dist/occt-import-js.wasm`
- `dist/license.occt-import-js.txt`
- `dist/license.occt.txt`

精确对应版本的完整源码、构建文件和许可证可从 npm registry 分发的 package tarball
取得：

```bash
npm pack occt-import-js@0.0.23
```

ICE3 未修改该依赖。其 LGPL-2.1 义务由独立依赖及其许可证文本承担，不改变 ICE3 自有
代码采用的 MIT License。

## IFC Adapter Runtime

`@ice3/toolchain` 的 IFC 4.3 adapter 依赖：

| 项目 | 版本 | 许可证 |
|---|---|---|
| `web-ifc` | `0.0.78` | MPL-2.0 |

该依赖提供 IFC schema、空间结构、属性和 Geometry 解析。发布 package 将 `web-ifc`
保留为独立 runtime dependency，不把其 Node WASM binary 嵌入 ICE3 自有 source。
安装后，相关文件位于依赖 package 根目录：

- `web-ifc-api-node.js`
- `web-ifc-node.wasm`
- `LICENSE.md`

精确对应版本的 package 和许可证可从 npm registry 取得：

```bash
npm pack web-ifc@0.0.78
```

对应源代码和构建配置位于：

https://github.com/ThatOpen/engine_web-ifc

ICE3 未修改该依赖。其 MPL-2.0 义务适用于该独立依赖及其文件，不改变 ICE3 自有代码采用
的 MIT License。

## DCC Adapter Dependencies

### Blender

FBX Binary 和 USD adapter 使用外部 Blender `5.2.3` 完成 DCC import 和 raw GLB export。
Blender executable 不随 ICE3 package 分发，用户需自行安装并配置 `BLENDER_BIN`。
ICE3 只调用仓库内白名单脚本，不修改或重新分发 Blender。

### assimpjs

FBX ASCII adapter 依赖：

| 项目 | 版本 | 许可证 |
|---|---|---|
| `assimpjs` | `0.0.10` | MIT |

该依赖以独立 runtime dependency 安装，提供进程内 WASM 转换。相关文件位于依赖
package 的 `dist/` 目录：

- `assimpjs.js`
- `assimpjs.wasm`
- `LICENSE.md`

精确对应版本的 package 和许可证可从 npm registry 取得：

```bash
npm pack assimpjs@0.0.10
```

上游源代码和构建配置位于：

https://github.com/kovacsv/assimpjs

ICE3 未修改该依赖。

## 关联文档

- `ICE3-TOOL-IDX-001` — [文档索引](docs/README.md)
- `ICE3-TOOL-REF-002` — [OGC schema 来源](tests/fixtures/3d-tiles-1.1-schema/SOURCE.md)
