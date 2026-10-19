## GitAtlas · Git 提交历史可视化时光机

Windows x64 首个可用版本：本地 Git 历史读取、项目时间轴播放、精确文件快照、按需 Unified Diff、文件生命周期、目录生长、活动热力图、贡献者、快照对比和元数据导入导出。

采用 visionOS 启发的空间布局、Liquid Glass 风格悬浮面板、弹性与磁性按钮；Windows 11 原生标题栏控制与 Mica 背景，支持系统主题、减少动态效果和键盘快捷键。

### 下载

- `GitAtlas-Setup-x64.exe`：安装版，可选择安装目录。
- `GitAtlas-Portable-x64.exe`：便携版，无需安装。
- `SHA256SUMS.txt`：安装包校验值。
- `GitAtlas-verification.json`：Windows 桌面自动化测试报告。

读取本地仓库需要预先安装 Git for Windows，并让 `git --version` 可用。JSON 导入和演示不需要 Git。

安装包未购买代码签名证书，Windows 可能显示未知发布者。Mica 效果取决于 Windows 11 版本及系统透明效果设置；旧系统使用普通背景。

此 Release 仅在 Windows 上的类型检查、lint、单元/真实 Git 测试、桌面打包和打包后 Electron 冒烟测试全部通过后发布。Windows CI 并不能替代在每一种 Windows 11 显示缩放、显卡与 Mica 配置上的人工测试。

### 边界

只读，不执行 checkout/commit/push/pull/reset/merge。首次加载最近 500 次提交，可逐批加载至 20,000 次；单次扫描最多 200 万个文件快照条目。统计按已加载历史计算，合并 Diff 相对第一父提交。JSON 不含源代码或 Diff；提交说明和文件路径仍可能含敏感文字，请在分享前自行检查。Commit time does not perfectly represent actual coding time.
