# Contributing

Use Node.js 22.12+ and Git. Run `npm ci`, `npm run dev`, then `npm run lint`, `npm run test`, `npm run build`. On Windows, also run `npm run build:desktop` and `npm run test:ui`.

Keep Git operations in `electron/git-service.ts`. The renderer must never gain arbitrary filesystem or shell access. Use argument arrays, validate the repository/branch/commit/path, and keep the operation allowlist read-only. New functionality must not introduce Git writes, telemetry or network uploads.

History semantics matter: topology is not timestamp order; a merge has multiple parents; its first-parent diff is not the whole project's cumulative growth. Use the Git tree for snapshots. Keep unknown line counts, ages and truncated-history milestones explicit.

Tests should exercise real behavior: temporary repositories, renamed/Unicode/binary paths, merges, dirty worktrees, metadata privacy and packaged Electron startup. Never test against or modify a contributor's real repository.

UI changes must support keyboard focus, light/dark/system theme, reduced motion, and Windows minimum window size. Include real application screenshots, clearly labeling synthetic demo data.

Open a pull request describing the problem, resulting behavior, and the checks performed. Do not commit `node_modules`, local repository exports, access tokens or generated installers.
