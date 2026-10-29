# ICE3 Cross-format Conformance Assets

> Document ID: ICE3-TOOL-GUIDE-005
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

本目录由 Toolchain 生成。每个 GLB 都是对应 synthetic source fixture 经过 import/build
后得到的 Prepared GLB；Browser Runtime 不读取原始源格式。

```bash
npm run build && node tools/conformance/build.mjs
```

`manifest.json` 记录 adapter、预算统计、期望 Node 名称、warning 和格式能力。JT case
只验证外部 converter 契约；真实 JT parsing 仍需部署环境提供 `ICE3_JT_CONVERTER`。

## Coverage

| Format | Positive fixture | Negative coverage |
|---|---|---|
| glTF 2.0 | `tests/fixtures/cube.gltf` | `truncated.glb`、compression 与 source validation |
| STEP AP242 | `tests/fixtures/step/synthetic-skid.step` | empty assembly、truncated input |
| IFC 4.3 | `tests/fixtures/ifc/synthetic-plant.ifc` | schema、unit、geometry、truncated input |
| FBX | `tests/fixtures/fbx/synthetic-binary.fbx` | ASCII、empty、truncated、Blender 不可用和 timeout |
| USD | `tests/fixtures/usd/synthetic-plant.usdc` | ASCII、empty、truncated、Blender 不可用和 timeout |
| OBJ | `tests/fixtures/obj/synthetic-plant.obj` | empty、malformed、unsafe MTL 和 unit warning |
| JT | `tests/fixtures/jt/synthetic-contract.jt` | converter unavailable、timeout、failure 和 invalid output |

统一测试位于 `tests/conformance/corpus.test.ts`。每个 positive case 都要求 Prepared
Profile、预期语义 Node、非空 Geometry/Material 和 byte determinism。
