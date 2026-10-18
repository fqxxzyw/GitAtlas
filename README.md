# GitAtlas

**Git 提交历史可视化时光机 · See how your repository grew.**

Windows 桌面应用，使用 Electron、React、TypeScript。以 visionOS 空间分层、Liquid Glass 材质和 Windows 11 原生窗口体验呈现 Git 项目演化。

## Development status

Initial workspace published before implementation and verification, as requested. This commit is a development checkpoint, not a tested release. Windows installers will appear in Releases after implementation and validation.

## Planned capabilities

- Local, read-only Git repository scanning and branch browsing; no checkout or repository mutations.
- Playable commit timeline, exact file snapshots, unified diffs and snapshot comparisons.
- Growth, file lifecycles, activity, contributors, milestones and structured search.
- Metadata-only JSON export/import, local cache and recent repositories.
- Windows x64 installer and portable executable; system theme and reduced motion.

## Commands

```sh
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run build:desktop
```

Git must be installed to read local repositories. No GitHub login, telemetry, cloud upload or source-code export is part of this application.
