# ICE3 Toolchain

ICE3 Toolchain performs all source-model parsing, normalization, triangle
preparation, crease-edge generation, and deterministic GLB packing outside the
browser runtime.

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
- Animations, skins, Morph targets, referenced textures, cameras, lights,
  sparse accessors, external output resources, and unsupported required
  extensions are rejected after preprocessing.
- The browser runtime receives only prepared GLB and never imports this
  repository or a source-format adapter.
