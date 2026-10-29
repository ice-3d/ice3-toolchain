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
- Use Node.js 24.22.1 LTS from `.nvmrc`.
- No legacy or broad-format compatibility is added without an explicit design decision.
- Failed builds never leave a partial output file at the final destination.

## Commit identity

- Every Git author and committer name in this repository must be `damoqiongqiu`.
- Verify the configured and recorded names before committing, merging, or pushing.

## Naming and legal boundary

- Do not use competitor, vendor, or third-party product names in product documents, source identifiers, comments, examples, or diagnostics.
- Describe comparisons with neutral category names.
- Do not link to external materials that expose prohibited names. Keep any necessary research outside product repositories and subject it to legal review.
- Audit names before every commit and release.

## Customer asset protection

- Real customer model assets remain in a controlled local directory outside every repository.
- Original models and derived assets must not enter source, tests, examples, documentation, screenshots, logs, build output, packages, or Git history.
- Derived assets include converted models, simplified models, previews, thumbnails, extracted textures, and other identifiable content.
- Do not stage, commit, push, or upload customer assets or derivative data to any remote service.
- Tests, demos, and public builds use synthetic, sanitized, or explicitly redistributable assets.
- Before completing asset-related work, inspect Git status, tracked files, ignore rules, and staged content.

## Cross-repository contracts

- `ice3-doc` is the single source of truth for formats, metrics, budgets, compatibility rules, shared diagnostics, and other cross-project contracts.
- This repository documents its own implementation and links to the canonical contract instead of independently maintaining a complete copy.
- A contract change requires checking every consumer in the ICE3 family and passing the frozen contract or conformance tests.

## Verification

```bash
npm run verify
```

## Related Documents

- `ICE3-TOOL-IDX-001` — [Documentation index](docs/README.md)
- `ICE3-TOOL-ARC-001` — [Toolchain architecture](docs/architecture.md)
