# Deterministic Atomic Publication

> Document ID: ICE3-TOOL-ADR-002
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers

## Context

Interrupted builds must not leave a partially valid asset directory. Repeated
builds should also be comparable and cacheable so geometry changes can be
reviewed reliably.

## Decision

For identical input bytes, options, dependency versions, and tool version, all
ordering and generated content are deterministic. Files are written to unique
temporary paths, validated, and published only after the complete operation
succeeds.

Replacement of the example asset root preserves the previous directory until
the new staged directory is ready.

## Considered Alternatives

- Write directly into the final paths.
- Delete the old output before writing the new output.
- Permit nondeterministic object and triangle ordering.

These alternatives create partial artifacts, unstable diffs, and unreliable
caches.

## Consequences

- Failed builds leave no new partial final output.
- Existing consumers keep the previous complete asset tree until replacement.
- Build comparisons and content hashes are useful.
- Temporary disk usage must be available for staging.

## Compatibility

Deterministic output is part of the release and cache contract. Any intentionally
nondeterministic feature requires a superseding decision.

## Verification

```bash
npm test -- tests/output
npm test -- tests/partition
```

## Related Documents

- `ICE3-TOOL-ARC-001` — [Toolchain architecture](../architecture.md)
- `ICE3-TOOL-GUIDE-001` — [Build, validate, and partition](../guides/build-validate-partition.md)
