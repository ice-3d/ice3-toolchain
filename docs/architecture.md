# ICE3 Toolchain Architecture

> Document ID: ICE3-TOOL-ARC-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## System Context

The toolchain converts model-authoring formats into a bounded runtime format.
It is an offline build component and is never imported by the browser runtime.

```text
source glTF / GLB
       ↓
source validation
       ↓
geometry normalization
       ↓
prepared profile ──────→ full preview GLB
       ↓
spatial partition plan
       ↓
fine GLBs + coarse LOD + batches
       ↓
OGC 3D Tiles 1.1
```

## Components

| Component | Responsibility |
|---|---|
| Source adapter | Reads supported glTF/GLB content and decompresses declared mesh compression |
| Geometry preparation | Bakes node transforms, normalizes triangle data, preserves display colors, and optionally generates edges |
| Profile builder | Emits deterministic single-JSON/single-BIN GLB with ICE3 metadata |
| Partition planner | Groups atomic semantic units into a spatial tree |
| LOD generator | Produces proportional or adaptive coarse geometry and chunks |
| Semantic proxy generator | Offers conservative OBB and cylinder candidates |
| Render-batch builder | Groups compatible static geometry without changing semantic nodes |
| Validator | Checks accessors, profile fields, bounds, budgets, and Tileset references |
| Publisher | Writes to staging and atomically replaces a completed output |

## Source And Prepared Boundaries

The browser receives only the Prepared profile. Source-format parsing,
compression decoding, transforms, simplification, and material conversion stay
in this repository.

The contract is owned by `ICE3-DOC-CTR-001`; this toolchain defines the local
implementation but not a competing format.

## Determinism

For identical input bytes, options, dependency versions, and tool version:

- JSON object key order is stable.
- Collection order is stable.
- Generated node and partition IDs are stable.
- Prepared bytes and reports are deterministic.
- Final files publish only through temporary paths followed by rename.

## Memory And Concurrency

LOD geometry is normalized into a bounded workspace. Geometry that exceeds the
configured in-memory budget spills to unique temporary files. The authored
example uses a 512 MiB workspace, while the CLI default is 64 MiB.

The authored build runs full-model preparation and spatial/LOD generation
concurrently after the source model is ready. The source generation cache uses
content-addressed keys to avoid rebuilding unchanged Blender output.

## Failure Behavior

- Invalid input fails before any final output path is created.
- Hard budget violations fail the build.
- A failed validation prevents publication.
- A failed directory publication restores the previous asset root.
- Temporary workspaces are removed after success or failure.

## Related Documents

- `ICE3-TOOL-RM-001` — [README](../README.md)
- `ICE3-TOOL-IDX-001` — [Documentation index](README.md)
- `ICE3-TOOL-GUIDE-001` — [Build, validate, and partition](guides/build-validate-partition.md)
- `ICE3-TOOL-REF-001` — [CLI reference](reference/cli.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
