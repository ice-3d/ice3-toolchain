# ICE3 Toolchain Repository Rules

> Document ID: ICE3-TOOL-POL-001
>
> Status: Active
>
> Owner: ICE3 Toolchain maintainers
## Architecture

- Source-format adaptation, geometry preparation, and GLB packing live only in this repository.
- The preprocessing core must not depend on the CLI or any engine runtime package.
- The CLI and future UI consume the same preprocessing core.
- The toolchain never imports private engine source paths.
- Toolchain output must remain a standard GLB with the ICE3 Prepared GLB Profile.

## Delivery

- Develop on a feature branch; merge to `main` only after the full verification gate passes.
- Every behavioral change follows RED-GREEN-REFACTOR.
- Use the Node version from `.nvmrc`.
- No legacy or broad-format compatibility is added without an explicit design decision.
- Failed builds never leave a partial output file at the final destination.

## Naming and legal boundary

- Do not use competitor, vendor, or third-party product names in product documents, source identifiers, comments, examples, or diagnostics.
- Describe comparisons with neutral category names.
- Audit names before every commit and release.

## Verification

```bash
npm run verify
```

## Related Documents

- `ICE3-TOOL-IDX-001` — [Documentation index](docs/README.md)
- `ICE3-TOOL-ARC-001` — [Toolchain architecture](docs/architecture.md)
