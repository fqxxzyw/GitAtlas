export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
  binary?: boolean;
  oldPath?: string;
}
export interface RepositoryFile {
  path: string;
  oid: string;
  mode: string;
}
export interface RepositorySnapshot {
  commitHash: string;
  totalFiles: number;
  files: RepositoryFile[];
}
export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email?: string;
  date: string;
  parents: string[];
  branchRefs: string[];
  stats: { filesChanged: number; insertions: number; deletions: number };
  changes: FileChange[];
}
export interface HistoryData {
  version: 1;
  repository: string;
  branch: string;
  branches: string[];
  totalCommits: number;
  commits: GitCommit[];
  snapshots: Record<string, RepositorySnapshot>;
  shallow: boolean;
  source: 'local' | 'import' | 'demo';
  firstCommit?: { hash: string; message: string; date: string };
  scannedAt: string;
}
export interface AtlasError {
  code: string;
  title: string;
  message: string;
  recoverable: boolean;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: AtlasError };
export interface RecentRepository {
  path: string;
  name: string;
  openedAt: string;
}
export interface ScanProgress {
  stage: string;
  current: number;
  total: number;
}
export interface DesktopAPI {
  remoteStatus(): Promise<Result<{ available: boolean; account: GitHubAccount | null }>>;
  githubLogin(): Promise<Result<GitHubAccount>>;
  githubLogout(): Promise<Result<void>>;
  githubRepositories(page: number): Promise<Result<{ repositories: GitHubRepository[]; hasMore: boolean }>>;
  remoteOpen(url: string): Promise<Result<HistoryData>>;
  remoteCaches(): Promise<Result<RemoteCache[]>>;
  remoteOpenCache(id: string): Promise<Result<HistoryData>>;
  remoteRemoveCache(id: string): Promise<Result<void>>;
  remoteCancel(): Promise<Result<void>>;
  openGitHubAuthorization(): Promise<Result<void>>;
  onRemoteProgress(callback: (progress: RemoteProgress) => void): () => void;
  status(): Promise<Result<{ git: boolean; version: string; platform: string }>>;
  openRepository(): Promise<Result<HistoryData | null>>;
  recent(): Promise<Result<RecentRepository[]>>;
  reopen(path: string): Promise<Result<HistoryData>>;
  forget(path: string): Promise<Result<RecentRepository[]>>;
  scan(branch: string, limit: number): Promise<Result<HistoryData>>;
  cancelScan(): Promise<Result<void>>;
  diff(hash: string, path: string): Promise<Result<string>>;
  compare(a: string, b: string): Promise<Result<FileChange[]>>;
  exportHistory(data: HistoryData): Promise<Result<boolean>>;
  importHistory(): Promise<Result<HistoryData | null>>;
  theme(value: 'light' | 'dark' | 'system'): Promise<Result<void>>;
  onProgress(callback: (progress: ScanProgress) => void): () => void;
}
declare global {
  interface Window {
    gitAtlas?: DesktopAPI;
  }
}

export interface GitHubAccount {
  login: string;
  name: string;
}
export interface GitHubRepository {
  fullName: string;
  description: string;
  private: boolean;
  updatedAt: string;
}
export interface RemoteCache {
  id: string;
  fullName: string;
  updatedAt: string;
}
export interface RemoteProgress {
  kind: 'login' | 'download';
  stage: string;
  percent?: number;
  deviceCode?: string;
}
