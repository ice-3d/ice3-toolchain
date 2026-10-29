# Content-Addressed Generation Cache

> Document ID: ICE3-TOOL-ADR-003
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Context

The authored wastewater scene takes several minutes to build in Blender while
subsequent preparation and partitioning take seconds. Repeated test and demo
builds should not pay the cold authoring cost when their inputs have not
changed.

## Decision

Cache finalized authored-source GLB files under a key derived from:

- generator source files;
- scene specification content;
- pinned Blender version;
- package lockfile.

A cache hit copies the immutable GLB to the requested output using a
copy-on-write clone when supported. The cache can be redirected with
`ICE3_BLENDER_CACHE_DIR` and disabled with `ICE3_BLENDER_SOURCE_CACHE=0`.

## Considered Alternatives

- Rebuild Blender output on every invocation.
- Cache by output filename or modification time.
- Commit the 100+ MiB generated source asset to Git.

These alternatives waste time, risk stale output, or violate the repository
asset-size policy.

## Consequences

- Unchanged builds can skip several minutes of Blender execution.
- Any relevant generator or dependency change invalidates the key.
- Cache storage sits outside the repository and is not published.
- A cold cache still requires the full authored build.

## Compatibility

The cache stores the same deterministic finalized GLB expected from a clean run.
Disabling the cache preserves the full build path for release verification.

## Verification

```bash
npm test -- tests/wastewater/blender-source-cache.test.ts
ICE3_BLENDER_SOURCE_CACHE=0 npm run build:wastewater-demo
```

## Related Documents

- `ICE3-TOOL-GUIDE-002` — [Large-model performance](../guides/large-model-performance.md)
- `ICE3-TOOL-ADR-002` — [Deterministic atomic publication](0002-deterministic-atomic-publication.md)
