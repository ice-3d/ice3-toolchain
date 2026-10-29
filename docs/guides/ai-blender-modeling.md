# AI 控制 Blender 建模工作流

> Document ID: ICE3-TOOL-GUIDE-004
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 目标结果

允许 AI Agent 参与工业模型的设计和迭代，同时保持以下边界：

- AI 表达建模意图，不直接持有 Blender GUI。
- Blender 只执行经过校验的结构化规格或受控工具调用。
- 几何、语义、拓扑和预算必须经过确定性验证。
- Blender 仍只属于构建期，不进入 Browser Runtime。
- 最终发布使用原子替换，失败时保留上一个有效 Asset。

## 当前实现状态

当前 Toolchain 已经实现的是**确定性的代码驱动 Blender**，不是任意
prompt 直接控制 Blender：

```text
TypeScript equipment / layout / topology
        ↓ createWastewaterSceneSpec()
Scene Specification JSON
        ↓
固定版本的 Blender 无界面 Python
        ↓
source GLB
        ↓
ice3-tool build / validate / partition
        ↓
Prepared GLB + Tileset
```

当前实现包含：

- [scene-spec.ts](../../tools/wastewater-plant/scene-spec.ts) 生成结构化 Scene Specification。
- [build-blender-source.ts](../../tools/wastewater-plant/build-blender-source.ts) 启动固定版本的
  Blender。
- [generate.py](../../tools/wastewater-plant/blender/generate.py) 读取规格并生成 Geometry。
- `equipment.py`、`site.py` 和 `geometry.py` 提供有限、可测试的建模能力。
- source cache、GLB validation、partition、LOD 和原子发布。

当前尚未实现：

- 从任意外部 JSON 文件加载 AI 生成的 Scene Specification。
- 让 AI 在运行时直接调用 `bpy`。
- 让 AI 操作 Blender GUI 或执行任意 Python / shell。
- AI 专用的旁路格式、私有索引或运行时接口。

因此，目前让 AI 参与建模时，应让 AI 修改受版本控制、类型化的
`equipment.ts`、`layout.ts`、`topology.ts` 或批准过的规格数据，再由开发者审核并
运行确定性构建。不要把任意 Python 作为模型的输入。

## 推荐架构

```text
用户业务需求
    ↓
AI Agent
    ↓ 只调用白名单工具
Scene Specification / Modeling Command
    ↓
Schema、单位、Bounds、拓扑和预算验证
    ↓
Blender Orchestrator
    ├── 启动固定版本 Blender
    ├── 禁止网络与任意文件访问
    └── 记录版本、输入摘要和输出摘要
    ↓
Temporary source GLB
    ↓
inspect → build → validate → partition
    ↓
Report / Diagnostics
    ↓
AI 修复建议 → 下一轮候选
    ↓
人工批准 → 原子发布
```

AI 是 authoring workflow 的调用方，不是 Runtime 的一部分，也不是
Prepared GLB 格式的一部分。

## 两种接入方式

### 1. Scene Specification 编写方式

这是当前最适合落地的路径。

AI 只生成或修改结构化数据：

```json
{
  "schemaVersion": 1,
  "assetId": "virtual-plant",
  "units": "meters",
  "equipment": [
    {
      "tag": "P-101",
      "name": "进水泵 A",
      "stage": "intake",
      "kind": "pump",
      "position": [12, 0, 8],
      "rotationY": 0
    }
  ],
  "connections": [
    {
      "id": "main-01-P-101-GR-102",
      "from": "P-101:outlet",
      "to": "GR-102:inlet",
      "medium": "wastewater",
      "diameter": 0.3,
      "layout": "rack",
      "label": "进水主管",
      "routePoints": [[12, 1.2, 8], [18, 1.2, 8]]
    }
  ]
}
```

正式接入外部规格前必须增加 JSON Schema 校验，并至少验证：

- `assetId`、`schemaVersion` 和单位。
- equipment tag 唯一。
- `kind`、`stage` 属于当前支持枚举。
- port 的 `id`、medium、direction 和 diameter 有效。
- connection 两端存在，且 medium 匹配。
- pipe route 首尾连接设备端口，不使用任意曲线连接。
- Geometry 非空，Bounds 有限，对象全部位于合法场地范围。
- 输出仍满足当前 GLB、triangle、byte 和 Selection ID 约束。

### 2. 受控建模工具

需要 AI 进行多轮交互建模时，可以提供受控工具层，但不允许模型直接操作 Blender
对象或调用 `bpy`。建议的工具粒度：

