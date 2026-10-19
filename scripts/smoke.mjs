// Native Electron end-to-end test. Run after build, or against the packaged exe
// using GITATLAS_EXECUTABLE. Dialog selection is mocked; IPC and Git are real.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';
const temp = await mkdtemp(join(tmpdir(), 'atlas-ui-'));
const repo = join(temp, 'Atlas 示例项目');
await mkdir(repo);
const git = simpleGit(repo);
await git.init(['--initial-branch=main']);
await git.addConfig('user.name', 'Atlas Developer');
await git.addConfig('user.email', 'test@example.invalid');
await git.addConfig('core.autocrlf', 'false');
await writeFile(join(repo, 'README.md'), '# Atlas example\n');
await git.add('.');
await git.commit('Initial project');
await mkdir(join(repo, 'src'));
await writeFile(join(repo, 'src', 'app.ts'), 'export const title = "source-code-sentinel";\n');
await git.add('.');
await git.commit('Add application');
await git.checkoutLocalBranch('feature');
await writeFile(join(repo, 'src', 'feature.ts'), 'export const feature = true;\n');
await git.add('.');
await git.commit('Add feature');
await git.checkout('main');
await git.merge(['--no-ff', 'feature', '-m', 'Merge feature']);
await writeFile(
  join(repo, 'src', 'app.ts'),
  'export const title = "source-code-sentinel";\nexport const version = 1;\n',
);
await git.add('.');
await git.commit('Update application');
await writeFile(join(repo, 'uncommitted.txt'), 'do not change');
const before = await git.status();
const head = await git.revparse(['HEAD']);
await mkdir('docs', { recursive: true });
await mkdir('test-results', { recursive: true });
const errors = [];
const app = await electron.launch({
  ...(process.env.GITATLAS_EXECUTABLE ? { executablePath: resolve(process.env.GITATLAS_EXECUTABLE) } : {}),
  args: [...(process.env.GITATLAS_EXECUTABLE ? [] : ['.']), `--user-data-dir=${join(temp, 'profile')}`],
  env: { ...process.env, GITATLAS_DEV: '0' },
  timeout: 60000,
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 980 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByRole('button', { name: '先体验一个演示仓库' }).waitFor();
  const security = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox };
  });
  assert.deepEqual(security, { contextIsolation: true, nodeIntegration: false, sandbox: true });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const status = await page.evaluate(() => window.gitAtlas.status());
  assert.equal(status.ok, true);
  assert.equal(status.data.git, true);
  await page.getByRole('button', { name: '先体验一个演示仓库' }).click();
  await page.getByText('沿途的里程碑').waitFor();
  await page.screenshot({ path: 'docs/overview.png', fullPage: false });
  await page.getByRole('button', { name: /时光回溯/ }).click();
  await page.getByText('此次变化', { exact: true }).waitFor();
  await page.screenshot({ path: 'docs/timeline.png', fullPage: false });
  await page.getByRole('button', { name: '第一次提交', exact: true }).click();
  await page.getByRole('button', { name: '播放历史', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('input[aria-label="提交进度"]').value) > 0);
  await page.getByRole('button', { name: '暂停播放', exact: true }).click();
  const paused = await page.getByRole('slider', { name: '提交进度' }).inputValue();
  await page.getByRole('textbox', { name: '搜索提交' }).fill('author:Alice');
  assert.ok((await page.locator('.commit-row').count()) > 0);
  assert.ok((await page.locator('.commit-row').allTextContents()).every((t) => t.includes('Alice')));
  await page.getByRole('textbox', { name: '搜索提交' }).press('ArrowLeft');
  assert.equal(await page.getByRole('slider', { name: '提交进度' }).inputValue(), paused);
  await page.getByRole('textbox', { name: '搜索提交' }).fill('');
  await page.getByRole('button', { name: '最新提交', exact: true }).click();
  await page.getByRole('button', { name: /生长视图/ }).click();
  await page.locator('.directory-card').first().waitFor();
  await page.screenshot({ path: 'docs/growth-view.png', fullPage: false });
  await page.getByRole('button', { name: /活动节奏/ }).click();
  await page.locator('.heat-cell').first().waitFor();
  await page.getByRole('button', { name: /贡献者/ }).click();
  await page.locator('.contributor-card').first().click();
  await page.getByRole('button', { name: '查看提交' }).waitFor();
  await page.getByRole('button', { name: /快照对比/ }).click();
  await page.getByRole('button', { name: '比较快照', exact: true }).click();
  await page.getByText('新增文件', { exact: true }).waitFor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.getByRole('button', { name: /项目概览/ }).click();
  await page.getByText('沿途的里程碑').waitFor();
  await page.screenshot({ path: 'docs/dark-mode.png', fullPage: false });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.getByRole('button', { name: '打开另一个仓库' }).click();
  await page.setViewportSize({ width: 1500, height: 980 });
  await page.waitForFunction(
    () => document.querySelector('.workspace-switch strong')?.textContent === 'Atlas 示例项目',
  );
  assert.equal(await page.getByRole('combobox', { name: '当前分支' }).inputValue(), 'main');
  await page.getByRole('button', { name: /时光回溯/ }).click();
  await page.getByText('此次变化', { exact: true }).waitFor();
  await page.locator('.changes-list button').first().click();
  await page.waitForFunction(() =>
    document.querySelector('.diff-content')?.textContent.includes('+export const version = 1;'),
  );
  await page.screenshot({ path: 'docs/commit-detail.png', fullPage: false });
  await page.getByRole('combobox', { name: '当前分支' }).selectOption('feature');
  await page.waitForFunction(() => !document.querySelector('.loading-card'));
  assert.equal(await git.revparse(['HEAD']), head);
  assert.equal((await git.status()).files.length, before.files.length);
  await page.getByRole('combobox', { name: '当前分支' }).selectOption('main');
  await page.waitForFunction(() => !document.querySelector('.loading-card'));
  const exported = join(temp, 'history.json');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, exported);
  await page.getByRole('button', { name: '导出历史', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '历史已导出' }).waitFor();
  const json = await readFile(exported, 'utf8');
  assert.ok(!json.includes('source-code-sentinel'));
  assert.ok(!json.includes(repo));
  assert.ok(!json.includes('test@example.invalid'));
  assert.equal(JSON.parse(json).commits.length, 5);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, exported);
  await page.getByRole('button', { name: '导入 JSON', exact: true }).click();
  await page.getByText('导入历史 · 元数据模式，未包含源码或 Diff').waitFor();
  assert.equal(await page.getByRole('combobox', { name: '当前分支' }).isDisabled(), true);
  // Real public GitHub download, with no stored user credentials or auth prompts.
  await page.getByRole('button', { name: '连接 GitHub 仓库', exact: true }).click();
  await page.getByRole('tab', { name: 'GitHub 账户' }).click();
  await page.getByRole('button', { name: '登录 GitHub', exact: true }).waitFor();
  await page.getByRole('tab', { name: '仓库链接' }).click();
  await page.getByLabel('GitHub 仓库链接', { exact: true }).fill('https://example.com/a/b');
  await page.getByRole('button', { name: '下载并打开', exact: true }).click();
  await page.locator('.remote-error').filter({ hasText: '请输入 https://github.com/' }).waitFor();
  await page.getByLabel('GitHub 仓库链接', { exact: true }).fill('https://github.com/fqxxzyw/GitAtlas');
  await page.getByRole('button', { name: '下载并打开', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('.workspace-switch strong')?.textContent === 'fqxxzyw/GitAtlas',
    undefined,
    { timeout: 180000 },
  );
  const remoteCaches = await page.evaluate(() => window.gitAtlas.remoteCaches());
  assert.equal(remoteCaches.ok, true);
  assert.equal(remoteCaches.data.length, 1);
  await page.getByRole('button', { name: '连接 GitHub 仓库', exact: true }).click();
  await page.getByRole('tab', { name: '本地缓存' }).click();
  await page.getByRole('button', { name: '离线打开', exact: true }).click();
  await page.getByRole('dialog', { name: '连接 GitHub 仓库' }).waitFor({ state: 'hidden' });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, repo);
  await page.getByRole('button', { name: '打开另一个仓库' }).click();
  await page.waitForFunction(
    () => document.querySelector('.workspace-switch strong')?.textContent === 'Atlas 示例项目',
  );
  await page.getByRole('button', { name: '连接 GitHub 仓库', exact: true }).click();
  await page.getByRole('tab', { name: '本地缓存' }).click();
  await page.getByRole('button', { name: '删除缓存 fqxxzyw/GitAtlas', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByText('还没有下载过仓库。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭仓库连接', exact: true }).click();
  assert.deepEqual(errors, []);
  await writeFile(
    'test-results/smoke.json',
    JSON.stringify(
      {
        passed: true,
        platform: process.platform,
        security,
        checks: [
          'packaged startup',
          'preload isolation',
          'demo navigation',
          'play/pause',
          'search',
          'keyboard focus',
          'growth',
          'activity',
          'contributors',
          'compare',
          'theme',
          'local Git scan',
          'real diff',
          'read-only branches',
          'export privacy',
          'import',
          'remote URL validation',
          'real public GitHub clone',
          'offline remote cache',
          'remote cache deletion',
          'GitHub login entry',
        ],
        screenshots: ['overview', 'timeline', 'growth-view', 'dark-mode', 'commit-detail'],
      },
      null,
      2,
    ),
  );
  console.log('Native Electron smoke test passed.');
} catch (error) {
  const page = await app.firstWindow().catch(() => null);
  if (page) {
    await page.screenshot({ path: 'test-results/failure.png', fullPage: false }).catch(() => {});
    await writeFile('test-results/failure.txt', await page.locator('body').innerText()).catch(() => {});
  }
  throw error;
} finally {
  await app.close();
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
}
