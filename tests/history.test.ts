import { describe, it, expect } from 'vitest';
import {
  applyChanges,
  compareSnapshots,
  fileHistory,
  milestones,
  parseQuery,
  searchCommits,
  contributors,
  dailyActivity,
} from '../src/core/history';
import { exportHistory, validateHistory } from '../src/core/transfer';
import { makeDemo } from '../src/core/demo';
import { mapError, GitAtlasFailure } from '../electron/errors';
import { parseLog, parseNameStatus, applyNumstat, parseTree } from '../electron/parsers';
const h = (n: number) => String(n).padStart(40, '0');
describe('Git wire format', () => {
  it('preserves Unicode, spaces, tabs and rename destinations', () => {
    const changes = parseNameStatus('A\0新 文件.ts\0R100\0old\tname.ts\0new name.ts\0D\0delete.py\0');
    const result = applyNumstat(
      changes,
      '4\t0\t新 文件.ts\0-\t-\t\0old\tname.ts\0new name.ts\u00000\t7\tdelete.py\0',
    );
    expect(result[0]).toMatchObject({ type: 'added', insertions: 4, path: '新 文件.ts' });
    expect(result[1]).toMatchObject({
      type: 'renamed',
      oldPath: 'old\tname.ts',
      path: 'new name.ts',
      binary: true,
    });
    expect(result[2]).toMatchObject({ type: 'deleted', deletions: 7 });
  });
  it('handles merge parents, refs and messages with tabs', () => {
    const raw = [
      h(2),
      '1234567',
      '郑',
      'a@example.test',
      '2026-01-02T03:04:05Z',
      `${h(1)} ${h(0)}`,
      'HEAD -> main',
      'message\twith\ttabs',
      '',
    ].join('\0');
    expect(parseLog(raw)[0]).toMatchObject({
      hash: h(2),
      author: '郑',
      parents: [h(1), h(0)],
      message: 'message\twith\ttabs',
    });
  });
  it('parses tree records without decoding quoted paths', () => {
    expect(parseTree(`100644 blob ${h(1)}\t中文\tfile\n.ts\0`)[0].path).toBe('中文\tfile\n.ts');
  });
});
describe('history domain', () => {
  it('applies additions, deletions and renames without mutating the previous snapshot', () => {
    const before = {
      commitHash: h(1),
      totalFiles: 2,
      files: [
        { path: 'a', oid: h(1), mode: '100644' },
        { path: 'b', oid: h(1), mode: '100644' },
      ],
    };
    const after = applyChanges(
      before,
      [
        { path: 'c', oldPath: 'a', type: 'renamed', insertions: 0, deletions: 0 },
        { path: 'b', type: 'deleted', insertions: 0, deletions: 3 },
      ],
      h(2),
    );
    expect(after.files.map((f) => f.path)).toEqual(['c']);
    expect(before.totalFiles).toBe(2);
  });
  it('compares object IDs and file modes, not line count estimates', () => {
    const data = makeDemo();
    const a = data.snapshots[data.commits[0].hash],
      b = data.snapshots[data.commits.at(-1)!.hash];
    const result = compareSnapshots(a, b);
    expect(result.added.length).toBe(b.totalFiles - 1);
    expect(result.modified.length).toBe(1);
  });
  it('supports AND queries, quoted phrases, dates and renamed paths', () => {
    const d = makeDemo();
    expect(parseQuery('author:"Zheng" message:"Add commit"').length).toBe(2);
    expect(searchCommits(d.commits, 'author:zheng').every((c) => c.author === 'Zheng')).toBe(true);
    expect(searchCommits(d.commits, 'author:zheng login')).toHaveLength(0);
    expect(searchCommits(d.commits, 'file:README.md').length).toBeGreaterThan(0);
    expect(
      searchCommits(d.commits, 'after:2026-04-01 before:2026-05-01').every(
        (c) => c.date.slice(0, 10) >= '2026-04-01' && c.date.slice(0, 10) <= '2026-05-01',
      ),
    ).toBe(true);
    expect(searchCommits(d.commits, 'after:banana')).toHaveLength(0);
  });
  it('does not call partial history the first commit or first file threshold', () => {
    const d = makeDemo();
    expect(milestones(d).map((m) => m.title)).toContain('第一次提交');
    d.totalCommits = 1000;
    expect(milestones(d).some((m) => m.title === '第一次提交' || m.title.includes('首次达到'))).toBe(false);
  });
  it('identifies the 100th commit, first merge and 50-file threshold by rules', () => {
    const d = makeDemo();
    for (let i = 64; i < 100; i++) {
      const c = { ...d.commits[63], hash: h(200 + i), parents: [d.commits.at(-1)!.hash] };
      d.commits.push(c);
      d.snapshots[c.hash] = { ...d.snapshots[d.commits[63].hash], commitHash: c.hash };
    }
    d.totalCommits = 100;
    d.commits[40].parents.push(d.commits[30].hash);
    expect(milestones(d).map((m) => m.title)).toEqual(
      expect.arrayContaining(['第 100 次提交', '第一次合并', '首次达到 50 个文件']),
    );
  });
  it('follows a file rename through its first-parent ancestry', () => {
    const d = makeDemo();
    d.commits = d.commits.slice(0, 2);
    d.commits[1].changes = [
      { path: 'new.md', oldPath: 'README.md', type: 'renamed', insertions: 0, deletions: 0 },
    ];
    expect(fileHistory(d, 'new.md', 1).created).toBe(d.commits[0].date);
    expect(fileHistory(d, 'new.md', 1).insertions).toBe(d.commits[0].changes[0].insertions);
  });
  it('groups contributions and dates without treating them as hours worked', () => {
    const d = makeDemo();
    expect(contributors(d.commits).reduce((n, p) => n + p.commits.length, 0)).toBe(64);
    expect(Object.values(dailyActivity(d.commits)).reduce((a, b) => a + b, 0)).toBe(64);
  });
});
describe('metadata transfer and error boundaries', () => {
  it('strips source code, diff, paths to the repository and emails recursively', () => {
    const d = makeDemo();
    Object.assign(d, { path: 'C:/secret', sourceCode: 'secret body' });
    Object.assign(d.commits[0], { diff: 'secret patch', email: 'private@example.test' });
    Object.assign(d.commits[0].changes[0], { content: 'secret source' });
    const json = exportHistory(d);
    expect(json).not.toContain('secret');
    expect(json).not.toContain('private@example.test');
    expect(validateHistory(JSON.parse(json)).commits).toHaveLength(64);
  });
  it('rejects missing snapshots, inconsistent counts and cycles', () => {
    const d = makeDemo();
    d.snapshots[d.commits[0].hash].totalFiles = 999;
    expect(() => validateHistory(d)).toThrow();
    const cycle = makeDemo();
    cycle.commits[0].parents = [cycle.commits[2].hash];
    expect(() => validateHistory(cycle)).toThrow();
  });
  it('maps safe recoverable errors without exposing command text', () => {
    expect(mapError(new Error('spawn git ENOENT')).code).toBe('GIT_NOT_FOUND');
    expect(mapError(new GitAtlasFailure('INVALID_REPOSITORY', '/private/path')).message).not.toContain(
      'private',
    );
    expect(mapError(new GitAtlasFailure('UNKNOWN_COMMIT', 'hash')).code).toBe('UNKNOWN_COMMIT');
  });
});
