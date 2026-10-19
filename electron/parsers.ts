import type { FileChange, GitCommit, RepositoryFile } from '../src/core/model';
export function parseLog(raw: string): GitCommit[] {
  const values = raw.split('\0');
  const result: GitCommit[] = [];
  for (let i = 0; i + 7 < values.length; i += 8) {
    const [h, shortHash, author, email, date, parents, refs, message] = values.slice(i, i + 8);
    const hash = h.trim();
    if (!hash) continue;
    result.push({
      hash,
      shortHash,
      author,
      email,
      date,
      parents: parents ? parents.split(' ') : [],
      branchRefs: refs ? refs.split(', ') : [],
      message,
      stats: { filesChanged: 0, insertions: 0, deletions: 0 },
      changes: [],
    });
  }
  return result;
}
export function parseNameStatus(raw: string): FileChange[] {
  const fields = raw.split('\0');
  const result: FileChange[] = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const status = fields[i++];
    const first = fields[i++];
    if (first === undefined) break;
    if (status.startsWith('R'))
      result.push({ path: fields[i++], oldPath: first, type: 'renamed', insertions: 0, deletions: 0 });
    else
      result.push({
        path: first,
        type: status === 'A' ? 'added' : status === 'D' ? 'deleted' : 'modified',
        insertions: 0,
        deletions: 0,
      });
  }
  return result;
}
export function applyNumstat(changes: FileChange[], raw: string): FileChange[] {
  const fields = raw.split('\0');
  const stats = new Map<string, { insertions: number; deletions: number; binary: boolean }>();
  for (let i = 0; i < fields.length && fields[i];) {
    const row = fields[i++];
    const a = row.indexOf('\t'),
      b = row.indexOf('\t', a + 1);
    if (a < 0 || b < 0) continue;
    const add = row.slice(0, a),
      del = row.slice(a + 1, b);
    let path = row.slice(b + 1);
    if (!path) {
      i++;
      path = fields[i++];
    }
    stats.set(path, {
      insertions: add === '-' ? 0 : Number(add),
      deletions: del === '-' ? 0 : Number(del),
      binary: add === '-' || del === '-',
    });
  }
  return changes.map((c) => ({ ...c, ...stats.get(c.path) }));
}
export function parseTree(raw: string): RepositoryFile[] {
  return raw
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf('\t');
      const [mode, _type, oid] = row.slice(0, tab).split(' ');
      return { mode, oid, path: row.slice(tab + 1) };
    });
}
