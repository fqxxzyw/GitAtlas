import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { GitAtlasFailure } from './errors';
import type { RemoteProgress, RemoteCache, GitHubAccount, GitHubRepository } from '../src/core/model';

export function parseGitHubURL(value: string) {
  if (/[\\%]/.test(value) || value.split('/').some((part) => part === '.' || part === '..'))
    throw new GitAtlasFailure('INVALID_URL', 'Non-canonical URL');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new GitAtlasFailure('INVALID_URL', 'Invalid URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new GitAtlasFailure('INVALID_URL', 'Only canonical GitHub HTTPS URLs are accepted');
  const match = /^\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}))\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.pathname);
  if (!match || ['.', '..'].includes(match[2]) || match[2].length > 100)
    throw new GitAtlasFailure('INVALID_URL', 'Expected owner/repository');
  const fullName = `${match[1]}/${match[2]}`;
  return {
    fullName,
    url: `https://github.com/${fullName}.git`,
    id: createHash('sha256').update(fullName.toLowerCase()).digest('hex'),
  };
}

export interface RunOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  input?: string;
  signal?: AbortSignal;
  timeout?: number;
  onText?: (text: string) => void;
}
export type GitRunner = (args: string[], options: RunOptions) => Promise<string>;
// Only fixed commands and validated GitHub names reach this runner. No shell, no raw error forwarding.
export const runGit: GitRunner = (args, options) =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new GitAtlasFailure('CANCELLED', 'Cancelled'));
      return;
    }
    const child = spawn('git', args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stopped = false,
      finished = false;
    const stop = () => {
      if (finished || stopped) return;
      stopped = true;
      if (child.pid) {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
          killer.on('error', () => child.kill());
        } else {
          try {
            process.kill(-child.pid, 'SIGTERM');
          } catch {
            child.kill();
          }
        }
      }
    };
    const timer = setTimeout(stop, options.timeout ?? 120000);
    options.signal?.addEventListener('abort', stop, { once: true });
    const clean = () => {
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', stop);
    };
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
      if (stdout.length > 2 * 1024 * 1024) stop();
      options.onText?.(data.toString('utf8'));
    });
    child.stderr.on('data', (data: Buffer) => options.onText?.(data.toString('utf8')));
    child.stdin.on('error', () => {});
    child.stdin.end(options.input ?? '');
    child.on('error', (error) => {
      clean();
      reject(
        new GitAtlasFailure(
          (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'GIT_NOT_FOUND' : 'REMOTE_FAILED',
          'Git process unavailable',
        ),
      );
    });
    child.on('close', (code) => {
      clean();
      if (stopped)
        reject(
          new GitAtlasFailure(
            options.signal?.aborted ? 'CANCELLED' : 'REMOTE_TIMEOUT',
            'Remote operation stopped',
          ),
        );
      else if (code !== 0) reject(new GitAtlasFailure('REMOTE_FAILED', 'Remote command failed'));
      else resolve(stdout);
    });
  });

const cacheSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  fullName: z.string(),
  updatedAt: z.string(),
});
const accountSchema = z.object({ login: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), name: z.string() });
export class RemoteService {
  private controller?: AbortController;
  private token?: string;
  private account: GitHubAccount | null = null;
  private caches: RemoteCache[] = [];
  constructor(
    private root: string,
    private progress: (p: RemoteProgress) => void,
    private runner: GitRunner = runGit,
    private request: typeof fetch = fetch,
  ) {}
  async initialize() {
    await mkdir(this.root, { recursive: true });
    await mkdir(join(this.root, 'repositories'), { recursive: true });
    // Isolated Git config: no user helper chains, trace destinations, hooks or URL rewrites.
    await writeFile(join(this.root, 'gitconfig'), '', { flag: 'a', mode: 0o600 });
    try {
      this.account = accountSchema.parse(JSON.parse(await readFile(join(this.root, 'account.json'), 'utf8')));
    } catch {
      this.account = null;
    }
    try {
      this.caches = z
        .array(cacheSchema)
        .max(100)
        .parse(JSON.parse(await readFile(join(this.root, 'caches.json'), 'utf8')))
        .filter((c) => {
          try {
            return parseGitHubURL(`https://github.com/${c.fullName}`).id === c.id;
          } catch {
            return false;
          }
        });
    } catch {
      this.caches = [];
    }
  }
  private environment(interactive = false): NodeJS.ProcessEnv {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/^(GIT_|GCM_)/i.test(key) &&
          !['PAGER', 'EDITOR', 'VISUAL', 'SSH_ASKPASS'].includes(key.toUpperCase()),
      ),
    );
    return {
      ...env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(this.root, 'gitconfig'),
      GIT_TERMINAL_PROMPT: interactive ? '1' : '0',
      GIT_LFS_SKIP_SMUDGE: '1',
      GCM_NAMESPACE: 'GitAtlas',
      GCM_CREDENTIAL_STORE:
        process.platform === 'win32'
          ? 'wincredman'
          : process.platform === 'darwin'
            ? 'keychain'
            : 'secretservice',
      GCM_INTERACTIVE: interactive ? '1' : '0',
      GCM_GUI_PROMPT: '0',
      GCM_GITHUB_AUTHMODES: 'device',
      GCM_TRACE: '0',
      GCM_TRACE_SECRETS: '0',
      GCM_DEBUG: '0',
    };
  }
  private run(args: string[], options: Partial<RunOptions> = {}) {
    return this.runner(args, { cwd: this.root, env: this.environment(), ...options });
  }
  private async exclusive<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.controller) throw new GitAtlasFailure('BUSY', 'Remote operation in progress');
    const controller = new AbortController();
    this.controller = controller;
    try {
      return await fn(controller.signal);
    } finally {
      this.controller = undefined;
    }
  }
  cancel() {
    this.controller?.abort();
  }
  async status() {
    let available = false;
    try {
      await this.run(['credential-manager', '--version'], { timeout: 15000 });
      available = true;
    } catch {
      /* Link cloning still works without GCM. */
    }
    return { available, account: this.account };
  }
  private async api(path: string, token: string, signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(30000);
    let response: Response;
    try {
      response = await this.request(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'GitAtlas',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new GitAtlasFailure(signal?.aborted ? 'CANCELLED' : 'NETWORK', 'GitHub request failed');
    }
    if (response.status === 401) {
      this.token = undefined;
      throw new GitAtlasFailure('AUTH_REQUIRED', 'Authorization expired');
    }
    if (!response.ok)
      throw new GitAtlasFailure(
        response.status === 403 || response.status === 429 ? 'API_LIMIT' : 'NETWORK',
        'GitHub API unavailable',
      );
    return response.json();
  }
  private async credential(signal?: AbortSignal) {
    if (!this.account) throw new GitAtlasFailure('AUTH_REQUIRED', 'No signed-in account');
    if (!this.token) {
      const result = await this.run(['credential-manager', 'get'], {
        input: `protocol=https\nhost=github.com\nusername=${this.account.login}\n\n`,
        signal,
      });
      const password = /^password=(.+)$/m.exec(result)?.[1].trim();
      if (!password) throw new GitAtlasFailure('AUTH_REQUIRED', 'Credential unavailable');
      this.token = password;
    }
    return this.token;
  }
  private async clearCredentials() {
    // Only this application's namespace is visible to these commands.
    const accounts = (await this.run(['credential-manager', 'github', 'list']))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    for (const login of accounts) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(login))
        throw new GitAtlasFailure('AUTH_FAILED', 'Invalid account response');
      await this.run(['credential-manager', 'github', 'logout', login]);
    }
    this.token = undefined;
    this.account = null;
    await rm(join(this.root, 'account.json'), { force: true });
  }
  async login() {
    return this.exclusive(async (signal) => {
      if (!(await this.status()).available) throw new GitAtlasFailure('GCM_MISSING', 'GCM unavailable');
      await this.clearCredentials();
      let tail = '',
        shown = '';
      this.progress({ stage: '正在请求 GitHub 授权码', kind: 'login' });
      try {
        await this.run(['credential-manager', 'github', 'login', '--device', '--force'], {
          signal,
          env: this.environment(true),
          timeout: 16 * 60 * 1000,
          onText: (text) => {
            tail = (tail + text).slice(-4096);
            const code = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.exec(tail)?.[0];
            if (code && shown !== code) {
              shown = code;
              this.progress({ kind: 'login', stage: '在 GitHub 输入验证码完成授权', deviceCode: code });
            }
          },
        });
        const accounts = (await this.run(['credential-manager', 'github', 'list'], { signal }))
          .trim()
          .split(/\r?\n/)
          .filter(Boolean);
        if (accounts.length !== 1) throw new GitAtlasFailure('AUTH_FAILED', 'Expected one account');
        this.account = accountSchema.parse({ login: accounts[0], name: accounts[0] });
        const profile = z
          .object({ login: z.string(), name: z.string().nullable() })
          .parse(await this.api('/user', await this.credential(signal), signal));
        if (signal.aborted) throw new GitAtlasFailure('CANCELLED', 'Cancelled');
        this.account = accountSchema.parse({ login: profile.login, name: profile.name ?? profile.login });
        await writeFile(join(this.root, 'account.json'), JSON.stringify(this.account), { mode: 0o600 });
        return this.account;
      } catch (error) {
        await this.clearCredentials().catch(() => {});
        throw error instanceof GitAtlasFailure &&
          ['CANCELLED', 'NETWORK', 'API_LIMIT', 'REMOTE_TIMEOUT'].includes(error.code)
          ? error
          : new GitAtlasFailure('AUTH_FAILED', 'GitHub authorization failed');
      }
    });
  }
  async logout() {
    return this.exclusive(async () => {
      await this.clearCredentials();
    });
  }
  async repositories(page: number) {
    return this.exclusive(async (signal) => {
      const token = await this.credential(signal);
      const raw = z
        .array(
          z.object({
            full_name: z.string(),
            description: z.string().nullable(),
            private: z.boolean(),
            updated_at: z.string().nullable(),
          }),
        )
        .max(100)
        .parse(
          await this.api(
            `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
            token,
            signal,
          ),
        );
      const repositories: GitHubRepository[] = raw.flatMap((repo) => {
        try {
          const parsed = parseGitHubURL(`https://github.com/${repo.full_name}`);
          return [
            {
              fullName: parsed.fullName,
              description: (repo.description ?? '').slice(0, 300),
              private: repo.private,
              updatedAt: repo.updated_at ?? '',
            },
          ];
        } catch {
          return [];
        }
      });
      return { repositories, hasMore: raw.length === 100 && page < 20 };
    });
  }
  listCaches() {
    return this.caches.map((c) => ({ ...c }));
  }
  private async saveCaches() {
    const temporary = join(this.root, 'caches.tmp');
    await writeFile(temporary, JSON.stringify(this.caches), { mode: 0o600 });
    await rename(temporary, join(this.root, 'caches.json'));
  }
  async cachePath(id: string) {
    if (!this.caches.some((c) => c.id === id)) throw new GitAtlasFailure('CACHE_MISSING', 'Unknown cache');
    const path = join(this.root, 'repositories', id);
    const canonical = await realpath(path);
    if (canonical !== join(await realpath(join(this.root, 'repositories')), id))
      throw new GitAtlasFailure('CACHE_MISSING', 'Cache path changed');
    return canonical;
  }
  async removeCache(id: string) {
    return this.exclusive(async () => {
      const path = await this.cachePath(id);
      await rm(path, { recursive: true, force: true });
      this.caches = this.caches.filter((c) => c.id !== id);
      await this.saveCaches();
    });
  }
  async download(value: string) {
    const repo = parseGitHubURL(value);
    return this.exclusive(async (signal) => {
      const existing = this.caches.find((c) => c.id === repo.id);
      if (!existing && this.caches.length >= 100)
        throw new GitAtlasFailure('CACHE_LIMIT', 'Too many cached repositories');
      const destination = join(this.root, 'repositories', repo.id);
      const temporary = join(this.root, 'repositories', `pending-${randomUUID()}`);
      const authentication = this.account
        ? ['-c', 'credential.helper=manager', '-c', `credential.username=${this.account.login}`]
        : [];
      const prefix = [
        '-c',
        'credential.helper=',
        ...authentication,
        '-c',
        'http.followRedirects=false',
        '-c',
        'protocol.allow=never',
        '-c',
        'protocol.https.allow=always',
      ];
      let tail = '';
      const onText = (text: string) => {
        tail = (tail + text).slice(-2048);
        const matches = [
          ...tail.matchAll(
            /(Receiving objects|Resolving deltas|Counting objects|Compressing objects):\s*(\d+)%/g,
          ),
        ];
        const last = matches.at(-1);
        if (last)
          this.progress({
            kind: 'download',
            stage: (
              {
                'Receiving objects': '下载 Git 历史',
                'Resolving deltas': '整理历史对象',
                'Counting objects': '统计历史对象',
                'Compressing objects': '压缩历史对象',
              } as Record<string, string>
            )[last[1]],
            percent: Number(last[2]),
          });
      };
      this.progress({ kind: 'download', stage: existing ? '检查远程更新' : '连接 GitHub 仓库' });
      try {
        if (existing) {
          const path = await this.cachePath(repo.id);
          await this.run(
            [
              ...prefix,
              'fetch',
              '--prune',
              '--progress',
              '--no-recurse-submodules',
              '--',
              repo.url,
              '+refs/heads/*:refs/remotes/origin/*',
            ],
            { cwd: path, signal, timeout: 20 * 60 * 1000, onText },
          );
          const branch = (await this.run(['symbolic-ref', '--short', 'HEAD'], { cwd: path, signal })).trim();
          const hash = (
            await this.run(['rev-parse', '--verify', `refs/remotes/origin/${branch}`], {
              cwd: path,
              signal,
            }).catch(() => '')
          ).trim();
          if (/^[a-f0-9]{40,64}$/.test(hash) && !branch.includes('\n'))
            await this.run(['update-ref', `refs/heads/${branch}`, hash], { cwd: path, signal });
        } else {
          await this.run(
            [
              ...prefix,
              'clone',
              '--no-checkout',
              '--progress',
              '--no-recurse-submodules',
              '--',
              repo.url,
              temporary,
            ],
            { signal, timeout: 20 * 60 * 1000, onText },
          );
          if (signal.aborted) throw new GitAtlasFailure('CANCELLED', 'Cancelled');
          await rename(temporary, destination);
        }
        this.caches = [
          { id: repo.id, fullName: repo.fullName, updatedAt: new Date().toISOString() },
          ...this.caches.filter((c) => c.id !== repo.id),
        ];
        await this.saveCaches();
        // Match offline opens and deletion guards, including Windows 8.3 aliases.
        // Reuse the boundary check rather than returning an unchecked path.
        return await this.cachePath(repo.id);
      } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        throw error;
      }
    });
  }
}
