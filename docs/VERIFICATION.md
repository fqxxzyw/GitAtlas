# v0.2.0 verification

## Scope and evidence

Verification date: 2026-10-20. Windows x64 is the release target. No screenshots, user credentials or private repository contents are published.

- Initial path/CI repair: [`0e526cc`](https://github.com/fqxxzyw/GitAtlas/commit/0e526cc81f863ac753932163ab67967b1e62d6e6). [Windows run 39346580744](https://github.com/fqxxzyw/GitAtlas/actions/runs/39346580744) passed lint, all 42 original tests, NSIS/portable builds and the 21-check packaged Electron smoke suite.
- Release-candidate application commit: [`e04c51f`](https://github.com/fqxxzyw/GitAtlas/commit/e04c51f597455d156e3de32632c8322e8b7a14bc). [Windows run 39347347081](https://github.com/fqxxzyw/GitAtlas/actions/runs/39347347081) passed lint, all 48 tests, NSIS/portable builds and all 30 packaged Electron smoke checks. The documentation/release commit reruns the same gates before publishing.
- Expanded regression suite: 48 tests, including an aliased application root, canonical fresh/refresh/offline paths, failed/actively cancelled download cleanup, operation exclusion and missing Git. Existing symlink/junction rejection tests remain enabled, with two additional checks for a redirected repositories root at startup and after initialization.
- Local Linux checks: TypeScript strict + ESLint, 48 tests and production renderer/main/preload build passed. Real public `fqxxzyw/GitAtlas` clone, scan, refresh, canonical offline lookup and deletion passed; the clone contained only `.git`, with no checked-out project files.
- Local graphical Electron could not run in the cloud container (no usable display/GPU session); its launch failure is not counted as a passed desktop test. Windows packaged testing is the desktop gate.

## Verified changes

`download()` now returns `cachePath()` after saving its cache entry. Fresh clones, refreshes and offline opens therefore share a canonical path, including Windows long/8.3 aliases. The application root is canonicalized at initialization; the managed repositories root is pinned and rechecked before download/access/deletion. Redirecting the entire repositories directory is rejected as well as redirecting an individual cache. This strengthens the containment check. The test independently compares the result with `realpath()` and still rejects a substituted symlink/junction.

The workflow only uploads `smoke.json` if it exists and the smoke step was attempted. A smoke failure inside the test body writes a minimal failure report. A failing earlier step still fails the job without an unrelated missing-report upload error. Artifact paths explicitly include only executables, checksums and the JSON report; screenshots and page text stay on the ephemeral runner.

The remote dialog has roving keyboard tabs (Left/Right/Home/End), Tab/Shift+Tab containment, Esc close when idle, focus restoration, and a focused cancellation control while busy. After cancellation it retains focus inside the dialog. Its translucent CSS surface and spring entry honor reduced-motion preferences. These are web-rendered visual effects, not native WinUI 3 controls or Apple's proprietary glass renderer.

## Evidence boundaries

| Area | Method | Scope |
| --- | --- | --- |
| Local Git and original features | Real temporary Git repositories + packaged Electron | Scan, playback, search, branch queries without checkout, real diff, export privacy and import |
| Public GitHub | Real network + Git + packaged Electron | URL validation, download, refresh, offline open, active-cache deletion rejection and deletion after switching repositories |
| Filesystem safety | Unit/integration tests with real temporary directories | Canonical aliases, unregistered ID rejection, substituted symlink/junction and cache-root rejection, failed/cancelled download cleanup |
| Git/GCM absence | Missing executable and injected process responses; dialog response fixture | Error mapping, explanatory notice and disabled login |
| Account protocol | Injected runner/fetch doubles | Device-code parsing, cancellation, namespace isolation, token filtering, expiry and logout |
| Account UI | Packaged renderer with test-only IPC doubles | Device-code display/cancel, pagination, filtering, private labels and logout; **no real account or private clone** |
| Layout/accessibility | Packaged Electron geometry/focus assertions at 1000 × 700 and 1500 × 980 | Dialog overflow, keyboard tabs, focus containment/restoration, visible cancel control and reduced-motion entry |

## Still requires user/manual validation

- Real GitHub device authorization, 2FA, organization consent and private repository download have **not** been verified. Simulated login results are not evidence of actual account access.
- Manual visual review of the new glass/animation, Windows 11 Mica, native window snapping, different GPUs/DPI/high-contrast settings, installer/uninstaller interaction and SmartScreen is pending. Automated geometry checks do not replace that review.
- Native file dialogs in the smoke test return test-selected paths.
- Executables are unsigned. Portable mode still stores settings and caches in the user application-data directory.
- Downloaded Git object caches include source history, potentially private. Logout removes GitAtlas credentials, not these caches.

## User authorization procedure

1. Install Git for Windows with Git Credential Manager, then restart GitAtlas.
2. Open **GitHub 账户 → 登录 GitHub**. Use the displayed current device code at the official [GitHub device page](https://github.com/login/device); check the Git Credential Manager authorization shown by GitHub.
3. Verify the account identity/list, select an authorized private test repository, and check download/history access.
4. Log out, verify the account/list clears and the downloaded cache still opens offline. Open another local repository before deleting the private test cache.
5. Report success or the application's error text; never send a password, token or a screenshot containing a live authorization code.

---

# v0.1.0 verification

[Successful Windows build and test run](https://github.com/fqxxzyw/GitAtlas/actions/runs/39195593012)

Verified application commit: `3e1fd0d0896a52fc1a6647182c6c9dfadfbbbadd`.

- TypeScript strict checking and ESLint passed.
- All 21 unit and real Git integration tests passed.
- Windows x64 NSIS installer and portable executable built successfully.
- Packaged GitAtlas.exe launched on Windows and passed all 16 UI smoke checks: startup, preload isolation, demo navigation, playback, search, keyboard focus, growth, activity, contributors, comparison, theme, real Git scan and diff, read-only branches, export privacy and import.
- Repository opening succeeded at a 1000 × 700 content viewport after fixing sidebar overflow.

The release commit reruns all gates before publishing the executables, SHA-256 checksums and JSON test report. Screenshots are excluded from public release assets pending separate approval.

Native file dialogs are stubbed with test-selected paths. This does not replace manual validation across Windows 11 GPU, DPI and Mica configurations. The executables are unsigned.
