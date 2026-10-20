import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseGitHubURL, RemoteService, runGit, type GitRunner } from '../electron/remote-service';
import type { RemoteProgress } from '../src/core/model';
import { GitAtlasFailure } from '../electron/errors';
const roots: string[] = [];
async function root() {
  const p = await mkdtemp(join(tmpdir(), 'atlas-remote-'));
  roots.push(p);
  return p;
}
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});

describe('remote URL boundaries', () => {
  it('normalizes GitHub URLs and stable case-insensitive cache identity', () => {
    const a = parseGitHubURL(' https://github.com/Foo/bar.git ');
    expect(a.fullName).toBe('Foo/bar');
    expect(a.url).toBe('https://github.com/Foo/bar.git');
    expect(a.id).toBe(parseGitHubURL('https://github.com/foo/BAR/').id);
  });
  it.each([
    'http://github.com/a/b',
    'file:///tmp/a',
    'git@github.com:a/b.git',
    'https://evil.test/a/b',
    'https://github.com.evil.test/a/b',
    'https://token@github.com/a/b',
    'https://github.com:8443/a/b',
    'https://github.com/a/b/tree/main',
    'https://github.com/a/b?x=1',
    'https://github.com/a/b#readme',
    'https://github.com/a/%2e%2e/b',
    'https://github.com/a/b/../c',
    'https://github.com/a/b\\c',
  ])('rejects unsupported or ambiguous URL %s', (value) => {
    expect(() => parseGitHubURL(value)).toThrow();
  });
});

