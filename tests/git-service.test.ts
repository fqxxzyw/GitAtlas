import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { GitService, READ_ONLY_COMMANDS } from '../electron/git-service';
import type { HistoryData } from '../src/core/model';
let root: string, repo: string, git: SimpleGit, service: GitService, data: HistoryData;
describe('real Git repository integration', () => {
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'gitatlas-test-'));
    repo = join(root, '中文 repository');
    await mkdir(repo);
    git = simpleGit(repo);
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.name', 'Atlas Test');
    await git.addConfig('user.email', 'atlas@example.test');
    await writeFile(join(repo, 'initial.txt'), 'one\ntwo\n');
    await git.add('.');
    await git.commit('Initial commit');
    await git.checkoutLocalBranch('feature');
    await writeFile(join(repo, 'feature.txt'), 'feature\n');
    await git.add('.');
    await git.commit('Feature branch file');
    await git.checkout('main');
    await writeFile(join(repo, '主 分支.txt'), 'main branch\n');
    await git.add('.');
    await git.commit('Main work');
    await git.merge(['--no-ff', 'feature', '-m', 'Merge feature']);
    await git.mv('initial.txt', 'renamed file.txt');
    await git.commit('Rename initial file');
    await writeFile(join(repo, 'binary.bin'), Buffer.from([0, 1, 2, 0, 5]));
    await git.add('.');
    await git.commit('Binary asset');
    await git.rm('feature.txt');
    await git.commit('Delete feature file');
    await writeFile(join(repo, 'dirty.txt'), 'Keep my unsaved work');
    service = new GitService(join(root, 'cache'));
    data = await service.open(repo);
  });
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });
  it('reads all commits and exact merge snapshots', async () => {
    expect(data.totalCommits).toBe(7);
    expect(data.commits).toHaveLength(7);
    const merge = data.commits.find((c) => c.parents.length === 2)!;
    expect(merge).toBeTruthy();
    expect(data.snapshots[merge.hash].files.map((f) => f.path).sort()).toEqual(
      ['feature.txt', 'initial.txt', '主 分支.txt'].sort(),
    );
    const childPositions = new Map(data.commits.map((c, i) => [c.hash, i]));
    for (const c of data.commits)
      for (const p of c.parents) expect(childPositions.get(p)!).toBeLessThan(childPositions.get(c.hash)!);
  });
  it('detects rename, binary, Unicode and deletion correctly', () => {
    expect(data.commits.find((c) => c.message === 'Rename initial file')!.changes[0]).toMatchObject({
      type: 'renamed',
      path: 'renamed file.txt',
      oldPath: 'initial.txt',
    });
    expect(data.commits.find((c) => c.message === 'Binary asset')!.changes[0].binary).toBe(true);
    expect(data.commits.at(-1)!.changes[0].type).toBe('deleted');
  });
  it('reads diff on demand and snapshot comparison totals', async () => {
    const first = data.commits[0];
    expect(await service.diff(first.hash, 'initial.txt')).toContain('+one');
    const result = await service.compare(first.hash, data.commits.at(-1)!.hash);
    expect(result.some((f) => f.path === 'binary.bin' && f.binary)).toBe(true);
  });
  it('branch selection does not checkout, touch index or dirty files', async () => {
    const before = await git.raw(['status', '--porcelain=v1']);
    const head = await git.raw(['rev-parse', 'HEAD']);
    const index = await readFile(join(repo, '.git', 'index'));
    const feature = await service.scan('feature', 500);
    expect(feature.commits).toHaveLength(2);
    expect(await git.raw(['rev-parse', 'HEAD'])).toBe(head);
    expect(await git.raw(['status', '--porcelain=v1'])).toBe(before);
    expect(await readFile(join(repo, '.git', 'index'))).toEqual(index);
    expect(await readFile(join(repo, 'dirty.txt'), 'utf8')).toBe('Keep my unsaved work');
    expect(
      [...READ_ONLY_COMMANDS].some((c) =>
        ['checkout', 'reset', 'clean', 'commit', 'push', 'pull'].includes(c),
      ),
    ).toBe(false);
  });
  it('loads a partial page with the complete earliest snapshot baseline', async () => {
    const partial = await service.scan('main', 2);
    expect(partial.commits).toHaveLength(2);
    expect(partial.totalCommits).toBe(7);
    expect(partial.snapshots[partial.commits[0].hash].totalFiles).toBe(4);
  });
  it('updates unchanged cache entries and recognizes new commits', async () => {
    await git.add('dirty.txt');
    await git.commit('Preserve test work');
    const refreshed = await service.scan('main', 500);
    expect(refreshed.totalCommits).toBe(8);
    expect(refreshed.snapshots[refreshed.commits.at(-1)!.hash].totalFiles).toBe(4);
  });
  it('rejects arbitrary hashes and branch options', async () => {
    await expect(service.diff('--help', 'a')).rejects.toMatchObject({ code: 'UNKNOWN_COMMIT' });
    await expect(service.scan('--all', 500)).rejects.toMatchObject({ code: 'UNKNOWN_BRANCH' });
    await expect(service.diff(data.commits[0].hash, '../../etc/passwd')).rejects.toMatchObject({
      code: 'UNKNOWN_COMMIT',
    });
  });
  it('handles missing, invalid and empty repositories', async () => {
    await expect(service.open(join(root, 'missing'))).rejects.toMatchObject({ code: 'REPOSITORY_NOT_FOUND' });
    await expect(service.open(root)).rejects.toMatchObject({ code: 'INVALID_REPOSITORY' });
    const empty = join(root, 'empty');
    await mkdir(empty);
    await simpleGit(empty).init();
    expect((await service.open(empty)).commits).toHaveLength(0);
  });
});
