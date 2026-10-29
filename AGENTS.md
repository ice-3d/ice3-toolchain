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
- Runtime format conversion does not belong in the browser; heavy preprocessing belongs in commands or authoring tools.
- Support only current and near-current source features and formats that materially serve target industrial workflows.
- Failed builds never leave a partial output at the final destination.

## Customer model protection

- Real customer model sources remain in a controlled local directory outside every repository.
- Source models, converted GLBs, partition outputs, coarse proxies, reports containing paths, thumbnails, and extracted textures must not enter source, tests, examples, documentation, logs, packages, or Git history.
- Do not stage, commit, push, or upload customer assets or derivative data to any remote service.
- Automated tests and examples use synthetic, sanitized, or explicitly redistributable fixtures.
- Before completing asset-processing work, inspect Git status, tracked files, ignore rules, and staged content.

## Delivery

- Develop on a feature branch; merge to `main` only after the full verification gate passes.
- Every behavioral change follows RED-GREEN-REFACTOR.
- Use Node.js 24.22.1 LTS from `.nvmrc`.
- No legacy or broad-format compatibility is added without an explicit design decision.
- Format, metric, budget, and diagnostic changes follow the canonical contract in `ice3-doc` and verify runtime consumers.

## Commit identity

- Every Git author and committer name in this repository must be `damoqiongqiu`.
- Verify the configured and recorded names before committing, merging, or pushing.

## Naming and legal boundary

- Do not use competitor, vendor, or third-party product names in product documents, source identifiers, comments, examples, or diagnostics.
- Describe comparisons with neutral category names.
- Do not link to external research that exposes prohibited names.
- Audit names before every commit and release.

## Verification

```bash
npm run verify
```

## Related Documents

- `ICE3-TOOL-IDX-001` — [Documentation index](docs/README.md)
- `ICE3-TOOL-ARC-001` — [Toolchain architecture](docs/architecture.md)
