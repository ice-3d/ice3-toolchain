# FBX Source Importer 规格

> Document ID: ICE3-TOOL-SPEC-003
>
> Status: Draft
>
> Owner: ICE3 Toolchain maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 待评审 |
| 版本 | 1.0 |
| 日期 | 2026-10-29 |
| 适用范围 | `ice3-toolchain` 的 FBX source adapter、Blender bridge 和发布验证 |

## 1. 目标

为 Toolchain 增加 `.fbx` source adapter，使工程团队可以把常见的 FBX 资产转换为
validated Prepared GLB，并继续使用现有 partition、LOD、Tileset 和发布流程。

FBX 首期必须保留：

- 对象层级、空节点和稳定节点名称。
- Mesh Geometry、对象 world transform 和 triangle indices。
- 基础 display color。
- 可序列化的 custom properties。
- 可识别的 shared-mesh instance 关系。

Runtime 继续只消费 Prepared GLB 或 Tileset，不导入 FBX，也不依赖 Blender。

## 2. 非目标

- 不支持动画、skin、morph、camera、light 和复杂材质节点。
- 不承诺纹理、UV、复杂 PBR 或程序材质。
- 不支持根据文件名猜测设备类型、业务 tag 或流程连接。
- 不在 Runtime 中解析 FBX 或启动 Blender。
- 不把 Blender 专有 modifier、constraint、node tree 或 driver 带入 GLB。
- 不尝试兼容历史 FBX 6.x 或未知私有扩展；只支持当前 Blender 能稳定读取的 ASCII
  和 Binary FBX。

## 3. 依赖决策

| 项目 | 决策 |
| --- | --- |
| 扩展名 | `.fbx`，大小写不敏感 |
| Geometry bridge | Blender `5.2.3` headless Python |
| Node adapter | 私有 `@ice3/fbx-importer` |
| Blender 分发 | 不作为 npm dependency 分发 |
| Blender 定位 | `BLENDER_BIN` 或明确配置的 executable |
| Runtime | 不引入 Blender、Python 或 FBX parser |

选择固定 Blender 的原因：

- FBX 是 DCC interchange format，当前主流解析质量依赖成熟 DCC importer。
- 当前 Blender 版本已提供 ASCII/Binary FBX import、层级、材质、custom properties 和
  标准 glTF 2.0 export。
- 旧 Node 转换器维护活跃度不足，无法满足当前技术支持范围。

FBX adapter 在 Blender 不可用或版本不匹配时必须明确失败，不回退到不受支持的转换路径。

## 4. 数据流

```text
FBX source
    ↓
fixed Blender headless bridge
    ↓
temporary raw GLB + bridge report
    ↓
TypeScript normalization and canonicalization
    ↓
standard source GLB
    ↓
existing readSource / Prepared GLB / partition / LOD
```

Bridge 只负责 DCC 级导入和初次导出。ICE3 selection、metadata、规范化、validation 和
publication 仍由 TypeScript Toolchain 完成。

## 5. Blender Bridge

### 5.1 调用边界

Bridge 只允许通过仓库内固定脚本调用：

```text
ice3-tool import model.fbx --output prepared.glb --asset-id example
```

Node adapter 使用：

```text
BLENDER_BIN --background --factory-startup --python-exit-code 1
  --python packages/fbx-importer/scripts/fbx-to-glb.py
  -- --input INPUT --output OUTPUT --report REPORT
```

禁止：

- 把用户文本拼接成 Python 或 shell。
- 执行 FBX 内嵌脚本。
- 访问 source 和 temporary workspace 之外的用户文件。
- 启用网络、embedded image search 或任意 Blender add-on。
- 启动 GUI。

### 5.2 Import 参数

固定设置：

- `use_manual_orientation = false`
- `global_scale = 1.0`
- `use_custom_normals = true`
- `use_anim = false`
- `use_image_search = false`
- `use_custom_props = true`
- `use_custom_props_enum_as_string = true`

FBX 文件声明的 axis system 和单位由固定 Blender importer 解释。输出前仍由 TypeScript
验证 right-handed y-up 和 meter。

### 5.3 GLB export 参数

Bridge 使用：

- `export_format = 'GLB'`
- `export_yup = true`
- `export_apply = true`
- `export_materials = 'EXPORT'`
- `export_normals = true`
- `export_texcoords = false`
- `export_cameras = false`
- `export_lights = false`
- `export_animations = false`
- `export_skins = false`
- `export_morph = false`
- `export_extras = true`
- `export_gpu_instances = false`

