# 确定性原子 Publication

> Document ID: ICE3-TOOL-ADR-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## 背景

中断的 build 不得留下部分有效的 Asset directory。重复 build 还应可比较、可缓存，
以便可靠审查 Geometry 变化。

## 决策

相同 input bytes、option、dependency version 和 tool version 下，所有顺序和生成内容都
具有确定性。文件写入唯一 temporary path，通过 validation 后才在完整 operation 成功
时发布。

替换 example Asset root 时，直到新 staged directory 就绪才替换旧目录。

## 备选方案

- 直接写入 final path。
- 写新输出前删除旧输出。
- 允许不确定的 object 和 triangle 顺序。

这些方案会产生部分 artifact、不稳定 diff 和不可靠 cache。

## 影响

- Build 失败时不留下新的部分 final output。
- 既有 consumer 在 replacement 前继续使用上一个完整 Asset tree。
- Build comparison 和 content hash 具有实用价值。
- Staging 需要可用 temporary disk。

## 兼容性

确定性输出属于 release 和 cache contract。任何有意不确定的功能必须由新决策替代。

## 验证

```bash
npm test -- tests/output
npm test -- tests/partition
```

## 关联文档

- `ICE3-TOOL-ARC-001` — [Toolchain 架构](../architecture.md)
- `ICE3-TOOL-GUIDE-001` — [构建、验证与拆分](../guides/build-validate-partition.md)
