# 多格式 Source Import 适配器与 STEP AP242 首期规格

> Document ID: ICE3-TOOL-SPEC-001
>
> Status: Approved
>
> Owner: ICE3 Toolchain maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 已批准 |
| 版本 | 1.0 |
| 日期 | 2026-10-29 |
| 适用范围 | `ice3-toolchain` source import、CLI、构建编排和验证 |

## 1. 目标

为 Toolchain 增加可扩展的 source import 层，让工业客户可以使用当前主流的三维源格式，
但 Runtime 继续只消费统一的 ICE3 Prepared GLB 和 3D Tiles。

首个实现切片限定为：

- 定义与具体格式无关的 source importer contract。
- 增加 `ice3-tool import` 命令。
- 实现 STEP AP242 的 `.step` / `.stp` 导入。
- 把 STEP 的 Geometry、节点层级、颜色、单位转换和 Bounds 生成标准 source GLB。
- 将 source GLB 接入现有 `readSource`、`buildPreparedGLB`、validation、partition、
  LOD 和 Tileset 管线。
- 提供一个完全合成的 STEP fixture 和端到端测试。

IFC 4.3、FBX、USD 和 OBJ 已按同一契约实现；JT 继续使用该扩展点。

## 2. 边界

### 2.1 Runtime

- `ice3` 和 Browser Runtime 不识别 `.step`、`.ifc`、`.fbx`、`.usd`、`.obj` 或 `.jt`。
- Runtime 继续只加载 Prepared GLB 和受支持的本地 Tileset 子集。
- 不增加运行期 conversion、triangulation、unit conversion 或 CAD 依赖。
- 不为任何 source format 定义私有运行时格式。

### 2.2 Toolchain

- 所有格式解析、三角化、单位换算、坐标轴转换和几何规范化均离线完成。
- 每个 adapter 只负责 source format 到标准 source GLB 的转换。
- source GLB 必须能够被现有 `readSource()` 读取。
- Prepared GLB、Validation、Partition 和 LOD 继续由现有 pipeline 负责。
- Adapter 不进入 Engine package，也不导入 Runtime 私有源码。

## 3. 格式策略

| 阶段 | 格式 | 目标能力 |
| --- | --- | --- |
| 已完成 | glTF 2.0 `.gltf` / `.glb` | 原生 source reader |
| 首期 | STEP AP242 `.step` / `.stp` | Geometry、assembly hierarchy、颜色、单位、节点名称 |
| 已完成 | IFC 4.3 `.ifc` | 空间结构、产品 identity、property set、系统关系 |
| 已完成 | FBX `.fbx` | 节点层级、Geometry、基础颜色、实例 |
| 已完成 | USD `.usdc`，兼容 `.usda` | 层级、实例、变换、基础颜色 |
| 已完成 | OBJ `.obj` | Geometry、节点名称、基础 MTL |
| 后续 | JT `.jt` | 大型装配和轻量可视化；采用外部 adapter |

不计划支持旧式 `.dae`、`.3ds`、`.x3d`，也不直接支持软件私有 CAD 格式。

## 4. 架构

```text
source file
    ↓ extension / explicit adapter
Adapter Registry
    ↓
ICESourceImporter
    ├── source validation
    ├── triangulation
    ├── coordinate and unit normalization
    ├── hierarchy and color extraction
    └── temporary standard source GLB
    ↓
existing readSource()
    ↓
existing Prepared GLB / validation / partition / LOD
```

Adapter Registry、CLI 和编排逻辑位于 Toolchain。格式 SDK 仅由对应 adapter 模块加载，
避免所有用户为未使用的格式承担安装体积和许可披露。

## 5. Adapter Contract

```ts
export interface ICESourceImportInput {
  readonly path: string;
  readonly requestedAdapter?: string;
}

export interface ICESourceImportContext {
  readonly temporaryDirectory: string;
  readonly assetId: string;
}

export interface ICESourceImportResult {
  readonly adapterId: string;
  readonly sourceFormat: string;
  readonly sourceGlbPath: string;
  readonly warnings: readonly string[];
}

export interface ICESourceImporter {
  readonly id: string;
  readonly extensions: readonly string[];
  readonly capabilities: Readonly<{
    readonly hierarchy: boolean;
    readonly vertexColors: boolean;
    readonly materialColors: boolean;
    readonly instances: boolean;
    readonly semanticMetadata: boolean;
  }>;
  import(
    input: ICESourceImportInput,
    context: ICESourceImportContext,
  ): Promise<ICESourceImportResult>;
}
```

Adapter 必须先在临时目录写出完整 source GLB，再返回其路径。正常结束时临时目录由
`ice3-tool import` 清理。

## 6. CLI

```text
ice3-tool import SOURCE \
  --output FILE \
  --asset-id ID \
  [--adapter auto|step|ifc|fbx|usd|obj] \
  [--report FILE] \
  [--budget PROFILE|FILE] \
  [--warnings-as-errors] \
  [--json]
```

行为：

1. `--adapter auto` 默认按文件扩展名选择 adapter。
2. 显式 adapter 与扩展名不匹配时失败。
3. 无法识别格式时以 `ICE3_TOOL_IMPORT_UNSUPPORTED` 失败。
4. Adapter 无法加载时以 `ICE3_TOOL_IMPORT_ADAPTER_UNAVAILABLE` 失败，并说明需要的
   optional dependency 或外部工具。
