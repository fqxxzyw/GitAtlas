# Architecture and history semantics

## Process boundary

The Electron main process owns native dialogs, trusted recent paths, Git commands, metadata cache and file import/export. Preload exposes a fixed typed `DesktopAPI`, not `ipcRenderer`, arbitrary paths, Node `fs` or command execution. Each IPC handler checks the requesting window, main frame and exact application URL, then validates arguments. Renderer uses `contextIsolation`, `sandbox` and `webSecurity`; Node integration is disabled.

Navigation, new windows, webviews, permission grants and production network requests are denied. Source text only enters the renderer as escaped React text in an on-demand unified diff. A diff is never interpreted as HTML.

## Repository scanning

1. Canonicalize a folder approved by a native dialog or stored recent entry; validate `rev-parse --show-toplevel`.
2. Read local and remote branch references. Resolve a chosen, allowlisted ref to a commit hash, without checkout.
3. Read the latest 500 reachable commits in reverse topological order. Parent-before-child ordering takes priority over timestamp order.
4. Read each commit's exact `ls-tree -rz` file tree. This is essential when replay starts mid-history or crosses merged branches.
5. Read first-parent `name-status -z` and `numstat -z`; preserve Unicode, spaces, tabs and renames. Binary changes have a binary flag and no invented line counts.
6. Cache commit metadata and blob IDs under a SHA-256 key of repository path and branch. Reuse immutable commit entries on rescans; query branch tips and log again to detect new commits or rewritten history. Never cache source text or patches.

Git objects are queried via `simple-git` without a shell. External diffs and text conversion are disabled. Git pager/editor override environment variables are excluded. `GIT_OPTIONAL_LOCKS=0` avoids optional index writes. No write operation belongs to the command allowlist.

## Model

`GitCommit` includes its real parents, refs, timestamp, metadata, changes and first-parent statistics. `RepositorySnapshot` stores paths, modes and Git object IDs for the commit's complete tree. Snapshots are keyed by hash. File comparisons use object IDs and modes; no cumulative-line approximation is used.

The UI follows a chosen branch's reachable DAG in a linear playback order. With side branches, consecutive displayed commits need not be parent and child. Snapshots remain exact. The change inspector always describes the selected commit relative to its first parent. File lifecycle follows that first-parent chain and follows rename paths. Missing ancestry is shown as unknown, not invented.

The simplified commit graph uses up to three displayed lanes and actual hash-to-parent connections. More simultaneous lanes are compressed; the inspector lists exact parents. Dashed edges indicate a parent outside the currently displayed page.

## Import and export

The versioned JSON schema is shared by desktop and web. Import rejects inconsistent counts, missing/duplicate snapshots, duplicate hashes and invalid parent ordering. Limits: 50 MiB input, 20,000 commits, 200,000 files per snapshot and 2,000,000 total snapshot entries. Export rebuilds the object through a whitelist schema, recursively stripping unknown keys, absolute repository paths, patches and source text; email fields are omitted.

Commit messages, author display names and file paths are still metadata that may be sensitive. Users should review them before sharing. Without source text, imported histories can display snapshots and statistics but cannot reconstruct unified diffs.

## Limits and cancellation

Four bounded Git processes operate at a time, with a 60-second blocked-process timeout. Scan cancellation stops after the current batch; it does not immediately terminate an already running Git process. Diff display is capped at 2 MiB after Git returns. Very large text diffs may still use memory in the main process before truncation.

The UI pages commit lists in batches of 100 and file lists in bounded chunks. Directory rendering shows up to 200 directories and compare lists up to 1,000 paths per category. These display limits do not alter snapshot totals or exports.
