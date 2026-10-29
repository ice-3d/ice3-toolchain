# Build, Validate, And Partition Assets

> Document ID: ICE3-TOOL-GUIDE-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Intended Outcome

Produce a validated Prepared GLB or a spatial Tileset without modifying the
source file or leaving partial output after failure.

## Prerequisites

Run from the repository root after:

```bash
nvm use
npm install
npm run build
```

## Inspect

```bash
node packages/cli/dist/main.js inspect path/to/source.glb --json
```

Inspect reports aggregate source statistics and validates source support before
a long build starts.

## Build A Full Prepared GLB

```bash
node packages/cli/dist/main.js build path/to/source.glb \
  --output /tmp/prepared/asset.glb \
  --report /tmp/prepared/asset.report.json \
  --asset-id example-asset \
  --budget interactive-desktop-v1 \
  --skip-edges
```

The output path must be a file. The report is optional. Hard budget failures do
not publish a GLB.

## Validate

```bash
node packages/cli/dist/main.js validate /tmp/prepared/asset.glb
```

Expected: exit code `0` and an empty `errors` array in JSON mode.

## Partition

```bash
node packages/cli/dist/main.js partition path/to/source.glb \
  --output /tmp/partitioned \
  --asset-id example-asset \
  --max-triangles 120000 \
  --max-bytes 16777216 \
  --lod \
  --lod-allocation adaptive \
  --lod-ratio 0.5 \
  --lod-max-triangles 240000 \
  --lod-min-unit-triangles 8 \
  --lod-max-memory-bytes 536870912 \
  --render-batch static \
  --coarse-chunk-max-bytes 8388608 \
  --skip-edges
```

The output directory must not exist. Success creates `tileset.json`, fine
partitions, and any requested coarse content.

## Expected Result

- Every emitted GLB validates.
- Tileset content URLs are relative and contained by the output directory.
- Partition triangle totals match the source.
- Coarse content preserves equipment selection IDs.
- No temporary output remains after a failure.

## Related Documents

- `ICE3-TOOL-REF-001` — [CLI reference](../reference/cli.md)
- `ICE3-TOOL-ARC-001` — [Toolchain architecture](../architecture.md)
- `ICE3-TOOL-GUIDE-002` — [Large-model performance](large-model-performance.md)
