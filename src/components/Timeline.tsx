import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Search,
  X,
  FileCode2,
  Clock3,
} from 'lucide-react';
import { useAtlas, day, fmt } from '../core/store';
import { fileHistory, searchCommits } from '../core/history';
import type { GitCommit } from '../core/model';
import { FileTree } from './FileTree';
import { Empty, Panel, SectionTitle } from './ui';
function CommitGraph({ commits }: { commits: GitCommit[] }) {
  const positions = new Map<string, { y: number; lane: number }>();
  const active: string[] = [];
  let compressed = false;
  commits.forEach((c, i) => {
    let lane = active.indexOf(c.hash);
    if (lane < 0) {
      lane = active.findIndex((s) => !s);
      if (lane < 0) lane = active.length;
    }
    if (lane > 2) compressed = true;
    positions.set(c.hash, { y: i * 76 + 30, lane: lane % 3 });
    active[lane] = c.parents[0] ?? '';
    for (const parent of c.parents.slice(1))
      if (!active.includes(parent)) {
        const free = active.findIndex((s) => !s);
        if (free < 0) active.push(parent);
        else active[free] = parent;
      }
  });
  return (
    <svg
      className="commit-graph"
      width="64"
      height={commits.length * 76}
      aria-label={compressed ? '提交父子关系，超过三条分支压缩显示' : '提交父子关系'}
    >
      {commits.flatMap((c) => {
        const p = positions.get(c.hash)!;
        return c.parents.map((parent) => {
          const q = positions.get(parent);
          return q ? (
            <path
              key={`${c.hash}-${parent}`}
              d={`M${12 + p.lane * 19} ${p.y} C${12 + p.lane * 19} ${p.y + 30},${12 + q.lane * 19} ${q.y - 30},${12 + q.lane * 19} ${q.y}`}
              fill="none"
              stroke={p.lane === 0 ? '#91b2e8' : '#b1a3cc'}
              strokeWidth="1.5"
            />
          ) : (
            <path
              key={`${c.hash}-${parent}`}
              d={`M${12 + p.lane * 19} ${p.y}v25`}
              stroke="#a5b4c9"
              strokeDasharray="3 3"
            />
          );
        });
      })}
      {commits.map((c) => {
        const p = positions.get(c.hash)!;
        return (
          <circle
            key={c.hash}
            cx={12 + p.lane * 19}
            cy={p.y}
            r={c.parents.length > 1 ? 5 : 4}
            stroke="#5582c9"
            strokeWidth="2"
            fill="var(--surface)"
          />
        );
      })}
    </svg>
  );
}
export function DiffDetail({
  commit,
  path,
  onClose,
}: {
  commit: GitCommit;
  path: string;
  onClose: () => void;
}) {
  const { data } = useAtlas();
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let valid = true;
    setCopied(false);
    setDiff('');
    if (!path) return;
    if (data?.source !== 'local' || !window.gitAtlas) {
      setDiff('导入和演示历史只包含元数据，没有源码或 Diff。打开本地仓库即可查看真实差异。');
      return;
    }
    if (!commit.changes.some((f) => f.path === path)) {
      setDiff('此文件在当前提交中没有变化。请在文件生命周期中选择一次修改。');
      return;
    }
    setLoading(true);
    window.gitAtlas
      .diff(commit.hash, path)
      .then((result) => {
        if (valid) {
          setDiff(result.ok ? result.data : result.error.message);
          setLoading(false);
        }
      })
      .catch(() => {
        if (valid) {
          setDiff('差异读取失败，请重试。');
          setLoading(false);
        }
      });
    return () => {
      valid = false;
    };
  }, [commit, path, data?.source]);
  const history = data
    ? fileHistory(
        data,
        path,
        data.commits.findIndex((c) => c.hash === commit.hash),
      )
    : null;
  return (
    <Panel className="diff-panel">
      <div className="panel-heading">
        <div>
          <h3>
            <FileCode2 size={16} /> {path}
          </h3>
          <p>Unified Diff · {commit.shortHash}</p>
        </div>
        <div className="inline">
          <button
            className="icon-button"
            disabled={!diff || loading}
            title="复制 Diff"
            aria-label="复制 Diff"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(diff);
                setCopied(true);
              } catch {
                setDiff('复制失败，请手动选择差异文本复制。\n' + diff);
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button className="icon-button" onClick={onClose} aria-label="关闭差异">
            <X size={17} />
          </button>
        </div>
      </div>
      {history && (
        <div className="file-meta">
          <span>创建 {day(history.created)}</span>
          <span>最后修改 {day(history.lastModified)}</span>
          <span>
            {history.events.length} 次变更{history.partial ? ' · 历史不完整' : ''}
          </span>
        </div>
      )}
      <pre className="diff-content">
        {loading
          ? '正在读取差异…'
          : diff.split('\n').map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('+') && !line.startsWith('+++')
                    ? 'diff-add'
                    : line.startsWith('-') && !line.startsWith('---')
                      ? 'diff-remove'
                      : line.startsWith('@@')
                        ? 'diff-hunk'
                        : ''
                }
              >
                <span>{String(i + 1).padStart(3, ' ')}</span>
                {line || ' '}
              </div>
            ))}
      </pre>
    </Panel>
  );
}
export function Timeline() {
  const { data, index, query, seek, set } = useAtlas();
  const [age, setAge] = useState(false);
  const [changeView, setChangeView] = useState(false);
  const [path, setPath] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => (data ? searchCommits(data.commits, query).reverse() : []), [data, query]);
  useEffect(() => {
    setPath('');
  }, [index, data]);
  useEffect(() => setPage(0), [query]);
  if (!data || !data.commits.length)
    return <Empty title="还没有提交" detail="仓库的第一个提交完成后，这里会出现时间轴。" />;
  const commit = data.commits[index];
  const visible = filtered.slice(page * 100, (page + 1) * 100);
  const snapshot = data.snapshots[commit.hash];
  return (
    <div className="page timeline-page">
      <SectionTitle
        eyebrow="REPOSITORY TIME MACHINE"
        title="让历史，重新发生。"
        description="选择一次提交，探索那一刻的项目。"
        action={
          <div className="segmented">
            <button className={!changeView ? 'selected' : ''} onClick={() => setChangeView(false)}>
              提交视图
            </button>
            <button className={changeView ? 'selected' : ''} onClick={() => setChangeView(true)}>
              变化视图
            </button>
          </div>
        }
      />
      <div className="timeline-workspace">
        <Panel className="commit-list-panel">
          <div className="panel-heading">
            <h3>提交时间线</h3>
            <span className="count">{filtered.length}</span>
          </div>
          {query && (
            <div className="search-caption">
              <Search size={13} />
              {query}
              <button onClick={() => set({ query: '' })} aria-label="清除搜索">
                <X size={13} />
              </button>
            </div>
          )}
          <div className="commit-list" id="commit-list">
            <CommitGraph commits={visible} />
            {visible.map((c) => (
              <button
                title={c.message}
                className={`commit-row ${c.hash === commit.hash ? 'active' : ''}`}
                key={c.hash}
                onClick={() => seek(data.commits.findIndex((x) => x.hash === c.hash))}
              >
                <strong>{c.message}</strong>
                <span>
                  {c.author}
                  <i /> {day(c.date).slice(5)} {c.parents.length > 1 && <GitMerge size={12} />}
                </span>
                {changeView ? (
                  <div className="change-bar">
                    <i style={{ width: `${Math.max(2, Math.min(100, c.stats.insertions / 10))}%` }} />
                    <b style={{ width: `${Math.max(2, Math.min(100, c.stats.deletions / 10))}%` }} />
                    <small>
                      +{c.stats.insertions} −{c.stats.deletions}
                    </small>
                  </div>
                ) : (
                  <code>{c.shortHash}</code>
                )}
              </button>
            ))}
            {!visible.length && (
              <div className="small-empty">没有匹配的提交。尝试 message:、author: 或 file:。</div>
            )}
          </div>
          {filtered.length > 100 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <span>
                {page + 1}/{Math.ceil(filtered.length / 100)}
              </span>
              <button disabled={(page + 1) * 100 >= filtered.length} onClick={() => setPage(page + 1)}>
                下一页
              </button>
            </div>
          )}
        </Panel>
        <div className="snapshot-column">
          <Panel className="snapshot-header">
            <div>
              <span className="eyebrow">
                COMMIT {String(index + 1).padStart(3, '0')} / {data.commits.length}
              </span>
              <h2>{commit.message}</h2>
              <div className="commit-meta">
                <span className="avatar tiny">{commit.author[0]}</span>
                {commit.author}
                <span>·</span>
                {day(commit.date)}
                <code>{commit.shortHash}</code>
                {commit.parents.length > 1 && <span className="badge merge">MERGE</span>}
              </div>
            </div>
            <div className="commit-stats">
              <strong>
                {snapshot.totalFiles}
                <small>文件快照</small>
              </strong>
              <span className="positive">+{fmt(commit.stats.insertions)}</span>
              <span className="negative">−{fmt(commit.stats.deletions)}</span>
            </div>
          </Panel>
          <div className="snapshot-grid">
            <Panel className="tree-panel">
              <div className="panel-heading">
                <h3>
                  <FolderGlyph /> 项目文件
                </h3>
                <label className="toggle-label">
                  <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> 文件年龄
                </label>
              </div>
              <FileTree data={data} commit={commit} onFile={setPath} age={age} />
            </Panel>
            <Panel className="changes-panel">
              <div className="panel-heading">
                <h3>此次变化</h3>
                <span className="count">{commit.stats.filesChanged}</span>
              </div>
              <div className="changes-list">
                {commit.changes.map((f) => (
                  <button
                    className={path === f.path ? 'selected' : ''}
                    key={f.path}
                    onClick={() => setPath(f.path)}
                  >
                    <span className={`change-letter ${f.type}`}>{f.type[0].toUpperCase()}</span>
                    <span title={f.path}>
                      {f.path}
                      <small>
                        {f.binary ? (
                          '二进制文件'
                        ) : (
                          <>
                            <em className="positive">+{f.insertions}</em>{' '}
                            <em className="negative">−{f.deletions}</em>
                          </>
                        )}
                        {f.oldPath && <small>← {f.oldPath}</small>}
                      </small>
                    </span>
                  </button>
                ))}
                {!commit.changes.length && <p className="muted">无文件变化</p>}
              </div>
              <div className="parents">
                <GitBranch size={14} />
                <span>父提交</span>
                {commit.parents.length ? (
                  commit.parents.map((p) => (
                    <button
                      key={p}
                      disabled={!data.commits.some((c) => c.hash === p)}
                      title={p}
                      onClick={() => seek(data.commits.findIndex((c) => c.hash === p))}
                    >
                      {p.slice(0, 7)}
                    </button>
                  ))
                ) : (
                  <span>根提交</span>
                )}
              </div>
            </Panel>
          </div>
          {path && <DiffDetail commit={commit} path={path} onClose={() => setPath('')} />}
        </div>
      </div>
    </div>
  );
}
function FolderGlyph() {
  return <GitCommitHorizontal size={17} />;
}
export function Files() {
  const { data, index, seek, set } = useAtlas();
  const [path, setPath] = useState('');
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(100);
  if (!data?.commits.length) return null;
  const commit = data.commits[index];
  const files = data.snapshots[commit.hash].files.filter((f) =>
    f.path.toLowerCase().includes(filter.toLowerCase()),
  );
  const history = path ? fileHistory(data, path, index) : null;
  return (
    <div className="page">
      <SectionTitle
        eyebrow="FILE LIFECYCLES"
        title="每个文件，都有自己的故事。"
        description={`当前快照 ${commit.shortHash} · 文件历史沿第一父提交追溯，支持重命名。`}
      />
      <div className="files-layout">
        <Panel>
          <div className="panel-heading">
            <h3>{files.length} 个文件</h3>
            <input
              aria-label="查找文件"
              placeholder="查找文件…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setLimit(100);
              }}
            />
          </div>
          <div className="file-table">
            {files.slice(0, limit).map((f) => (
              <button
                key={f.path}
                className={path === f.path ? 'active' : ''}
                onClick={() => setPath(f.path)}
              >
                <FileCode2 size={16} />
                <span>{f.path}</span>
                <ChevronArrow />
              </button>
            ))}
          </div>
          {files.length > limit && (
            <button className="text-button" onClick={() => setLimit(limit + 100)}>
              加载更多文件
            </button>
          )}
        </Panel>
        <Panel>
          <div className="panel-heading">
            <h3>
              <Clock3 size={16} /> 文件生命周期
            </h3>
          </div>
          {history ? (
            <>
              <div className="lifecycle-summary">
                <strong>{path}</strong>
                <span>创建于 {day(history.created)}</span>
                <span>最后修改 {day(history.lastModified)}</span>
                <span>
                  {history.events.length} 次变更 · +{history.insertions} / −{history.deletions}
                </span>
                {history.partial && <small>创建事件不在已加载的第一父历史中。</small>}
              </div>
              <div className="lifecycle">
                {history.events.map((c) => (
                  <button
                    key={c.hash}
                    onClick={() => {
                      seek(data.commits.findIndex((x) => x.hash === c.hash));
                      set({ view: 'timeline' });
                    }}
                  >
                    <i />
                    <small>{day(c.date)}</small>
                    <strong>{c.message}</strong>
                    <code>{c.shortHash}</code>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Empty title="选择一个文件" detail="查看它何时诞生，又如何一步步变化。" />
          )}
        </Panel>
      </div>
    </div>
  );
}
function ChevronArrow() {
  return <span className="muted">↗</span>;
}
