# Large-Model Performance

> Document ID: ICE3-TOOL-GUIDE-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Intended Outcome

Reduce repeated preprocessing time and keep large-model builds within bounded
memory without moving heavy conversion into the browser.

## Measure First

Run each stage separately when diagnosing a slow build:

```bash
time node packages/cli/dist/main.js build source.glb --output /tmp/prepared.glb
time node packages/cli/dist/main.js partition source.glb \
  --output /tmp/tiles \
  --asset-id measure \
  --lod
```

On the authored wastewater sample, approximate timings were:

- full Prepared GLB: 1.9 seconds;
- 1.89M-triangle partition, LOD, and static batching: 16.7 seconds;
- cold authored Blender scene generation: 9 minutes 18 seconds.

The cold source generator is the dominant cost.

## Source Cache

The authored source cache stores final deterministic GLB output by content key.
The key covers generator inputs, scene specification, pinned Blender version, and
the package lockfile.

```bash
# Default platform cache
npm run build:wastewater-demo

# Project-specific cache location
ICE3_BLENDER_CACHE_DIR=/var/tmp/ice3-cache npm run build:wastewater-demo

# Verify a clean generation path
ICE3_BLENDER_SOURCE_CACHE=0 npm run build:wastewater-demo
```

A cache hit uses the operating system copy-on-write clone when available and
reports `ICE3_WWTP_SOURCE_CACHE_HIT`.

## Memory

The partition command accepts:

```bash
--lod-max-memory-bytes 536870912
```

This value is a soft boundary for geometry retained in memory before spilling.
Increasing it can reduce temporary I/O, but it does not create CPU parallelism.

The authored example build runs full preparation and tiled/LOD generation
concurrently and uses a 512 MiB workspace.

## Expected Result

With an unchanged authored source, a warm full demonstration build is about 17
seconds rather than nine minutes. A source or generator change invalidates the
cache and requires a new cold Blender build.

## Related Documents

- `ICE3-TOOL-ARC-001` — [Toolchain architecture](../architecture.md)
- `ICE3-TOOL-GUIDE-001` — [Build, validate, and partition](build-validate-partition.md)
- `ICE3-TOOL-ADR-003` — [Content-addressed generation cache](../decisions/0003-content-addressed-generation-cache.md)
