# JT Source Importer 规格

> Document ID: ICE3-TOOL-SPEC-006
>
> Status: Approved
>
> Owner: ICE3 Toolchain maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 已批准 |
| 版本 | 1.0 |
| 日期 | 2026-10-29 |
| 适用范围 | `ice3-toolchain` JT source import、CLI、切片和发布验证 |

## 1. 目标

为 Toolchain 增加受控 JT adapter。由于当前没有可随 MIT 工具链分发、许可证清晰且在
Node.js 中稳定运行的 JT parser，JT source parsing 通过组织批准的离线 converter
bridge 完成；Toolchain 负责调用协议、超时、输出校验、metadata canonicalization 和
后续 Prepared GLB/Tileset 流程。

## 2. 支持范围

- `.jt` source。
- 外部 converter 生成的层级、Transform、三角 Geometry、基础颜色和实例。
- Converter 输出中的 JT object ID、assembly path 和可序列化 custom properties。
- 米制、right-handed y-up 的 converter output contract。
- 大型世界坐标 local origin。

不支持：

- Toolchain 内置 JT binary parser。
- 未配置 converter 时自动下载、安装或调用网络服务。
- PMI、animation、camera、light、复杂材质和 source editing。
- Runtime JT parsing 或 conversion。
- 未经批准的第三方 converter binary 随包分发。

## 3. Converter 契约

环境变量 `ICE3_JT_CONVERTER` 指向可执行文件。调用参数固定为：

```text
ICE3_JT_CONVERTER --input SOURCE.jt --output RAW.glb
```

- 不使用 shell。
- 不向 converter 透传用户任意参数。
- 成功时必须写出单个标准 GLB，Geometry 为 triangle mode。
- 输出必须为米制、right-handed y-up。
- Node 名称保留 assembly 和 part 语义。
- 可选 metadata 写入 `node.extras.jt`：

```json
{
  "objectId": "JT-42",
  "assemblyPath": "/Plant/TreatmentLine/Pump",
  "customProperties": {
    "EquipmentTag": "P-101"
  }
}
```

Converter stdout/stderr 只保留有界缓冲用于诊断，不进入最终 report。

## 4. Adapter Interface

```ts
export interface IJtImporterOptions {
  readonly converterBinary?: string;
  readonly timeoutMs?: number;
  readonly runner?: IJtConverterRunner;
}

export function createJtImporter(
  options?: IJtImporterOptions,
): ICESourceImporter;
```

- `id`: `jt`
- `extensions`: `.jt`
- `capabilities.hierarchy`: `true`
- `capabilities.vertexColors`: `false`
- `capabilities.materialColors`: `true`
- `capabilities.instances`: `true`
- `capabilities.semanticMetadata`: `true`
- `sourceFormat`: `jt`

Selection ID 使用 `${assetId}/jt/node/${ordinal}`。共享 mesh data 的额外 Node 使用稳定
`instanceGroup`，同时保留独立 Selection。

## 5. Diagnostic

| Code | 条件 |
| --- | --- |
| `ICE3_TOOL_JT_CONVERTER_UNAVAILABLE` | `ICE3_JT_CONVERTER` 未配置或不可执行 |
| `ICE3_TOOL_JT_TIMEOUT` | converter 超时 |
| `ICE3_TOOL_JT_CONVERT_FAILED` | converter 返回非零或未生成 GLB |
| `ICE3_TOOL_JT_EXPORT_INVALID` | raw output 不是有效标准 GLB |
| `ICE3_TOOL_JT_GEOMETRY_INVALID` | Geometry、Bounds 或 transform 无效 |
| `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY` | 输出没有 triangle Geometry |

超时先发送 `SIGTERM`，一秒后发送 `SIGKILL`。失败不发布 raw GLB、source GLB 或最终
Prepared GLB。

## 6. 确定性

相同 JT bytes、converter identity/version、option 和 Toolchain version 必须得到
byte-identical source GLB。Node 顺序、Selection、material names、properties、
warning 和 instance group 顺序稳定。

## 7. 验收

- auto 与显式 `jt` adapter 均可调用配置的 converter。
- converter unavailable、timeout、非零退出、无效 GLB 和空 Geometry 稳定失败。
- Node 层级、材质、JT metadata、实例和 local origin 正确。
- partition 与 static batching 后保留 `extras.ice3.jt`。
- 发布 tarball 的 adapter code 可用；converter 不进入 tarball。
- 仓库测试使用完全合成的 JT contract fixture 和 converter，不包含客户资产。
- Node.js `24.22.1` 下完整门禁通过。

## 关联文档

- `ICE3-TOOL-SPEC-001` — [多格式 Source Import](2026-10-29-source-import-adapters.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-TOOL-PLAN-007` — [JT Source Importer 实施计划](../plans/2026-10-29-jt-importer.md)
