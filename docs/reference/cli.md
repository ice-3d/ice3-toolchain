# ICE3 Tool CLI Reference

> Document ID: ICE3-TOOL-REF-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Command Syntax

```text
ice3-tool <build|inspect|validate|partition> [arguments]
```

The installed binary is `ice3-tool`; repository examples use
`node packages/cli/dist/main.js`.

## Command-Line Conventions

| Option | Values | Behavior |
|---|---|---|
| `--json` | flag | Emit one machine-readable JSON result |
| `--crease-angle` | finite number, default `30` | Set generated edge threshold |
| `--skip-edges` | flag | Omit generated edge geometry |

`--budget` and `--warnings-as-errors` are accepted by `build` and `partition`.
`--report` is accepted by `build`.

## `inspect`

```bash
ice3-tool inspect SOURCE \
  [--asset-id ID] \
  [--crease-angle DEGREES] \
  [--skip-edges] \
  [--json]
```

Reads a source model or Prepared GLB and reports aggregate format and profile
statistics.

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

`--output` is required. Output publication is atomic. A hard-budget failure or
invalid generated profile leaves no final GLB.

## `validate`

```bash
ice3-tool validate FILE [--json]
```

Validates an ICE3 Prepared GLB. Exit code `1` indicates one or more errors.

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

### Partition Constraints

| Option | Constraint |
|---|---|
| `--max-triangles` | Positive number |
| `--max-bytes` | Positive byte count |
| `--lod-ratio` | Greater than zero and less than one |
| `--lod-max-triangles` | Positive integer |
| `--lod-min-unit-triangles` | Positive integer no greater than `--lod-max-triangles` |
| `--lod-curve-samples` | Integer from `4` through `32` |
| `--lod-max-memory-bytes` | Positive integer |
| `--coarse-chunk-max-bytes` | Positive integer |
| `--semantic-proxy auto` | Requires `--lod --lod-allocation adaptive` |

The output directory must not already exist. Success publishes:

```text
tileset.json
parts/part-NNN.glb
coarse/... (when LOD is enabled)
```

## Exit Status

- `0`: command completed and all required validation passed.
- `1`: invalid arguments, unsupported input, validation failure, budget failure,
  publication failure, or runtime exception.

## Related Documents

- `ICE3-TOOL-GUIDE-001` — [Build, validate, and partition](../guides/build-validate-partition.md)
- `ICE3-TOOL-ARC-001` — [Toolchain architecture](../architecture.md)
- `ICE3-ENG-REF-001` — [Runtime diagnostics](https://github.com/ice-3d/ice3-engine/blob/main/docs/diagnostics.md)