Blender 导出的临时 GLB 不是最终发布物。TypeScript 必须执行一次 canonicalization，移除
不属于支持范围的 texture、image、animation、skin、camera 和 light 资源。

### 5.4 进程控制

- 每次 import 使用独立 `mkdtemp()` workspace。
- 设置固定 timeout，默认 120 秒。
- 检查 executable 和 Blender 精确版本。
- bridge stdout/stderr 不直接进入报告。
- Blender 失败时清理 raw GLB 和 report。
- Blender 成功后关闭 model，再由 TypeScript 读取文件。

## 6. 对象与层级

- 保留 Blender importer 产生的可导出对象层级。
- `EMPTY` 节点即使没有 Geometry 也必须保留。
- Mesh object 根据 source hierarchy 挂到对象或空节点下。
- 空名称使用稳定 `fbx/node/<ordinal>`。
- 重复名称保留 display name，但 node identity 使用稳定 ordinal，不依赖显示名称。

Selection ID：

```text
${assetId}/fbx/node/${ordinal}
```

如果 source custom properties 明确提供可映射 identity，可作为附加 metadata 保留，但不得
根据名称猜测业务设备身份。

## 7. Geometry 与实例

- 只接受 triangle list。
- Blender 已三角化的 polygon 可以输出。
- 丢弃没有有效 position、index 或 triangle 的 mesh。
- 不输出 modifier 历史、shape key 或 skin deformation。
- 所有 position、transform 和 Bounds 必须有限。

Shared mesh instance：

- Blender bridge 按 object 使用的 mesh data identity 提取 instance group。
- 同一 mesh data 的多个 object 在 source GLB 中复用同一 glTF mesh。
- 每个 instance 保留独立 node、transform、名称和 Selection ID。
- 无法确认 shared identity 时降级为独立 mesh 并产生 warning，不得声称 support。

## 8. 单位与坐标

- Blender bridge 输出 y-up GLB。
- 最终 Asset 声明 `linearUnit: meter`。
- source unit 无法确定或转换失败时不得猜测。
- 所有对象共享一次 document-local origin，避免大型世界坐标进入 float32 后丢失精度。
- source origin 写入 source Asset extras 和 adapter report。

对于 FBX 文件中的 unit scale，Blender importer 已应用的值作为依据；TypeScript
canonicalization 不再次施加任意全局缩放。

## 9. 材质与颜色

- 读取 source 基础 diffuse/display color，并转换为稳定 RGBA。
- 不保留 Blender shader node graph。
- 相同颜色复用 material。
- 无法解释的复杂材质降级为稳定灰或已有 diffuse color，并产生 warning。
- 不支持 texture、UV、PBR map、transparency 以外的复杂光照。
- 输出 material 使用 metallic 为零、roughness 为一的基础参数。

## 10. Custom Properties

Bridge 报告每个可导出对象的 custom properties。TypeScript 只保留：

- string
- finite number
- boolean
- primitive array

复杂 nested value、binary、pointer 和循环引用省略，并对每个 node 聚合 warning。

Metadata 最终结构：

```json
{
  "extras": {
    "ice3": {
      "selectionId": "plant/fbx/node/12",
      "displayName": "Transfer Pump",
      "fbx": {
        "objectName": "Transfer Pump",
        "objectType": "MESH",
        "meshData": "Transfer Pump Mesh",
        "instanceGroup": "transfer-pump",
        "customProperties": {
          "EquipmentTag": "P-101",
          "DesignFlow": 12.5
        }
      }
    }
  }
}
```

不得写入 source absolute path、Blender session 信息、临时路径或用户名。

## 11. 失败与 Diagnostic

| Code | 条件 |
| --- | --- |
| `ICE3_TOOL_FBX_BLENDER_UNAVAILABLE` | `BLENDER_BIN` 不存在或不可执行 |
| `ICE3_TOOL_FBX_BLENDER_VERSION_INVALID` | Blender 版本不是 `5.2.3` |
| `ICE3_TOOL_FBX_TIMEOUT` | headless bridge 超过 timeout |
| `ICE3_TOOL_FBX_IMPORT_FAILED` | FBX 无法读取或 Blender import 失败 |
| `ICE3_TOOL_FBX_EXPORT_FAILED` | Blender GLB export 失败 |
| `ICE3_TOOL_FBX_GEOMETRY_INVALID` | Geometry、matrix 或 index 无效 |
| `ICE3_TOOL_IMPORT_EMPTY_GEOMETRY` | 可读取但没有有效 triangle |

