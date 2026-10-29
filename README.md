# ICE3 Toolchain

> Document ID: ICE3-TOOL-RM-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

ICE3 Toolchain prepares large industrial source models for the ICE3 runtime. It
performs all source parsing, normalization, simplification, spatial partitioning,
and GLB packing outside the browser.

The runtime output remains standard GLB with the ICE3 Prepared GLB Profile and,
where streaming is required, an OGC 3D Tiles 1.1 hierarchy.

## Capabilities

| Area | Current capability |
|---|---|
| Input | glTF 2.0 JSON and GLB with supported mesh-compression extensions |
| Preparation | Geometry normalization, flat display colors, transforms, profile metrics, optional edges |
| Validation | Structural GLB checks, asset budgets, deterministic reports, Tileset validation |
| Partitioning | Spatial leaves, hierarchical LOD, coarse chunks, stable semantic IDs |
| LOD | Proportional and adaptive device budgets, optional semantic proxies |
| Batching | Deterministic static render batches |
| Publication | Atomic output publication and safe asset-directory replacement |
| Build acceleration | Content-addressed Blender source cache and parallel post-processing |

## Quick Start

Requirements:

- Node.js 24 LTS or 26+
- npm 11 or newer
- Blender 5.2.3 only when rebuilding the authored wastewater source

```bash
git clone https://github.com/ice-3d/ice3-toolchain.git
cd ice3-toolchain
nvm use
npm install
npm run build
```

Inspect, build, validate, and partition an asset:

```bash
node packages/cli/dist/main.js inspect tests/fixtures/minimal.gltf --json

node packages/cli/dist/main.js build tests/fixtures/cube.gltf \
  --output /tmp/prepared-cube.glb \
  --report /tmp/prepared-cube.report.json \
  --asset-id prepared-cube \
  --budget interactive-desktop-v1

node packages/cli/dist/main.js validate /tmp/prepared-cube.glb

node packages/cli/dist/main.js partition tests/fixtures/partition-source.gltf \
  --output /tmp/partition-result \
  --asset-id partition-demo \
  --max-triangles 500000 \
  --max-bytes 33554432
```

Every command validates inputs and refuses to publish partial output. See the
[CLI reference](docs/reference/cli.md) for every option and default.

## Wastewater Demonstration

Rebuild the complete synthetic wastewater asset set:

```bash
npm run build:wastewater-demo
```

The command generates the authored source, full Prepared preview, fine
partitions, coarse LOD, static batches, validation reports, and the final Tileset.
It replaces the engine example directory only after every artifact passes.

The generated scene is entirely fictional. The monolithic source and prepared
preview stay in ignored local paths; only runtime slices are committed.

## Build Performance

The authored source generator uses a content-addressed cache keyed by generator
sources, scene specification, Blender version, and the package lockfile.

```bash
# Override the cache directory
ICE3_BLENDER_CACHE_DIR=/tmp/ice3-cache npm run build:wastewater-demo

# Force a clean Blender generation
ICE3_BLENDER_SOURCE_CACHE=0 npm run build:wastewater-demo
```

After source generation, full-model preparation and the tiled/LOD pipeline run
concurrently. The authored build uses a 512 MiB LOD workspace. See
[large-model performance](docs/guides/large-model-performance.md).

## Verification

```bash
npm run docs:check
npm run test:architecture
npm run typecheck
npm run typecheck:tools
npm test
npm run verify
```

## Documentation

- [Documentation index](docs/README.md)
- [Processing architecture](docs/architecture.md)
- [Build, validate, and partition](docs/guides/build-validate-partition.md)
- [Large-model performance](docs/guides/large-model-performance.md)
- [CLI reference](docs/reference/cli.md)
- [Architecture decisions](docs/decisions/README.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

The canonical cross-repository format and compatibility contract is
[Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md).

## AI-assisted development

This project makes substantial use of AI-assisted development. 本项目在设计和实现过程中大量使用了 AI 辅助开发。

## License

ICE3-owned code and documentation are licensed under the [MIT License](LICENSE).