5. 无有效 Geometry 时以 `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY` 失败。
6. Source GLB 构建或 Prepared GLB validation 失败时不发布 `--output`。
7. 成功时 `--output` 是 Prepared GLB，不是 raw source GLB。
8. `--report` 使用现有 report 结构，并增加 adapter metadata 和 warnings。

## 7. STEP AP242 导入适配器

### 7.1 支持的源能力

- `.step` 和 `.stp` 扩展名。
- 在支持范围内的三角网格或可三角化的 B-Rep solid。
- Assembly / component 层级。
- 节点或 component 名称。
- 单色或逐面颜色；无法映射的材质参数降级为稳定 display color 并产生 warning。
- 米、毫米和英寸输入单位；最终 source GLB 统一为米。

### 7.2 坐标和单位

- Source 坐标轴转换一次完成，输出 glTF 右手 y-up。
- 不修改原始模型文件。
- 所有节点矩阵使用有限数值。
- 单位无法识别或混用单位时明确失败。

### 7.3 语义能力

STEP 首期只保证 Geometry、层级和名称。设备 Selection ID、端口和流程连接只有在
source 提供可映射 metadata 时才写入；缺失时不得猜测业务含义。

无业务 metadata 的模型仍可生成 Prepared GLB，但报告必须声明
`semanticMetadata: false`。

### 7.4 依赖边界

STEP adapter 使用隔离的第三方 CAD/WASM 依赖，不进入 Browser bundle。第三方版本、
许可证和 wasm assets 必须进入 `THIRD_PARTY_NOTICES.md` 与发布包文件清单。

## 8. 能力等级

| 等级 | 内容 | STEP 首期 |
| --- | --- | --- |
| L1 | Mesh、transform、Bounds | 必须 |
| L2 | Unit、assembly hierarchy、node names、colors | 必须，无法提供时明确 warning |
| L3 | Equipment identity、ports、connections | 仅在 source 提供时保留 |
| L4 | 完整业务属性与源对象映射 | 不在首期 |

不得因为缺少 L3/L4 而静默宣称 STEP 文件包含完整数字孪生语义。

## 9. 确定性与失败

- 对相同 source bytes、adapter version、dependency version 和 option，输出应当
  byte-identical。
- Adapter 内必须使用稳定节点顺序；不得依赖 hash map 或文件时间。
- 中间文件名不进入 GLB metadata。
- 失败时删除 staging GLB 和临时 workspace。
- 输出发布复用现有 atomic publication。
- 不自动下载外部转换器或扩展。
- 不读取网络、用户 home 目录或 source 目录以外的资源。

## 10. 测试

### 10.1 Adapter contract

- `auto` 只选择匹配扩展名的 adapter。
- 显式 adapter 不匹配时失败。
- 未注册扩展名返回稳定 unsupported code。
- Adapter 失败时不留下目标 output。
- Warnings-as-errors 阻止发布。

### 10.2 STEP fixture

仓库中提交一个完全合成的 STEP fixture，至少包含：

- 两个命名的 assembly component。
- 两个可三角化的几何实体。
- 明确的毫米单位。
- 可区分的颜色。
- 层级与节点名称。

Fixture 不包含客户、厂商或真实设备信息。

### 10.3 端到端

```bash
node packages/cli/dist/main.js import tests/fixtures/step/pump-skid.step \
  --output /tmp/pump-skid.glb \
  --asset-id synthetic-pump-skid \
  --report /tmp/pump-skid.report.json \
  --json
```

验证：

- Output 是 Prepared GLB，并能通过 `validate`。
- 三角形数、节点数和 Bounds 有限且非空。
- 两个 assembly component 可在 GLB 中找到稳定节点。
- 颜色存在，单位为米。
- 连续两次 import 产生相同 bytes。
- Partition 和已有 Engine loading 测试继续通过。
- 普通 glTF/GLB 的现有行为不变。

## 11. 后续格式接入

| Adapter | 主要依赖边界 | 额外语义 |
| --- | --- | --- |
| IFC 4.3 | 独立 IFC parser | spatial hierarchy、product metadata、systems |
| FBX | 固定版本的离线 DCC adapter | hierarchy、material、instances |
| USD | 固定版本 USD tool 或离线 DCC adapter | composition、instances、variants |
| OBJ | 轻量三角网格 reader | name、basic material |
| JT | 外部 JT converter | assembly、PMI、large-model tessellation |

每个 adapter 必须以独立任务交付，并复用本规格的 contract、CLI、诊断和测试结构。

## 12. 非目标

- 不在当前版本承诺 JT。
- 不实现通用 CAD 编辑、B-Rep 运算或精确几何建模。
- 不恢复 Blender 专有对象、修改器或节点图。
- 不支持纹理、复杂 PBR、animation、skinning 或 morph targets。
- 不解析原生 CAD 文件。
- 不承诺 STEP 自动生成设备端口和流程连接。

## 13. 验收

首期完成必须同时满足：

- `ice3-tool import` 已进入公开 CLI。
- STEP AP242 fixture 从 import 到 Prepared GLB 全流程成功。
- `--adapter auto` 和显式 `step` 均可用。
- 所有失败路径不发布部分文件。
- 所有输出通过现有 Prepared profile 和 Tileset consumer 验证。
- TypeScript、架构、单元、集成和浏览器测试通过。
- README、CLI reference、第三方声明和 release package 同步更新。

## 关联文档

- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](../guides/build-validate-partition.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine 的完整接入流程](../guides/glb-to-engine.md)
- `ICE3-TOOL-GUIDE-004` — [AI 控制 Blender 建模工作流](../guides/ai-blender-modeling.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
