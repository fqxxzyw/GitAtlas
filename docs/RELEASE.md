## GitAtlas v0.2.0 · 链接与账户

新增 GitHub 仓库链接和登录入口：

- 粘贴公开仓库 HTTPS 链接，下载完整 Git 历史并自动打开。
- 通过 Git Credential Manager 的官方设备授权登录，选择公开、私有和获准访问的组织仓库。
- 下载进度、取消、远程更新、离线打开、缓存删除。
- 凭据保存在 Windows 凭据管理器的独立 GitAtlas 命名空间，不与其他 Git 工具共用登录状态。
- 下载副本不检出工作文件，不执行项目代码、不拉取子模块，不修改远程仓库。

修复 Windows 长路径与 8.3 短路径混用导致的缓存返回值不一致；下载、刷新和离线打开统一返回经过边界校验的规范路径，保留单个缓存的符号链接／目录联接保护，并拒绝整个缓存根目录被替换为目录联接。

连接弹窗补充方向键、Home / End 标签切换、焦点循环与恢复、操作中的取消按钮聚焦；增加半透明模糊材质和弹簧入场，并尊重减少动态效果。保留原有历史播放器、精确快照、Diff、统计与导入导出。内容界面仍是 Electron + React，不是原生 WinUI 3 或苹果专有 Liquid Glass 渲染。

验证：Windows lint、48 项单元／集成测试、30 项打包后 Electron 桌面检查通过；发布工作流会再次执行全部检查。详见 [验证记录](https://github.com/fqxxzyw/GitAtlas/blob/main/docs/VERIFICATION.md)。

### 下载

- `GitAtlas-Setup-x64.exe`：安装版，可选择目录。
- `GitAtlas-Portable-x64.exe`：免安装版，设置与缓存保存在系统用户应用数据目录。
- `SHA256SUMS.txt`：SHA-256 校验值。
- `GitAtlas-verification.json`：Windows 桌面验证报告。

读取仓库需要 Git for Windows；登录还需要安装时勾选 Git Credential Manager。不登录也可读取公开链接。组织私有仓库可能需要管理员批准；GCM 的授权页会展示其实际权限。退出仅清除授权，已下载的私有历史可在缓存页删除。

自动化覆盖真实公开 GitHub 仓库下载、离线读取、缓存清理、URL 校验和原有桌面功能；登录协议、凭据隔离与取消路径使用测试替身验证。真实账户、2FA 和私有仓库下载尚未验证，需用户在官方页面完成授权；没有在 CI 中使用用户令牌。模拟私有仓库列表不等于私有仓库下载测试通过。

首次登录验收：安装 Git for Windows（包含 GCM），重启 GitAtlas → GitHub 账户 → 登录 GitHub → 打开官方授权页面 `https://github.com/login/device`，输入应用当前显示的验证码 → 确认 Git Credential Manager 授权 → 选择自己有权限的私有测试仓库。检查下载、退出和离线打开；最后切换到另一个本地仓库，删除测试缓存。不需要发送密码或 Token。

应用未签名，Windows 可能提示未知发布者。Windows 11 Mica 和显示缩放效果依具体设备而定。截图未公开上传。
