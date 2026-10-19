import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  Activity as ActivityIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  FolderOpen,
  Gauge,
  GitBranch,
  GitCompareArrows,
  History,
  Layers,
  Loader2,
  Monitor,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  X,
  Plus,
  RotateCcw,
  Trash2,
  Keyboard,
  Github,
  Link,
} from 'lucide-react';
import { useAtlas, type View, day } from './core/store';
import { makeDemo } from './core/demo';
import { exportHistory, validateHistory } from './core/transfer';
import type { HistoryData, RecentRepository, Result } from './core/model';
import { Overview } from './components/Overview';
import { Timeline, Files } from './components/Timeline';
import { Growth, Activity, Contributors, Compare } from './components/Insights';
import { Player } from './components/Player';
import { RemoteHub } from './components/RemoteHub';
import { Empty, MagneticButton } from './components/ui';
const navigation: { id: View; name: string; english: string; icon: typeof Gauge }[] = [
  { id: 'overview', name: '项目概览', english: 'Overview', icon: Gauge },
  { id: 'timeline', name: '时光回溯', english: 'Time machine', icon: History },
  { id: 'files', name: '文件足迹', english: 'Files', icon: FolderOpen },
  { id: 'growth', name: '生长视图', english: 'Growth', icon: Layers },
  { id: 'activity', name: '活动节奏', english: 'Activity', icon: ActivityIcon },
  { id: 'contributors', name: '贡献者', english: 'Contributors', icon: Users },
  { id: 'compare', name: '快照对比', english: 'Compare', icon: GitCompareArrows },
];
type Theme = 'light' | 'dark' | 'system';
function initialTheme(): Theme {
  try {
    const value = localStorage.getItem('atlas-theme');
    return value === 'dark' || value === 'light' ? value : 'system';
  } catch {
    return 'system';
  }
}
export default function App() {
  const { data, index, view, busy, error, progress, query, load, set } = useAtlas();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [settings, setSettings] = useState(false);
  const [remoteHub, setRemoteHub] = useState(false);
  const [recents, setRecents] = useState<RecentRepository[]>([]);
  const [gitStatus, setGitStatus] = useState<boolean | null>(null);
  const [toast, setToast] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const importer = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);
  useEffect(() => {
    if (!settings) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.settings-panel');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]') ?? [],
      );
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSettings(false);
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      previous?.focus();
    };
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('atlas-theme', theme);
    } catch {
      /* Theme still works without storage. */
    }
    void window.gitAtlas?.theme(theme);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  const refreshRecents = useCallback(async () => {
    const r = await window.gitAtlas?.recent();
    if (r?.ok) setRecents(r.data);
  }, []);
  useEffect(() => {
    if (!window.gitAtlas) return;
    void window.gitAtlas.status().then((r) => {
      if (r.ok) setGitStatus(r.data.git);
    });
    void refreshRecents();
    return window.gitAtlas.onProgress((p) => set({ progress: p }));
  }, [refreshRecents, set]);
  const accept = useCallback(
    async (promise: Promise<Result<HistoryData | null>>) => {
      set({ busy: true, playing: false, error: null });
      try {
        const r = await promise;
        if (r.ok && r.data) {
          load(r.data);
          set({ view: 'overview' });
          await refreshRecents();
        } else if (!r.ok) set({ error: r.error });
      } catch {
        set({
          error: {
            code: 'CONNECTION',
            title: '操作未完成',
            message: '请重新打开应用后重试。',
            recoverable: true,
          },
        });
      } finally {
        set({ busy: false, progress: null });
      }
    },
    [load, set, refreshRecents],
  );
  const open = useCallback(() => {
    if (window.gitAtlas) void accept(window.gitAtlas.openRepository());
    else notify('本地仓库读取需要 GitAtlas 桌面版。网页预览支持导入 JSON 和演示。');
  }, [accept, notify]);
  const importData = useCallback(() => {
    if (window.gitAtlas) void accept(window.gitAtlas.importHistory());
    else importer.current?.click();
  }, [accept]);
  const exportData = useCallback(async () => {
    const current = useAtlas.getState().data;
    if (!current) return;
    try {
      if (window.gitAtlas) {
        const r = await window.gitAtlas.exportHistory(current);
        if (!r.ok) set({ error: r.error });
        else if (r.data) notify('历史已导出，未包含源代码或 Diff。');
      } else {
        const blob = new Blob([exportHistory(current)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'GitAtlas-history.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        notify('历史元数据已导出。');
      }
    } catch {
      notify('导出失败，请检查历史数据。');
    }
  }, [notify, set]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const editing =
        target instanceof HTMLElement &&
        (target.matches('input,textarea,select') || target.isContentEditable);
      if (remoteHub) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          open();
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          search.current?.focus();
        } else if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          void exportData();
        }
        return;
      }
      if (editing || settings || busy) return;
      const state = useAtlas.getState();
      if (!state.data?.commits.length) return;
      if ([' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) e.preventDefault();
      if (e.key === ' ') state.play();
      else if (e.key === 'ArrowLeft') {
        state.seek(state.index - 1);
        state.set({ playing: false });
      } else if (e.key === 'ArrowRight') {
        state.seek(state.index + 1);
        state.set({ playing: false });
      } else if (e.key === 'Home') state.seek(0);
      else if (e.key === 'End') state.seek(state.data.commits.length - 1);
      else if (e.key.toLowerCase() === 'f') {
        document.getElementById('commit-list')?.scrollTo({
          top: 0,
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, exportData, settings, busy, remoteHub]);
  const scan = async (branch: string, limit: number) => {
    if (window.gitAtlas) await accept(window.gitAtlas.scan(branch, limit));
  };
  const demo = () => {
    load(makeDemo());
    set({ view: 'overview' });
  };
  const forget = async (path: string) => {
    const r = await window.gitAtlas?.forget(path);
    if (r?.ok) setRecents(r.data);
  };
  const body: Record<View, ReactNode> = {
    overview: <Overview />,
    timeline: <Timeline />,
    files: <Files />,
    growth: <Growth />,
    activity: <Activity />,
    contributors: <Contributors />,
    compare: <Compare key={`${data?.repository}-${data?.branch}`} />,
  };
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <div className="desktop-titlebar">
          <div className="brand-mark">
            <Compass size={18} />
          </div>
          <strong>GitAtlas</strong>
          <span>Git 提交历史可视化时光机</span>
          <span className="titlebar-spacer" />
          <span className="titlebar-local">
            <ShieldCheck size={12} /> LOCAL FIRST
          </span>
        </div>
        <header className="toolbar">
          <button className="workspace-switch" onClick={open} disabled={busy}>
            <span className="workspace-icon">
              <FolderOpen size={18} />
            </span>
            <span>
              <strong>{data?.repository ?? '你的项目空间'}</strong>
              <small>{data ? 'Repository workspace' : 'Open a local repository'}</small>
            </span>
            <ChevronDown size={14} />
          </button>
          {data && (
            <div className="branch-select">
              <GitBranch size={15} />
              <select
                aria-label="当前分支"
                value={data.branch}
                disabled={busy || data.source !== 'local'}
                onChange={(e) => void scan(e.target.value, 500)}
              >
                {data.branches.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
          <div className="toolbar-space" />
          <button
            className="icon-button"
            title="连接 GitHub 仓库"
            aria-label="连接 GitHub 仓库"
            disabled={busy}
            onClick={() => {
              set({ playing: false });
              setRemoteHub(true);
            }}
          >
            <Github size={19} />
          </button>
          {data && (
            <div className="search-box">
              <Search size={16} />
              <input
                ref={search}
                aria-label="搜索提交"
                placeholder="搜索提交、作者、文件…"
                value={query}
                onChange={(e) => set({ query: e.target.value, view: 'timeline' })}
              />
              <kbd>Ctrl F</kbd>
            </div>
          )}
          <button
            className="icon-button"
            title="导入 JSON"
            aria-label="导入 JSON"
            onClick={importData}
            disabled={busy}
          >
            <ArrowUpFromLine size={18} />
          </button>
          <button
            className="icon-button"
            title="导出历史 · Ctrl E"
            aria-label="导出历史"
            onClick={() => void exportData()}
            disabled={!data || busy}
          >
            <ArrowDownToLine size={18} />
          </button>
          <div className="toolbar-divider" />
          <button className="icon-button" title="设置" aria-label="设置" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
          </button>
        </header>
        {data ? (
          <>
            <aside className="sidebar">
              <span className="nav-heading">探索你的项目</span>
              <nav>
                {navigation.map((item) => (
                  <button
                    key={item.id}
                    className={view === item.id ? 'active' : ''}
                    onClick={() => set({ view: item.id })}
                  >
                    {view === item.id && (
                      <motion.span
                        className="nav-selection"
                        layoutId="navigation-selection"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                    <item.icon size={19} />
                    <span>
                      {item.name}
                      <small>{item.english}</small>
                    </span>
                    {view === item.id && <i />}
                  </button>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <div className="local-card">
                  <ShieldCheck size={21} />
                  <strong>你的源码，留在本地。</strong>
                  <p>
                    没有上传，没有遥测。
                    <br />
                    只读探索，不改变仓库。
                  </p>
                </div>
                <button className="new-repo" onClick={open} disabled={busy}>
                  <Plus size={16} /> 打开另一个仓库
                </button>
                <span className="version">
                  GITATLAS <span>v0.2.0</span>
                </span>
              </div>
            </aside>
            <main className="main-content">
              {data.source !== 'local' && (
                <div className="source-banner">
                  <span className="status-dot" />
                  {data.source === 'demo'
                    ? '演示仓库 · 合成历史数据，用于体验交互'
                    : '导入历史 · 元数据模式，未包含源码或 Diff'}
                  <button onClick={open}>
                    打开本地仓库 <ArrowUpRight size={12} />
                  </button>
                </div>
              )}
              {data.commits.length < data.totalCommits && (
                <div className="source-banner">
                  共 {data.totalCommits} 次提交，显示最近 {data.commits.length} 次；统计仅基于已加载部分。
                  <button
                    disabled={busy || data.commits.length >= 20000 || data.source !== 'local'}
                    onClick={() => void scan(data.branch, Math.min(20000, data.commits.length + 500))}
                  >
                    加载更多
                  </button>
                </div>
              )}
              {data.shallow && (
                <div className="source-banner">此仓库为浅克隆，最早记录和文件年龄可能不完整。</div>
              )}
              {data.commits.length ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={view + data.repository + data.branch}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                  >
                    {body[view]}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <Empty
                  title="这里，等待第一步。"
                  detail="这个 Git 仓库还没有提交。完成第一次提交后重新打开即可。"
                />
              )}
            </main>
            <Player />
          </>
        ) : (
          <main className="welcome">
            <div className="welcome-emblem">
              <Compass size={48} strokeWidth={1.2} />
              <span />
              <i />
            </div>
            <span className="eyebrow">A TIME MACHINE FOR YOUR CODE</span>
            <h1>
              把项目的故事，
              <br />
              <em>重新播放一遍。</em>
            </h1>
            <p>
              回溯每次提交，探索文件的演化。
              <br />
              从最初的灵感，到今天的每一行改变。
            </p>
            <div className="welcome-actions">
              <MagneticButton className="primary large" onClick={open} disabled={busy}>
                <FolderOpen size={19} /> 打开本地仓库 <kbd>Ctrl O</kbd>
              </MagneticButton>
              <MagneticButton className="large" onClick={importData} disabled={busy}>
                <ArrowUpFromLine size={18} /> 导入历史 JSON
              </MagneticButton>
            </div>
            <button className="remote-welcome-button" disabled={busy} onClick={() => setRemoteHub(true)}>
              <Link size={17} />
              添加仓库链接<span>或登录 GitHub</span>
              <ArrowUpRight size={15} />
            </button>
            <button className="demo-link" onClick={demo}>
              先体验一个演示仓库 <ArrowUpRight size={15} />
            </button>
            {gitStatus === false && (
              <div className="git-notice">
                未检测到 Git。请安装 Git for Windows 后重启应用；导入与演示功能仍可使用。
              </div>
            )}
            {!!recents.length && (
              <div className="recent-repos">
                <div className="recent-heading">
                  最近打开 <span>{recents.length} 个仓库</span>
                </div>
                {recents.map((r) => (
                  <div key={r.path}>
                    <button onClick={() => window.gitAtlas && void accept(window.gitAtlas.reopen(r.path))}>
                      <FolderOpen size={18} />
                      <span>
                        <strong>{r.name}</strong>
                        <small>{r.path}</small>
                      </span>
                      <small>{day(r.openedAt)}</small>
                    </button>
                    <button
                      className="icon-button"
                      title="移除最近记录"
                      aria-label={`移除 ${r.name}`}
                      onClick={() => void forget(r.path)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="welcome-privacy">
              <ShieldCheck size={14} /> 本地优先 <span>·</span> 仓库只读 <span>·</span> 无需登录
            </div>
          </main>
        )}
        <input
          ref={importer}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 50 * 1024 * 1024) throw new Error();
              load(validateHistory(JSON.parse(await file.text())));
              set({ view: 'overview' });
            } catch {
              set({
                error: {
                  code: 'INVALID_DATA',
                  title: '无法导入',
                  message: '请选择有效的 GitAtlas v1 历史 JSON（小于 50 MB）。',
                  recoverable: true,
                },
              });
            }
            e.target.value = '';
          }}
        />
        {error && (
          <div className="error-toast" role="alert">
            <div>
              <strong>{error.title}</strong>
              <p>{error.message}</p>
            </div>
            <button className="icon-button" aria-label="关闭错误" onClick={() => set({ error: null })}>
              <X size={17} />
            </button>
          </div>
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
        {busy && (
          <div className="overlay">
            <div className="loading-card panel" role="status">
              <Loader2 size={32} className="spin" />
              <h2>{progress?.stage ?? '准备打开项目'}</h2>
              <p>正在把提交，整理为可以探索的时间。</p>
              <progress max={progress?.total || 1} value={progress?.current || 0} />
              <small>
                {progress?.current ?? 0} / {progress?.total || '…'}
              </small>
              <button className="text-button" onClick={() => void window.gitAtlas?.cancelScan()}>
                取消扫描
              </button>
            </div>
          </div>
        )}
        {remoteHub && (
          <RemoteHub
            onClose={() => setRemoteHub(false)}
            onLoaded={(next) => {
              load(next);
              set({ view: 'overview', progress: null });
              setRemoteHub(false);
              void refreshRecents();
            }}
          />
        )}
        {settings && (
          <div className="overlay" onClick={() => setSettings(false)}>
            <section
              className="settings-panel panel"
              role="dialog"
              aria-modal="true"
              aria-label="设置"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel-heading">
                <div>
                  <h2>让空间，适合你。</h2>
                  <p>Preferences</p>
                </div>
                <button className="icon-button" aria-label="关闭设置" onClick={() => setSettings(false)}>
                  <X size={18} />
                </button>
              </div>
              <h3>外观</h3>
              <div className="theme-options">
                {(
                  [
                    { id: 'light', label: '浅色', icon: Sun },
                    { id: 'dark', label: '深色', icon: Moon },
                    { id: 'system', label: '跟随系统', icon: Monitor },
                  ] as const
                ).map((t) => (
                  <button
                    className={theme === t.id ? 'active' : ''}
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                  >
                    <t.icon size={22} />
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="muted">
                动效自动遵循系统“减少动态效果”设置。Windows 11 使用原生窗口控制与 Mica 背景。
              </p>
              <h3>
                <Keyboard size={16} /> 快捷键
              </h3>
              <div className="shortcut-grid">
                {[
                  ['Space', '播放 / 暂停'],
                  ['← / →', '上一次 / 下一次'],
                  ['Home / End', '最早 / 最新'],
                  ['Ctrl O', '打开仓库'],
                  ['Ctrl F', '搜索提交'],
                  ['Ctrl E', '导出历史'],
                  ['F', '归位提交图'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </div>
              <h3>结构化搜索</h3>
              <p className="search-help">
                author:zheng login
                <br />
                file:Header.tsx after:2026-01-01
                <br />
                message:"fix navigation" before:2026-06-01
              </p>
              {data?.source === 'local' && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setSettings(false);
                    void scan(data.branch, data.commits.length || 500);
                  }}
                >
                  <RotateCcw size={16} /> 刷新仓库历史
                </button>
              )}
              {!!recents.length && (
                <>
                  <h3>最近的仓库</h3>
                  {recents.map((r) => (
                    <div className="recent-setting" key={r.path}>
                      <span title={r.path}>{r.name}</span>
                      <button
                        className="icon-button"
                        aria-label={`忘记 ${r.name}`}
                        onClick={() => void forget(r.path)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
              <div className="settings-footer">
                GitAtlas 0.2.0 · MIT
                <br />
                此刻：{data?.commits[index]?.shortHash ?? '尚未打开项目'}
              </div>
            </section>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
