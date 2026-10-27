# ICE3 Toolchain

ICE3 Toolchain performs all source-model parsing, normalization, triangle
preparation, crease-edge generation, and deterministic GLB packing outside the
browser runtime.

Cross-repository formats, shared metrics, budgets, compatibility rules, and
diagnostic codes are defined by the canonical
[Asset Preparation Contract v1](../ice3-doc/docs/contracts/asset-preparation-contract-v1.md).

## Requirements

- Node.js 24 LTS or 26+
- npm 11 or newer

```bash
nvm use
npm install
```

## Commands

```bash
npm run build
npm run verify
```

Inspect a source or prepared asset:

```bash
node packages/cli/dist/main.js inspect tests/fixtures/minimal.gltf --json
```

Build an ICE3 Prepared GLB:

```bash
node packages/cli/dist/main.js build tests/fixtures/cube.gltf \
  --output fixtures/prepared-cube.glb \
  --report fixtures/prepared-cube.report.json \
  --budget interactive-desktop-v1 \
  --asset-id prepared-cube
```

`--budget` accepts the built-in `interactive-desktop-v1` profile, the
`unrestricted` profile, or a JSON budget file. Hard-limit failures never
publish an output file. `--warnings-as-errors` turns soft-limit warnings into
release failures. `--report` writes an optional deterministic sidecar report
for CI and tool UIs; runtime loading never requires it.

For a very large model where generated edges would dominate draw calls, use
`--skip-edges` to produce a geometry-only preview.

Validate a prepared profile:

```bash
node packages/cli/dist/main.js validate fixtures/prepared-cube.glb
```

`build` writes through a temporary file in the destination directory and only
renames it after the generated profile validates. A failed build leaves no
partial output.

Partition a large asset into an OGC 3D Tiles 1.1 tree and independent Prepared
GLBs:

```bash
node packages/cli/dist/main.js partition tests/fixtures/partition-source.gltf \
  --output /tmp/partition-result \
  --asset-id partition-demo \
  --max-triangles 500000 \
  --max-bytes 33554432
```

The output directory must not exist. It contains `tileset.json` and
`parts/part-NNN.glb`. The command publishes the directory with one atomic
rename only after every GLB and content reference validates. `--output`,
`--asset-id`, `--max-triangles`, and `--max-bytes` are validated before source
processing. Existing `--skip-edges`, `--budget`, `--warnings-as-errors`, and
`--json` options are also supported.

Generate hierarchical LOD content in the same partition build:

```bash
node packages/cli/dist/main.js partition tests/fixtures/partition-source.gltf \
  --output /tmp/hierarchical-result \
  --asset-id partition-demo \
  --max-triangles 16 \
  --lod \
  --lod-ratio 0.15 \
  --lod-max-triangles 250000 \
  --lod-min-unit-triangles 8
```

With `--lod`, internal tree nodes receive `coarse/` GLBs while leaves keep
their independent fine partitions. The source is normalized once into a
bounded temporary workspace; memory and spill files are released after success
or failure. Each coarse node preserves the original device selection IDs and
records world-space geometric error in the Tileset.

Partition treats each mesh node as an indivisible semantic unit and reports
`ICE3_TOOL_PARTITION_UNSPLITTABLE` when one unit exceeds the byte budget.
LOD defaults are `0.15` ratio, 250,000 triangles per proxy, and at least 8
triangles per device. The browser runtime never loads the simplifier.
Use `--coarse-chunk-max-bytes` to override the default 32 MiB coarse chunk
limit; when omitted it follows `--max-bytes`. Oversized indivisible devices
remain intact and are reported.

Select the coarse-model allocation strategy with
`--lod-allocation proportional|adaptive`. The default is `proportional`;
`adaptive` generates deterministic per-device error curves and spends each
Tile's triangle budget where marginal error reduction is largest.
`--lod-curve-samples 4..32` controls the logarithmic samples per semantic
device in adaptive mode and defaults to `8`. Adaptive sampling remains offline
and changes neither the Prepared GLB profile nor the Tileset schema.

Adaptive mode first keeps the monotonic part of each device curve: actual
triangle count must rise while world-space error falls. It starts from each
device's minimum sample and allocates the node budget to the greatest
normalized marginal error reduction. The node budget is the lower of
`--lod-max-triangles` and the proportional mode's target total for that node,
so both strategies compare under the same nominal work. If device minimums
cannot fit that budget, the build fails instead of emitting an over-budget
partial result.

Each semantic-device curve is generated once and cached for the lifetime of the
partition build. Normalized and sampled geometry share the bounded temporary
workspace, including original vertex colors; excess geometry spills to unique
temporary files. The workspace and incomplete output directory are removed on
success, failure, or cancellation.

Use `--semantic-proxy off|auto` to enable conservative OBB and cylinder
candidates. The default is `off`; `auto` requires
`--lod --lod-allocation adaptive`. A proxy is accepted only when normalized
surface deviation is at most `0.05`, volume inflation is at most `2.0`, and the
device has at least eight times fewer triangles. Accepted proxies compete with
QEM samples in the same LOD budget; rejected candidates fall back to QEM.

Proxy replacement operates only on source mesh geometry. Node transforms, node
IDs, and semantic selection IDs remain unchanged, and proxy and QEM devices can
coexist in one coarse Tile. The default-off mode preserves existing output;
`auto` is intended for offline preprocessing and never moves fitting or mesh
replacement into the browser runtime.

Partition statistics report accepted OBB and cylinder units, rejected units,
selected proxy contents, selected proxy triangles, local saved triangles, and
maximum proxy error. Saved triangles describe the local device benefit before
the adaptive allocator may spend the released budget on other devices; compare
final coarse totals separately.

## Scope

- Input is glTF 2.0 JSON or GLB.
- Required mesh-compression extensions are decoded during preprocessing.
- Unreferenced textures, images, and samplers are removed from the prepared
  output. Source materials that still reference textures are rejected until a
  later texture milestone supplies an explicit conversion policy.
- Optional material extensions outside the geometry-focused profile are
  discarded during preprocessing.
- Output is a standard single-JSON/single-BIN GLB with the
  `ice3-prepared` profile in `asset.extras.ice3`.
- M1 supports triangle and generated line primitives, node matrices, flat base
  colors, and crease-edge overlays.
- Optional LOD proxies use a mature quadratic-error simplifier in the toolchain
  only and retain stable semantic selection IDs.
- Animations, skins, Morph targets, referenced textures, cameras, lights,
  sparse accessors, external output resources, and unsupported required
  extensions are rejected after preprocessing.
- The browser runtime receives only prepared GLB and never imports this
  repository or a source-format adapter.
