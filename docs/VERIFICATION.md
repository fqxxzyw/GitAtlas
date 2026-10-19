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
