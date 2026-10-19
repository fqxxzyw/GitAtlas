import { useMemo, useState } from 'react';
import { ChevronRight, FileCode2, Folder, FolderOpen } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { GitCommit, HistoryData } from '../core/model';
import { fileHistory } from '../core/history';
import { day } from '../core/store';
interface Node {
  name: string;
  path: string;
  children: Map<string, Node>;
  file?: string;
}
export function FileTree({
  data,
  commit,
  onFile,
  age = false,
}: {
  data: HistoryData;
  commit: GitCommit;
  onFile: (path: string) => void;
  age?: boolean;
}) {
  const [limit, setLimit] = useState(400);
  const reduced = useReducedMotion();
  const root = useMemo(() => {
    const root: Node = { name: 'root', path: '', children: new Map() };
    for (const f of data.snapshots[commit.hash].files.slice(0, limit)) {
      let node = root;
      const parts = f.path.split('/');
      parts.forEach((name, i) => {
        const path = parts.slice(0, i + 1).join('/');
        if (!node.children.has(name)) node.children.set(name, { name, path, children: new Map() });
        node = node.children.get(name)!;
        if (i === parts.length - 1) node.file = f.path;
      });
    }
    return root;
  }, [data, commit.hash, limit]);
  const changes = new Map(commit.changes.map((c) => [c.path, c]));
  const index = data.commits.findIndex((c) => c.hash === commit.hash);
  function render(node: Node, depth: number): React.ReactNode {
    const children = [...node.children.values()].sort(
      (a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name),
    );
    return children.map((n) => {
      if (!n.file)
        return (
          <details key={n.path} open className="tree-folder">
            <summary style={{ paddingLeft: depth * 18 + 12 }}>
              <ChevronRight size={13} className="chevron" />
              <Folder size={15} />
              <span>{n.name}</span>
              <small>{n.children.size}</small>
            </summary>
            <div>{render(n, depth + 1)}</div>
          </details>
        );
      const change = changes.get(n.path);
      const history = age ? fileHistory(data, n.path, index) : null;
      const days = history?.created
        ? Math.max(0, Math.floor((Date.parse(commit.date) - Date.parse(history.created)) / 86400000))
        : null;
      return (
        <motion.button
          layout={!reduced}
          initial={reduced ? false : { opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          key={n.path}
          className={`tree-file ${change?.type ?? ''}`}
          style={{ paddingLeft: depth * 18 + 28 }}
          title={
            age
              ? `${n.path}\n创建：${day(history?.created)}\n最后修改：${day(history?.lastModified)}`
              : n.path
          }
          onClick={() => onFile(n.path)}
        >
          <FileCode2 size={14} />
          <span>{n.name}</span>
          {age ? (
            <small>{days === null ? '创建日期未知' : `${days} 天`}</small>
          ) : (
            change && (
              <small className={`badge ${change.type}`}>
                {{ added: 'NEW', modified: 'MODIFIED', deleted: 'DELETED', renamed: 'RENAMED' }[change.type]}
              </small>
            )
          )}
        </motion.button>
      );
    });
  }
  return (
    <div className="file-tree">
      <div className="tree-root">
        <FolderOpen size={16} />
        {data.repository}
        <small>{data.snapshots[commit.hash].totalFiles} files</small>
      </div>
      <AnimatePresence initial={false}>{render(root, 0)}</AnimatePresence>
      {commit.changes
        .filter((f) => f.type === 'deleted')
        .map((f) => (
          <button key={`deleted-${f.path}`} className="tree-file deleted" onClick={() => onFile(f.path)}>
            <FileCode2 size={14} />
            <span>{f.path}</span>
            <small className="badge deleted">DELETED</small>
          </button>
        ))}
      {data.snapshots[commit.hash].totalFiles > limit && (
        <button className="text-button" onClick={() => setLimit(limit + 400)}>
          再显示 400 个文件
        </button>
      )}
    </div>
  );
}
