import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Github,
  Link,
  HardDrive,
  X,
  Download,
  LogOut,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Trash2,
  Loader2,
  Check,
  Copy,
} from 'lucide-react';
import type {
  GitHubAccount,
  GitHubRepository,
  RemoteCache,
  RemoteProgress,
  HistoryData,
  Result,
} from '../core/model';
import { day } from '../core/store';

export function RemoteHub({
  onClose,
  onLoaded,
}: {
  onClose: () => void;
  onLoaded: (data: HistoryData) => void;
}) {
  const [tab, setTab] = useState<'link' | 'github' | 'cache'>('link');
  const [url, setURL] = useState('');
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [repos, setRepos] = useState<GitHubRepository[]>([]);
  const [caches, setCaches] = useState<RemoteCache[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<RemoteProgress | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const statusPanel = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const wasBusy = useRef(false);
  const reducedMotion = useReducedMotion();
  const api = window.gitAtlas;
  useEffect(() => {
    if (busy) {
      statusPanel.current?.scrollIntoView({ block: 'nearest' });
      statusPanel.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    } else if (wasBusy.current && !panel.current?.contains(document.activeElement)) {
      panel.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy, progress?.deviceCode]);
  const unwrap = <T,>(result: Result<T>): T => {
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  };
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError('');
      setProgress(null);
      setCopied(false);
      try {
        await fn();
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : '操作未完成，请重试。');
      } finally {
        if (mounted.current) {
          setBusy(false);
          setProgress(null);
          // A clone can succeed even when its subsequent history scan is cancelled.
          void api?.remoteCaches().then((r) => {
            if (mounted.current && r.ok) setCaches(r.data);
          });
        }
      }
    },
    [api],
  );
  useEffect(() => {
    mounted.current = true;
    if (!api) return;
    void api.remoteStatus().then((r) => {
      if (mounted.current && r.ok) {
        setAvailable(r.data.available);
        setAccount(r.data.account);
      }
    });
    void api.remoteCaches().then((r) => {
      if (mounted.current && r.ok) setCaches(r.data);
    });
    const dispose = api.onRemoteProgress(setProgress);
    const scan = api.onProgress((p) =>
      setProgress({
        kind: 'download',
        stage: p.stage,
        percent: p.total ? Math.round((p.current / p.total) * 100) : undefined,
      }),
    );
    return () => {
      mounted.current = false;
      dispose();
      scan();
    };
  }, [api]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]),input:not(:disabled),a[href]',
        ) ?? [],
      );
      const first = items[0],
        last = items.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current ||
          !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [busy, onClose]);
  const loadRepositories = async (next: number) => {
    if (!api) return;
    const data = unwrap(await api.githubRepositories(next));
    setRepos((prev) =>
      next === 1
        ? data.repositories
        : [...prev, ...data.repositories.filter((r) => !prev.some((p) => p.fullName === r.fullName))],
    );
    setPage(next);
    setHasMore(data.hasMore);
  };
  const open = (link: string) => {
    if (api) void run(async () => onLoaded(unwrap(await api.remoteOpen(link))));
  };
  const login = () => {
    if (api)
      void run(async () => {
        const user = unwrap(await api.githubLogin());
        setAccount(user);
        await loadRepositories(1);
      });
  };
  return (
    <div
      className="overlay remote-overlay"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <motion.section
        className="panel remote-hub"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 30 }}
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="连接 GitHub 仓库"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="remote-heading">
          <span className="remote-symbol">
            <Github size={27} />
          </span>
          <div>
            <span className="eyebrow">YOUR REPOSITORIES, CONNECTED</span>
            <h2>把远方的项目，带回这里。</h2>
            <p>通过链接或 GitHub 账户，探索完整的提交历史。</p>
          </div>
          <button className="icon-button" aria-label="关闭仓库连接" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="remote-tabs" role="tablist" aria-label="仓库来源">
          {(
            [
              { id: 'link', label: '仓库链接', icon: Link },
              { id: 'github', label: 'GitHub 账户', icon: Github },
              { id: 'cache', label: '本地缓存', icon: HardDrive },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`remote-tab-${t.id}`}
              aria-controls="remote-content"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              disabled={busy}
              className={tab === t.id ? 'selected' : ''}
              onClick={() => {
                setTab(t.id);
                setError('');
              }}
              onKeyDown={(event) => {
                const ids = ['link', 'github', 'cache'] as const;
                const index = ids.indexOf(t.id);
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % 3
                    : event.key === 'ArrowLeft'
                      ? (index + 2) % 3
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? 2
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                setTab(ids[next]);
                setError('');
                document.getElementById(`remote-tab-${ids[next]}`)?.focus();
              }}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>
        {!api && (
          <div className="remote-notice">连接 GitHub 需要 Windows 桌面版。网页预览支持历史 JSON 与演示。</div>
        )}
        <div
          className="remote-body"
          id="remote-content"
          role="tabpanel"
          aria-labelledby={`remote-tab-${tab}`}
        >
          {tab === 'link' && (
            <div className="remote-link-view">
              <label htmlFor="github-url">GitHub 仓库链接</label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  open(url);
                }}
              >
                <div className="remote-url">
                  <Link size={18} />
                  <input
                    autoComplete="off"
                    spellCheck={false}
                    id="github-url"
                    type="url"
                    required
                    maxLength={500}
                    placeholder="https://github.com/owner/repository"
                    value={url}
                    onChange={(e) => setURL(e.target.value)}
                    disabled={busy || !api}
                  />
                </div>
                <button className="button primary" disabled={busy || !api || !url.trim()}>
                  <Download size={17} />
                  下载并打开
                </button>
              </form>
              <p>公开仓库无需登录。私有仓库请先在“GitHub 账户”中授权。</p>
              <div className="remote-how">
                <span>
                  01 <strong>粘贴链接</strong>
                </span>
                <i />
                <span>
                  02 <strong>下载历史</strong>
                </span>
                <i />
                <span>
                  03 <strong>本地探索</strong>
                </span>
              </div>
              <div className="remote-note">
                <HardDrive size={19} />
                <p>
                  完整 Git
                  历史会保存在本机，大型仓库首次下载可能耗时。已有缓存会先获取更新；离线时可在“本地缓存”直接打开。仅支持
                  github.com 的 HTTPS 仓库链接。
                </p>
              </div>
              {account && (
                <div className="remote-account-mini">
                  <Check size={15} />
                  已连接 @{account.login}
                </div>
              )}
            </div>
          )}
          {tab === 'github' && (
            <>
              {!account ? (
                <div className="remote-signin">
                  <Github size={44} strokeWidth={1.3} />
                  <h3>你的仓库，一个入口。</h3>
                  <p>
                    登录后查看公开、私有及获准访问的组织仓库。
                    <br />在 GitHub 官方页面授权，不在 GitAtlas 中输入密码。
                  </p>
                  <button
                    className="button primary"
                    disabled={busy || !api || available !== true}
                    onClick={login}
                  >
                    <Github size={17} />
                    登录 GitHub
                  </button>
                  <small>授权由 Git Credential Manager 提供；凭据保存在独立的系统凭据空间。</small>
                  {available === false && (
                    <div className="remote-notice">
                      请安装 Git for Windows，并勾选 Git Credential Manager。安装后重启 GitAtlas。
                    </div>
                  )}
                  {available === null && api && <small>正在检查 Git Credential Manager…</small>}
                </div>
              ) : (
                <>
                  <div className="remote-account">
                    <span className="account-avatar">{account.login.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{account.name}</strong>
                      <small>@{account.login}</small>
                    </div>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (api) {
                            unwrap(await api.githubLogout());
                            setAccount(null);
                            setRepos([]);
                            setPage(0);
                            setHasMore(false);
                          }
                        })
                      }
                    >
                      <LogOut size={15} />
                      退出登录
                    </button>
                  </div>
                  <p className="remote-caption">只读查看已有权限的仓库。组织仓库可能需要管理员批准授权。</p>
                  <div className="remote-list-toolbar">
                    <input
                      aria-label="筛选 GitHub 仓库"
                      placeholder="筛选已加载的仓库…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      disabled={busy}
                    />
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void run(() => loadRepositories(1))}
                    >
                      <RefreshCw size={15} />
                      {page ? '刷新列表' : '读取我的仓库'}
                    </button>
                  </div>
                  <div className="remote-repo-list">
                    {repos
                      .filter((r) => r.fullName.toLowerCase().includes(search.toLowerCase()))
                      .map((r) => (
                        <button
                          className="remote-repo"
                          key={r.fullName}
                          disabled={busy}
                          onClick={() => open(`https://github.com/${r.fullName}`)}
                        >
                          <Github size={19} />
                          <span>
                            <strong>
                              {r.fullName} {r.private && <LockKeyhole size={12} aria-label="私有仓库" />}
                            </strong>
                            <small>{r.description || '尚无仓库描述'}</small>
                          </span>
                          <Download size={16} />
                        </button>
                      ))}
                    {page > 0 && !repos.length && (
                      <p className="remote-empty">此账户暂时没有可读取的仓库。</p>
                    )}
                    {!!repos.length &&
                      !repos.some((r) => r.fullName.toLowerCase().includes(search.toLowerCase())) && (
                        <p className="remote-empty">已加载的仓库中没有匹配项。可继续加载或直接粘贴链接。</p>
                      )}
                  </div>
                  {hasMore && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void run(() => loadRepositories(page + 1))}
                    >
                      加载更多仓库
                    </button>
                  )}
                  <small>
                    退出登录会清除 GitAtlas 的授权凭据。已下载的仓库仍保留，可在“本地缓存”中删除。
                  </small>
                </>
              )}
            </>
          )}
          {tab === 'cache' && (
            <>
              <div className="remote-list-toolbar">
                <p>{caches.length} 个已下载仓库 · 可离线打开</p>
                <button
                  className="icon-button"
                  aria-label="刷新本地缓存"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (api) setCaches(unwrap(await api.remoteCaches()));
                    })
                  }
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="remote-repo-list">
                {caches.map((c) => (
                  <div className="remote-cache" key={c.id}>
                    <HardDrive size={21} />
                    <div>
                      <strong>{c.fullName}</strong>
                      <small>上次同步 {day(c.updatedAt)}</small>
                    </div>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (api) onLoaded(unwrap(await api.remoteOpenCache(c.id)));
                        })
                      }
                    >
                      离线打开
                    </button>
                    <button
                      className="icon-button"
                      title="更新并打开"
                      aria-label={`更新 ${c.fullName}`}
                      disabled={busy}
                      onClick={() => open(`https://github.com/${c.fullName}`)}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`删除缓存 ${c.fullName}`}
                      disabled={busy}
                      onClick={() => setRemoving(c.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                    {removing === c.id && (
                      <div className="cache-confirm">
                        <p>删除本机下载副本和分析缓存？远程仓库不受影响。</p>
                        <button className="button" disabled={busy} onClick={() => setRemoving(null)}>
                          保留
                        </button>
                        <button
                          className="button danger"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              if (api) {
                                unwrap(await api.remoteRemoveCache(c.id));
                                setCaches(unwrap(await api.remoteCaches()));
                                setRemoving(null);
                              }
                            })
                          }
                        >
                          确认删除
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!caches.length && (
                  <div className="remote-empty">
                    <HardDrive size={32} />
                    <p>还没有下载过仓库。</p>
                    <small>通过链接或账户添加后，会在这里保留本地副本。</small>
                  </div>
                )}
              </div>
            </>
          )}
          {error && (
            <div className="remote-error" role="alert">
              {error}
            </div>
          )}
          {busy && (
            <div className="remote-progress" ref={statusPanel} role="status">
              <div>
                <Loader2 className="spin" size={18} />
                <strong>{progress?.stage ?? '正在连接…'}</strong>
              </div>
              {progress?.deviceCode ? (
                <>
                  <div className="device-code">
                    <code>{progress.deviceCode}</code>
                    <button
                      className="icon-button"
                      aria-label="复制授权码"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(progress.deviceCode!)
                          .then(() => setCopied(true))
                          .catch(() => setError('无法自动复制，请手动输入授权码。'))
                      }
                    >
                      {copied ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                  <button
                    className="button primary"
                    onClick={() =>
                      void api?.openGitHubAuthorization().then((r) => {
                        if (!r.ok) setError(r.error.message);
                      })
                    }
                  >
                    <ExternalLink size={16} />
                    打开 GitHub 授权页面
                  </button>
                  <small>
                    核对授权页面中的 Git Credential Manager，再输入上方验证码。验证码过期后请重新登录。
                  </small>
                </>
              ) : (
                <progress max={100} value={progress?.percent} />
              )}
              <button
                className="text-button"
                data-cancel
                onClick={() => {
                  void api?.remoteCancel();
                }}
              >
                取消当前操作
              </button>
            </div>
          )}
        </div>
        <footer className="remote-footer">
          <LockKeyhole size={13} />
          仅在你连接或更新时访问 GitHub · 历史分析在本地完成
        </footer>
      </motion.section>
    </div>
  );
}
