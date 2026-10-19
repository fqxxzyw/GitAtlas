import type { AtlasError } from '../src/core/model';
export class GitAtlasFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function mapError(error: unknown): AtlasError {
  const message = error instanceof Error ? error.message : String(error);
  let code = error instanceof GitAtlasFailure ? error.code : 'GIT_FAILED';
  if (/ENOENT|not found.*git|spawn git/i.test(message) && !(error instanceof GitAtlasFailure))
    code = 'GIT_NOT_FOUND';
  if (/EACCES|EPERM|permission denied/i.test(message)) code = 'PERMISSION';
  const labels: Record<string, [string, string]> = {
    INVALID_URL: [
      '仓库链接无效',
      '请输入 https://github.com/所有者/仓库名，可带 .git。暂不支持 SSH、GitLab 或文件页面链接。',
    ],
    REMOTE_FAILED: [
      '无法下载仓库',
      '请检查网络与仓库链接。私有仓库需要登录且具有访问权限；组织仓库可能需要管理员授权。',
    ],
    REMOTE_TIMEOUT: ['连接超时', '网络请求或授权等待超时，请检查连接并重试。'],
    NETWORK: ['GitHub 连接失败', '请检查网络后重试。已下载仓库可从本地缓存离线打开。'],
    API_LIMIT: ['GitHub 暂时拒绝请求', '可能达到请求限额，或组织尚未授权访问。请稍后重试并检查组织授权。'],
    AUTH_REQUIRED: ['需要重新登录', 'GitHub 授权不可用或已过期，请退出后重新登录。'],
    AUTH_FAILED: [
      '登录未完成',
      '授权可能被拒绝、取消或已过期。请重试，并安装当前版本的 Git for Windows 与 Git Credential Manager。',
    ],
    GCM_MISSING: [
      '缺少 Git Credential Manager',
      '请安装 Git for Windows，并勾选 Git Credential Manager。公开链接仍可不登录读取。',
    ],
    CACHE_MISSING: ['缓存不可用', '缓存目录可能已移动或删除，请通过仓库链接重新下载。'],
    CACHE_IN_USE: ['当前仓库正在使用', '请先打开另一个本地仓库，再删除此缓存。'],
    CACHE_LIMIT: ['缓存已达上限', '最多保存 100 个远程仓库，请先删除不再需要的缓存。'],
    GIT_NOT_FOUND: [
      '未找到 Git',
      '请安装 Git for Windows，并重新打开 GitAtlas。你仍然可以导入历史 JSON 或体验演示。',
    ],
    INVALID_REPOSITORY: ['不是 Git 仓库', '请选择一个已有 Git 历史的项目文件夹。'],
    REPOSITORY_NOT_FOUND: ['仓库不存在', '目录可能已移动，请重新选择。'],
    PERMISSION: ['无法访问目录', '请检查你是否有读取该目录的权限。'],
    UNKNOWN_COMMIT: ['提交不可用', '该提交不在当前已加载历史中，请刷新仓库。'],
    UNKNOWN_BRANCH: ['分支不可用', '分支引用可能已经变化，请重新打开仓库。'],
    CANCELLED: ['扫描已取消', '你可以重新选择仓库。'],
    BUSY: ['正在读取仓库', '请等待当前扫描完成，或先取消。'],
    INVALID_DATA: ['无法导入历史', '文件不是有效的 GitAtlas v1 历史，或超过数据容量限制。'],
    TOO_LARGE: ['仓库快照过大', '当前扫描超过 200 万个文件快照条目，请减少加载的提交数量。'],
    GIT_FAILED: ['无法读取 Git 历史', '请确认仓库完整、Git 可用且目录可读取，然后重试。'],
    NO_REPOSITORY: ['请先打开仓库', '此操作需要一个本地仓库。'],
  };
  const [title, detail] = labels[code] ?? labels.GIT_FAILED;
  return { code, title, message: detail, recoverable: true };
}