所有失败：

- 不发布 Prepared GLB。
- 删除 raw GLB、bridge report 和 temporary workspace。
- 不泄漏 Blender stdout、绝对路径或 stack trace 到稳定 Diagnostic。

## 12. 确定性与规范化

对相同 FBX bytes、adapter version、Blender version 和 option：

- node 和 instance 顺序稳定。
- custom property 顺序稳定。
- TypeScript canonicalization 后 source GLB bytes 稳定。
- Prepared output 和 report bytes 稳定。
- 不写入当前时间、随机 ID、临时路径和 Blender session ID。

Blender 的原始 GLB bytes 不作为确定性契约；最终确定性由 TypeScript canonicalizer
保证。

## 13. CLI 与发布

支持：

```bash
ice3-tool import model.fbx \
  --output prepared.glb \
  --asset-id example

ice3-tool import model.fbx \
  --output prepared.glb \
  --asset-id example \
  --adapter fbx

ice3-tool partition model.fbx \
  --output tiles \
  --asset-id example
```

`--adapter auto` 按 `.fbx` 选择 FBX adapter。Blender 不可用时返回
`ICE3_TOOL_FBX_BLENDER_UNAVAILABLE`。

发布要求：

- npm package 包含 adapter 和 bridge script。
- 不包含或重新分发 Blender binary。
- README 明确 Blender 是 FBX 可选系统依赖。
- Blender 版本不符合时禁止 fallback。
- release check 在 Blender 可用时实际执行 FBX import 和 Prepared validation。

## 14. 合成 Fixture

仓库提交完全合成的 FBX fixture，不得包含客户资产或厂商场景。Fixture 由固定 Blender
版本生成，包含：

- 三层空对象层级。
- 两个命名 mesh object。
- 两个共享同一 mesh data 的 linked instance。
- 三种基础颜色。
- 两个带 custom properties 的对象。
- 明确的米制尺寸。
- 一个 ASCII `.fbx` 和一个 Binary `.fbx`。

其他 fixture：

- 空层级，无 mesh：必须 empty Geometry。
- 截断 FBX：必须 `ICE3_TOOL_FBX_IMPORT_FAILED`。
- Blender unavailable/version mismatch：使用测试注入的 executable 路径验证。

## 15. 测试

### 15.1 Bridge

- 固定版本和 timeout。
- ASCII/Binary FBX 都可执行。
- 不读取 source 目录之外的文件。
- raw GLB 和 report 写入指定 temporary path。
- 失败时不生成成功 report。

### 15.2 Adapter

- 层级和空节点。
- Selection ID 和名称 collision。
- Geometry、颜色、Bounds。
- shared mesh instance。
- custom property flattening。
- canonicalization 和 byte determinism。
- unsupported animation/texture/camera/light 被移除并 warning。

### 15.3 End-to-end

- `--adapter auto` 和显式 `fbx`。
- `partition` 直接读取 FBX。
- Prepared GLB metadata 在 partition 和 batching 后保留。
- 失败不发布 output。
- 发布包在 Blender 可用环境中实际 import。

## 16. 验收

- `.fbx` 可通过 auto 和显式 FBX adapter 生成 Prepared GLB。
- ASCII 和 Binary fixture 均通过。
- 层级、名称、基础颜色、实例和 primitive custom properties 可读取。
- Runtime、Engine 和 npm dependency 不包含 Blender 或 FBX parser。
- Blender 缺失、版本错误、timeout、损坏文件和 empty Geometry 均有稳定 Diagnostic。
- 文档、fixture、release package 和完整门禁通过。

## 关联文档

- `ICE3-TOOL-SPEC-001` — [多格式 Source Import 适配器与 STEP AP242 首期规格](2026-10-29-source-import-adapters.md)
- `ICE3-TOOL-SPEC-002` — [IFC 4.3 Source Importer 规格](2026-10-29-ifc-4-3-importer.md)
- `ICE3-TOOL-GUIDE-004` — [AI 控制 Blender 建模工作流](../guides/ai-blender-modeling.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-REF-001` — [CLI 参考](../reference/cli.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
