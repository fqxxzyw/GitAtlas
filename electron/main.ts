import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, Menu, shell } from 'electron';
import { join } from 'node:path';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { GitService } from './git-service';
import { RemoteService, parseGitHubURL } from './remote-service';
import { GitAtlasFailure, mapError } from './errors';
import { exportHistory, validateHistory } from '../src/core/transfer';
import type { RecentRepository, Result } from '../src/core/model';
let window: BrowserWindow;
let service: GitService;
let remote: RemoteService;
let recent: RecentRepository[] = [];
const isDev = !app.isPackaged && process.env.GITATLAS_DEV === '1';
const rendererURL = isDev
  ? 'http://127.0.0.1:5173'
  : pathToFileURL(join(__dirname, '../dist/index.html')).href;
const settingsFile = () => join(app.getPath('userData'), 'recent.json');
async function saveRecent() {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(settingsFile(), JSON.stringify(recent));
}
async function remember(name: string) {
  recent = [
    { path: service.path, name, openedAt: new Date().toISOString() },
    ...recent.filter((r) => r.path !== service.path),
  ].slice(0, 10);
  await saveRecent();
}
function handle<T>(name: string, fn: (...args: unknown[]) => Promise<T> | T) {
  ipcMain.handle(`atlas:${name}`, async (event, ...args): Promise<Result<T>> => {
    try {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== rendererURL
      )
        throw new Error('Untrusted IPC sender');
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      if (isDev) console.error(error);
      return { ok: false, error: mapError(error) };
    }
  });
}
function installHandlers() {
  const string = z.string().max(8192);
  const hash = z.string().regex(/^[a-f0-9]{40,64}$/);
  handle('remote-status', () => remote.status());
  handle('github-login', () => remote.login());
  handle('github-logout', () => remote.logout());
  handle('github-repositories', (page) => remote.repositories(z.number().int().min(1).max(20).parse(page)));
  handle('remote-caches', () => remote.listCaches());
  handle('remote-open', async (url) => {
    const path = await remote.download(z.string().max(500).parse(url));
    const data = await service.open(path, parseGitHubURL(String(url)).fullName);
    await remember(data.repository);
    return data;
  });
  handle('remote-open-cache', async (id) => {
    const cacheId = hash.parse(id);
    const data = await service.open(
      await remote.cachePath(cacheId),
      remote.listCaches().find((c) => c.id === cacheId)?.fullName,
    );
    await remember(data.repository);
    return data;
  });
  handle('remote-remove-cache', async (id) => {
    const cacheId = hash.parse(id);
    const path = await remote.cachePath(cacheId);
    if (service.path === path) throw new GitAtlasFailure('CACHE_IN_USE', 'Current repository is open');
    await remote.removeCache(cacheId);
    await service.clearRepositoryCache(path);
    recent = recent.filter((r) => r.path !== path);
    await saveRecent();
  });
  handle('remote-cancel', () => {
    remote.cancel();
    service.cancel();
  });
  handle('github-authorize', async () => {
    await shell.openExternal('https://github.com/login/device');
  });
  handle('status', () => GitService.status());
  handle('recent', () => recent);
  handle('open', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: '打开 Git 仓库',
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    const data = await service.open(result.filePaths[0]);
    await remember(data.repository);
    return data;
  });
  handle('reopen', async (value) => {
    const path = string.parse(value);
    if (!recent.some((r) => r.path === path))
      throw new GitAtlasFailure('REPOSITORY_NOT_FOUND', 'Unknown recent path');
    const data = await service.open(path, recent.find((r) => r.path === path)?.name);
    await remember(data.repository);
    return data;
  });
  handle('forget', async (value) => {
    const path = string.parse(value);
    recent = recent.filter((r) => r.path !== path);
    await saveRecent();
    return recent;
  });
  handle('scan', (branch, limit) =>
    service.scan(string.parse(branch), z.number().int().min(1).max(20000).parse(limit)),
  );
  handle('cancel', () => service.cancel());
  handle('diff', (commit, path) => service.diff(hash.parse(commit), string.parse(path)));
  handle('compare', (a, b) => service.compare(hash.parse(a), hash.parse(b)));
  handle('export', async (value) => {
    let json: string;
    try {
      json = exportHistory(validateHistory(value));
    } catch {
      throw new GitAtlasFailure('INVALID_DATA', 'Invalid export');
    }
    const result = await dialog.showSaveDialog(window, {
      title: '导出历史元数据',
      defaultPath: 'GitAtlas-history.json',
      filters: [{ name: 'GitAtlas History', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, json, 'utf8');
    return true;
  });
  handle('import', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: '导入 GitAtlas 历史',
      properties: ['openFile'],
      filters: [{ name: 'GitAtlas History', extensions: ['json'] }],
    });
    if (result.canceled) return null;
    try {
      if ((await stat(result.filePaths[0])).size > 50 * 1024 * 1024) throw new Error('Too large');
      return validateHistory(JSON.parse(await readFile(result.filePaths[0], 'utf8')));
    } catch {
      throw new GitAtlasFailure('INVALID_DATA', 'Invalid import');
    }
  });
  handle('theme', (value) => {
    nativeTheme.themeSource = z.enum(['light', 'dark', 'system']).parse(value);
    updateChrome();
  });
}
function updateChrome() {
  const dark = nativeTheme.shouldUseDarkColors;
  if (process.platform === 'win32' || process.platform === 'linux')
    window.setTitleBarOverlay({
      color: dark ? '#161e2b' : '#ecf0f5',
      symbolColor: dark ? '#e6edf7' : '#25344a',
      height: 42,
    });
}
async function createWindow() {
  window = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    title: 'GitAtlas',
    icon: join(__dirname, '../build/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ecf0f5', symbolColor: '#25344a', height: 42 },
    backgroundColor: '#00000000',
    backgroundMaterial: 'mica',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererURL) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  nativeTheme.on('updated', updateChrome);
  updateChrome();
  await window.loadURL(rendererURL);
}
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed =
      details.url.startsWith('file://') ||
      (isDev && /^https?:\/\/127\.0\.0\.1:5173\//.test(details.url)) ||
      (isDev && details.url.startsWith('ws://127.0.0.1:5173'));
    callback({ cancel: !allowed });
  });
  try {
    recent = z
      .array(z.object({ path: z.string(), name: z.string(), openedAt: z.string() }))
      .parse(JSON.parse(await readFile(settingsFile(), 'utf8')))
      .slice(0, 10);
  } catch {
    /* First launch. */
  }
  service = new GitService(join(app.getPath('userData'), 'cache'), (progress) => {
    if (window && !window.isDestroyed()) window.webContents.send('atlas:progress', progress);
  });
  remote = new RemoteService(join(app.getPath('userData'), 'remote'), (progress) => {
    if (window && !window.isDestroyed()) window.webContents.send('atlas:remote-progress', progress);
  });
  await remote.initialize();
  installHandlers();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});
app.on('before-quit', () => remote?.cancel());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