describe('GitHub credentials and account data', () => {
  it('isolates credentials, limits API host, strips token from public results and removes it on logout', async () => {
    const folder = await root();
    let signedIn = false;
    const calls: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
    const progress: RemoteProgress[] = [];
    const runner: GitRunner = async (args, options) => {
      calls.push({ args, env: options.env });
      if (args.includes('--version')) return 'Git Credential Manager 3.0.1';
      if (args.includes('login')) {
        options.onText?.('Visit https://github.com/login/device\nABCD-');
        options.onText?.('EFGH');
        signedIn = true;
        return '';
      }
      if (args.includes('list')) return signedIn ? 'atlas-test\n' : '';
      if (args.includes('logout')) {
        signedIn = false;
        return '';
      }
      if (args.includes('get')) {
        expect(options.input).toBe('protocol=https\nhost=github.com\nusername=atlas-test\n\n');
        return 'username=atlas-test\npassword=private-test-token\n';
      }
      throw Error('Unexpected command');
    };
    const request = vi.fn<typeof fetch>(async (url, options) => {
      expect(String(url).startsWith('https://api.github.com/')).toBe(true);
      expect(options?.redirect).toBe('error');
      expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer private-test-token');
      return new Response(
        JSON.stringify(
          String(url).endsWith('/user')
            ? { login: 'atlas-test', name: 'Atlas' }
            : [
                {
                  full_name: 'atlas-test/private',
                  private: true,
                  description: null,
                  updated_at: '2026-10-20T00:00:00Z',
                  token: 'must-not-leak',
                },
              ],
        ),
      );
    });
    const service = new RemoteService(folder, (p) => progress.push(p), runner, request);
    await service.initialize();
    expect(await service.login()).toEqual({ login: 'atlas-test', name: 'Atlas' });
    expect(progress.some((p) => p.deviceCode === 'ABCD-EFGH')).toBe(true);
    const results = await service.repositories(1);
    expect(results.repositories[0]).toEqual({
      fullName: 'atlas-test/private',
      description: '',
      private: true,
      updatedAt: '2026-10-20T00:00:00Z',
    });
    expect(JSON.stringify(results)).not.toContain('token');
    expect(await readFile(join(folder, 'account.json'), 'utf8')).not.toContain('private-test-token');
    for (const call of calls) {
      expect(call.env.GCM_NAMESPACE).toBe('GitAtlas');
      expect(call.env.GIT_CONFIG_GLOBAL).toBe(join(folder, 'gitconfig'));
      expect(call.env.GIT_CONFIG_NOSYSTEM).toBe('1');
      expect(call.env.GCM_TRACE_SECRETS).toBe('0');
      expect(call.args.join(' ')).not.toContain('private-test-token');
    }
    await service.logout();
    expect(signedIn).toBe(false);
    expect((await service.status()).account).toBeNull();
    await expect(service.repositories(1)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
  it('cancels a pending login and clears only its own credential namespace', async () => {
    const folder = await root();
    const runner: GitRunner = async (args, options) => {
      if (args.includes('login'))
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new GitAtlasFailure('CANCELLED', 'cancelled')),
            { once: true },
          );
        });
      return '';
    };
    const service = new RemoteService(folder, () => {}, runner);
    await service.initialize();
    const pending = service.login();
    const expectation = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    await new Promise((r) => setTimeout(r, 10));
    service.cancel();
    await expectation;
    expect((await service.status()).account).toBeNull();
  });
  it('reports unavailable GCM without making a network request', async () => {
    const service = new RemoteService(
      await root(),
      () => {},
      async () => {
        throw Error('missing');
      },
    );
    await service.initialize();
    expect((await service.status()).available).toBe(false);
    await expect(service.login()).rejects.toMatchObject({ code: 'GCM_MISSING' });
  });
  it('fails expired API credentials without returning raw server messages', async () => {
    const folder = await root();
    await writeFile(join(folder, 'account.json'), JSON.stringify({ login: 'atlas', name: 'Atlas' }));
    const service = new RemoteService(
      folder,
      () => {},
      async () => 'password=secret\n',
      async () => new Response('secret raw error', { status: 401 }),
    );
    await service.initialize();
    await expect(service.repositories(1)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});

describe('managed remote cache', () => {
  it('returns the same canonical path when the application root has an alias', async () => {
    const folder = await root();
    const alias = join(await root(), 'alias');
    await symlink(folder, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const service = new RemoteService(
      alias,
      () => {},
      async (args) => {
        if (args.includes('clone')) await mkdir(args.at(-1)!, { recursive: true });
        return '';
      },
    );
    await service.initialize();
    const id = parseGitHubURL('https://github.com/example/project').id;
    const downloaded = await service.download('https://github.com/example/project');
    expect(downloaded).toBe(await realpath(join(folder, 'repositories', id)));
    expect(await service.cachePath(id)).toBe(downloaded);
    await service.removeCache(id);
    expect(await readdir(join(folder, 'repositories'))).toEqual([]);
  });
  it('cleans failed clone files without registering a cache', async () => {
    const folder = await root();
    const service = new RemoteService(
      folder,
      () => {},
      async (args) => {
        await mkdir(args.at(-1)!, { recursive: true });
        await writeFile(join(args.at(-1)!, 'partial'), 'partial download');
        throw new GitAtlasFailure('REMOTE_FAILED', 'failed');
      },
    );
    await service.initialize();
    await expect(service.download('https://github.com/example/project')).rejects.toMatchObject({
      code: 'REMOTE_FAILED',
    });
    expect(service.listCaches()).toEqual([]);
    expect(await readdir(join(folder, 'repositories'))).toEqual([]);
  });
  it('cancels an active download and prevents overlapping operations', async () => {
    const folder = await root();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const service = new RemoteService(
      folder,
      () => {},
      async (args, options) => {
        await mkdir(args.at(-1)!, { recursive: true });
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => reject(new GitAtlasFailure('CANCELLED', 'cancelled')),
            { once: true },
          );
          started();
        });
      },
    );
    await service.initialize();
    const pending = service.download('https://github.com/example/project');
    const result = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    await ready;
    await expect(service.download('https://github.com/example/other')).rejects.toMatchObject({
      code: 'BUSY',
    });
    service.cancel();
    await result;
    expect(service.listCaches()).toEqual([]);
    expect(await readdir(join(folder, 'repositories'))).toEqual([]);
  });
  it('reports a missing Git executable explicitly', async () => {
    await expect(runGit(['--version'], { cwd: await root(), env: { PATH: '' } })).rejects.toMatchObject({
      code: 'GIT_NOT_FOUND',
    });
  });
  it('downloads atomically without checkout, updates the existing cache and deletes only a registered cache', async () => {
    const folder = await root();
    const calls: string[][] = [];
    const runner: GitRunner = async (args, options) => {
      calls.push(args);
      expect(options.env.GIT_TERMINAL_PROMPT).toBe('0');
      if (args.includes('clone')) {
        await mkdir(args.at(-1)!, { recursive: true });
        options.onText?.('Receiving objects: 100% (4/4)');
      }
      if (args.includes('symbolic-ref')) return 'main\n';
      if (args.includes('rev-parse')) return 'a'.repeat(40);
      return '';
    };
    const service = new RemoteService(folder, () => {}, runner);
    await service.initialize();
    const path = await service.download('https://github.com/example/project');
    const id = parseGitHubURL('https://github.com/example/project').id;
    expect(path).toBe(await realpath(join(folder, 'repositories', id)));
    const clone = calls.find((c) => c.includes('clone'))!;
    expect(clone).toContain('--no-checkout');
    expect(clone).toContain('--no-recurse-submodules');
    expect(clone).toContain('credential.helper=');
    expect(clone).not.toContain('credential.helper=manager');
    expect(await service.cachePath(id)).toBe(path);
    expect(await service.download('https://github.com/example/project.git')).toBe(path);
    expect(calls.some((c) => c.includes('fetch'))).toBe(true);
    expect(calls.some((c) => c.includes('update-ref'))).toBe(true);
    expect(calls.flat()).not.toContain('push');
    expect(service.listCaches()).toHaveLength(1);
    await expect(service.removeCache('../outside')).rejects.toMatchObject({ code: 'CACHE_MISSING' });
    await service.removeCache(id);
    expect(service.listCaches()).toHaveLength(0);
    expect(await readdir(join(folder, 'repositories'))).toEqual([]);
  });
  it('cleans interrupted downloads and keeps them out of the index', async () => {
    const folder = await root();
    const service = new RemoteService(
      folder,
      () => {},
      async (args) => {
        await mkdir(args.at(-1)!, { recursive: true });
        throw new GitAtlasFailure('CANCELLED', 'cancelled');
      },
    );
    await service.initialize();
    await expect(service.download('https://github.com/example/project')).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(service.listCaches()).toEqual([]);
    expect(await readdir(join(folder, 'repositories'))).toEqual([]);
  });
  it('rejects a cache directory replaced with a symlink or junction', async () => {
    const folder = await root();
    const outside = await root();
    const repo = parseGitHubURL('https://github.com/example/project');
    await mkdir(join(folder, 'repositories'));
    await writeFile(
      join(folder, 'caches.json'),
      JSON.stringify([{ id: repo.id, fullName: repo.fullName, updatedAt: '' }]),
    );
    await symlink(
      outside,
      join(folder, 'repositories', repo.id),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const service = new RemoteService(folder, () => {});
    await service.initialize();
    await expect(service.removeCache(repo.id)).rejects.toMatchObject({ code: 'CACHE_MISSING' });
    expect(await readdir(outside)).toEqual([]);
  });
});
