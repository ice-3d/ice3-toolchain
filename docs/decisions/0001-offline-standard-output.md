# Offline Standard Output

> Document ID: ICE3-TOOL-ADR-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Context

Source-format conversion and mesh simplification are expensive and produce
errors that should block publication rather than degrade an interactive runtime.
The resulting assets must also remain usable by standard GLB and Tileset tools.

## Decision

All source adaptation and heavy geometry processing occur in the toolchain.
Runtime artifacts use GLB with the ICE3 Prepared GLB Profile and OGC 3D Tiles
1.1 for spatial distribution.

The toolchain does not define a private monolithic replacement for either
standard.

## Considered Alternatives

- Parse arbitrary source formats in the engine.
- Define a proprietary file container.
- Simplify geometry while rendering.

These alternatives increase runtime cost and reduce interoperability.

## Consequences

- Conversion errors stop the build.
- Runtime loading is smaller and predictable.
- Format compatibility is explicit and testable.
- Tooling and CDN infrastructure can inspect or serve standard outputs.

## Compatibility

`ICE3-DOC-CTR-001` remains the canonical profile and compatibility authority.

## Verification

```bash
npm run typecheck
npm test
```

## Related Documents

- `ICE3-TOOL-ARC-001` — [Toolchain architecture](../architecture.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md)