| 工具 | 作用 |
|---|---|
| `get_scene_spec` | 读取当前结构、单位和已有设备 |
| `upsert_equipment` | 新增或修改一台设备的结构化描述 |
| `remove_equipment` | 删除尚未被引用的设备 |
| `connect_ports` | 按端口和 medium 创建管线 |
| `update_connection_route` | 提交校验后的 route points |
| `validate_scene` | 返回 schema、Bounds、拓扑和预算诊断 |
| `build_preview` | 在 staging 中生成候选 GLB |
| `inspect_asset` | 返回 GLB profile、Budget 和统计 |
| `request_visual_review` | 生成候选截图供人或模型检查 |

工具接口属于 Toolchain authoring 层；Engine 不需要知道 AI、prompt 或模型名称。
不要创建只在 Agent 场景中成立的特殊 Asset API。

## AI 建模闭环

1. **理解需求**：AI 读取业务说明、场地限制、设备清单和允许使用的设备类型。
2. **生成候选规格**：输出结构化差异，不直接输出 Python。
3. **静态验证**：验证 schema、单位和允许枚举。
4. **几何验证**：检查重叠、悬空对象、管线端点、转弯半径和场地边界。
5. **Blender 构建**：使用固定版本和无界面模式，在临时目录生成 GLB。
6. **资产验证**：运行 `ice3-tool inspect`、`build`、`validate` 和 `partition`。
7. **视觉检查**：人查看总览、设备近景和移动视角截图，排查几何穿插和视觉歧义。
8. **AI 修复**：只根据结构化 Diagnostic 和明确视觉问题生成下一版规格。
9. **发布审批**：只有全部门禁通过后，才把 staging 原子替换为正式 Asset。

工具调用和模型输出必须避免：

- 执行用户提供的任意 Python、shell 或表达式。
- 访问工作区外的文件系统路径。
- 读取网络资源或凭据。
- 根据显示名称猜测设备类型，而不读取结构化几何和规格。
- 直接改写正式 Asset 目录。
- 用自然语言声称成功而不返回结构化 Validation 结果。

## 确定性

可重复的 AI 建模至少需要固定：

- Blender 版本，当前为 `5.2.3`。
- generator 源码和 Scene Specification。
- 输入 Asset content digest。
- 工具版本和 package lockfile。
- 设备排序、连接排序和 route 点顺序。
- 随机策略和浮点容差。

同一规格应生成稳定设备节点、稳定 Selection ID 和相同 GLB bytes。若 AI 建议修改
几何，应同时输出变更摘要和验证结果，而不是只返回“模型已生成”。

## 当前仓库中的操作方式

生成当前虚构污水处理厂的 Scene Specification：

```bash
npm run generate:wastewater-spec -- /tmp/wastewater.scene.json
```

生成完整演示 Asset：

```bash
npm run build:wastewater-demo
```

AI 修改 TypeScript authoring source 后，至少运行：

```bash
npm run typecheck:tools
npm test -- tests/wastewater
```

Blender 不可用或版本不匹配时必须明确失败，不得回退到另一套几何生成器。

## 安全发布边界

- 客户 Asset 和派生文件不进入公共仓库或日志。
- AI 会话、本地路径、用户名和凭据不进入 GLB metadata。
- Blender 子进程应运行在受限临时目录，并设置执行超时。
- 生产发布前需要人工确认模型内容、业务含义和视觉结果。
- 删除、批量重排和无界几何生成属于高风险操作，必须由人工批准。

## 验收标准

一条 AI 建模流程只有在满足以下条件时才算完成：

- 输入规格可解析并通过 schema validation。
- Blender 使用固定版本完成 headless build。
- GLB 通过 Profile、Geometry、Bounds 和 Budget validation。
- 管线端点、设备语义 ID 和拓扑引用保持一致。
- Partition、LOD 和 Tileset 生成成功。
- 至少有一张总览和一张设备近景供人工检查。
- 发布失败时旧资产保持可用，成功时新资产原子替换。

## 关联文档

- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](build-validate-partition.md)
- `ICE3-TOOL-GUIDE-003` — [从 GLB 到 Engine 的完整接入流程](glb-to-engine.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-DOC-SPEC-008` — [可信 Blender Pipeline 设计](https://github.com/ice-3d/ice3-doc/blob/main/docs/specs/2026-10-28-credible-wastewater-blender-pipeline-design.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
