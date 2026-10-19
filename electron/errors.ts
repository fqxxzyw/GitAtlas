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
