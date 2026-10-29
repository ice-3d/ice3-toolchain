# ICE3 Toolchain 仓库规则

> Document ID: ICE3-TOOL-POL-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 架构

- source format adaptation、Geometry preparation 和 GLB packing 只在本仓库实现。
- preprocessing core 不得依赖 CLI 或任何 engine runtime package。
- CLI 和未来 UI 使用同一个 preprocessing core。
- Toolchain 不导入 engine 私有源码路径。
- Toolchain 输出必须保持为带 ICE3 Prepared GLB Profile 的标准 GLB。
- Runtime format conversion 不进入浏览器；重型 preprocessing 留在 command 或 authoring tool。
- npm 公开发布 package 为 `@ice3/toolchain`，可执行文件为 `ice3-tool`；`@ice3/toolchain-core` 保持私有并打入发布产物。
- AI 建模只能产生受控 Scene Specification 或调用白名单 authoring tool；禁止根据自然语言直接执行任意 `bpy`、Python 或 shell。
- 只支持服务目标工业工作流的当前及次新 source feature 和 format。
- 构建失败时不得在最终目标位置留下部分输出。

## 客户模型保护

- 真实客户模型 source 保留在受控本地目录中，不进入任何仓库。
- Source model、转换后的 GLB、partition output、coarse proxy、包含路径的 report、thumbnail 和 extracted texture 不得进入源码、测试、示例、文档、日志、package 或 Git history。
- 不得 stage、commit、push 或上传客户 Asset 及派生数据。
- 自动测试和示例使用虚构、已脱敏或明确可分发的 fixtures。
- 完成 Asset 处理工作前，检查 Git status、tracked files、ignore rules 和 staged content。

## 交付

- 在功能分支开发，完整验证门禁通过后才可合入 `main`。
- 每项行为变化遵循 RED-GREEN-REFACTOR。
- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 没有明确设计决策时不得增加 legacy 或 broad-format compatibility。
- format、metric、budget 和 Diagnostic 变更遵循 `ice3-doc` 权威 contract，并验证 runtime 消费方。

## 提交身份

- 本仓库所有 Git author 和 committer 名称必须为 `damoqiongqiu`。
- 提交、合并或推送前核对配置名称与提交记录。

## 命名与法律边界

- 产品文档、源码标识、注释、示例或 Diagnostic 中不得出现竞品、厂商或第三方产品名称。
- 技术比较使用中性类别描述。
- 不得链接会暴露禁止名称的外部调研资料。
- 每次提交和发布前审计名称。

## 验证

```bash
npm run verify
```

## 关联文档

- `ICE3-TOOL-IDX-001` — [文档索引](docs/README.md)
- `ICE3-TOOL-ARC-001` — [Toolchain 架构](docs/architecture.md)
