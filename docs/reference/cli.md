# ICE3 Tool CLI 参考

> Document ID: ICE3-TOOL-REF-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Command 语法

```text
ice3-tool <build|import|inspect|validate|partition> [arguments]
```

安装后的 binary 为 `ice3-tool`；仓库示例使用 `node packages/cli/dist/main.js`。

## Command-Line 约定

| Option | 值 | 行为 |
|---|---|---|
| `--json` | flag | 输出一个 machine-readable JSON result |
| `--crease-angle` | 有限数值，默认 `30` | 设置 generated edge threshold |
| `--skip-edges` | flag | 省略 generated edge Geometry |

`build`、`import` 和 `partition` 接受 `--budget` 与 `--warnings-as-errors`。
`build` 和 `import` 接受 `--report`。

## `import`

```bash
ice3-tool import SOURCE \
  --output FILE \
  --asset-id ID \
  [--adapter auto|step] \
  [--report FILE] \
  [--budget PROFILE|FILE] \
  [--warnings-as-errors] \
  [--json]
```

`import` 在 Toolchain 内把受支持的源模型转换成临时 source GLB，随后复用 `build`
的 Geometry preparation 和 Prepared GLB validation。成功发布的 `--output` 始终是
Prepared GLB，而不是源模型或中间 source GLB。

首期 adapter：

| Adapter | 扩展名 | 源能力 |
|---|---|---|
| `step` | `.step`、`.stp` | STEP AP242 Geometry、层级、名称、颜色和米制 conversion |

`--adapter auto` 按 extension 选择 adapter。`--report` 在标准 Asset Report 顶层增加
`adapter` 字段，记录 adapter identity、source format、capability 和 adapter warning。
转换、Source validation、budget 或 Prepared GLB validation 失败时不会发布 output。

## `inspect`

```bash
ice3-tool inspect SOURCE \
  [--asset-id ID] \
  [--crease-angle DEGREES] \
  [--skip-edges] \
  [--json]
```

读取 source model 或 Prepared GLB，并报告聚合 format 与 profile statistic。

## `build`

```bash
ice3-tool build SOURCE \
  --output FILE \
  [--report FILE] \
  [--asset-id ID] \
  [--budget PROFILE|FILE] \
  [--crease-angle DEGREES] \
  [--skip-edges] \
  [--warnings-as-errors] \
  [--json]
```

`--output` 必填。Output publication 是原子的。Hard-budget failure 或无效 generated
profile 不会留下最终 GLB。

## `validate`

```bash
ice3-tool validate FILE [--json]
```

校验 ICE3 Prepared GLB。Exit code `1` 表示一个或多个 error。

## `partition`

```bash
ice3-tool partition SOURCE \
  --output DIRECTORY \
  --asset-id ID \
  [--max-triangles 500000] \
  [--max-bytes 33554432] \
  [--budget PROFILE|FILE] \
  [--crease-angle DEGREES] \
  [--skip-edges] \
  [--render-batch off|static] \
  [--lod] \
  [--lod-ratio 0.15] \
  [--lod-max-triangles 250000] \
  [--lod-min-unit-triangles 8] \
  [--lod-allocation proportional|adaptive] \
  [--lod-curve-samples 8] \
  [--lod-max-memory-bytes 67108864] \
  [--coarse-chunk-max-bytes 33554432] \
  [--semantic-proxy off|auto] \
  [--json]
```

### Partition 约束

| Option | 约束 |
|---|---|
| `--max-triangles` | 正数 |
| `--max-bytes` | 正数 byte count |
| `--lod-ratio` | 大于 0 且小于 1 |
| `--lod-max-triangles` | 正整数 |
| `--lod-min-unit-triangles` | 正整数，且不大于 `--lod-max-triangles` |
| `--lod-curve-samples` | `4` 到 `32` 的整数 |
| `--lod-max-memory-bytes` | 正整数 |
| `--coarse-chunk-max-bytes` | 正整数 |
| `--semantic-proxy auto` | 需要 `--lod --lod-allocation adaptive` |

Output directory 不得预先存在。成功后发布：

```text
tileset.json
parts/part-NNN.glb
coarse/... (when LOD is enabled)
```

`--coarse-chunk-max-bytes` 控制单个粗模 chunk 的目标大小。一个内部 Tile 可以发布
单个 `coarse/<tile-id>.glb`，也可以通过标准 `contents` 发布多个
`coarse/<tile-id>/part-NNN.glb`。详见
[从 GLB 到 Engine 的完整接入流程](../guides/glb-to-engine.md)。

## Exit Status

- `0`：command 完成且全部 required validation 通过。
- `1`：无效 argument、不支持 input、validation failure、budget failure、publication
  failure 或 Runtime exception。

## 关联文档

- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](../guides/build-validate-partition.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine 的完整接入流程](../guides/glb-to-engine.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-ENG-REF-001` — [Runtime diagnostics](https://github.com/ice-3d/ice3-engine/blob/main/docs/diagnostics.md)
