import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, ScanProgress, RemoteProgress } from '../src/core/model';
const api: DesktopAPI = {
  remoteStatus: () => ipcRenderer.invoke('atlas:remote-status'),
  githubLogin: () => ipcRenderer.invoke('atlas:github-login'),
  githubLogout: () => ipcRenderer.invoke('atlas:github-logout'),
  githubRepositories: (page) => ipcRenderer.invoke('atlas:github-repositories', page),
  remoteOpen: (url) => ipcRenderer.invoke('atlas:remote-open', url),
  remoteCaches: () => ipcRenderer.invoke('atlas:remote-caches'),
  remoteOpenCache: (id) => ipcRenderer.invoke('atlas:remote-open-cache', id),
  remoteRemoveCache: (id) => ipcRenderer.invoke('atlas:remote-remove-cache', id),
  remoteCancel: () => ipcRenderer.invoke('atlas:remote-cancel'),
  openGitHubAuthorization: () => ipcRenderer.invoke('atlas:github-authorize'),
  onRemoteProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, p: RemoteProgress) => callback(p);
    ipcRenderer.on('atlas:remote-progress', listener);
    return () => ipcRenderer.removeListener('atlas:remote-progress', listener);
  },
  status: () => ipcRenderer.invoke('atlas:status'),
  openRepository: () => ipcRenderer.invoke('atlas:open'),
  recent: () => ipcRenderer.invoke('atlas:recent'),
  reopen: (path) => ipcRenderer.invoke('atlas:reopen', path),
  forget: (path) => ipcRenderer.invoke('atlas:forget', path),
  scan: (branch, limit) => ipcRenderer.invoke('atlas:scan', branch, limit),
  cancelScan: () => ipcRenderer.invoke('atlas:cancel'),
  diff: (hash, path) => ipcRenderer.invoke('atlas:diff', hash, path),
  compare: (a, b) => ipcRenderer.invoke('atlas:compare', a, b),
  exportHistory: (data) => ipcRenderer.invoke('atlas:export', data),
  importHistory: () => ipcRenderer.invoke('atlas:import'),
  theme: (value) => ipcRenderer.invoke('atlas:theme', value),
  onProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, p: ScanProgress) => callback(p);
    ipcRenderer.on('atlas:progress', listener);
    return () => ipcRenderer.removeListener('atlas:progress', listener);
  },
};
contextBridge.exposeInMainWorld('gitAtlas', api);
