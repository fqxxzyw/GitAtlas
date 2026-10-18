import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI, ScanProgress } from '../src/core/model';
const api:DesktopAPI={
  status:()=>ipcRenderer.invoke('atlas:status'),openRepository:()=>ipcRenderer.invoke('atlas:open'),
  recent:()=>ipcRenderer.invoke('atlas:recent'),reopen:path=>ipcRenderer.invoke('atlas:reopen',path),forget:path=>ipcRenderer.invoke('atlas:forget',path),
  scan:(branch,limit)=>ipcRenderer.invoke('atlas:scan',branch,limit),cancelScan:()=>ipcRenderer.invoke('atlas:cancel'),
  diff:(hash,path)=>ipcRenderer.invoke('atlas:diff',hash,path),compare:(a,b)=>ipcRenderer.invoke('atlas:compare',a,b),
  exportHistory:data=>ipcRenderer.invoke('atlas:export',data),importHistory:()=>ipcRenderer.invoke('atlas:import'),
  theme:value=>ipcRenderer.invoke('atlas:theme',value),
  onProgress:callback=>{const listener=(_event:Electron.IpcRendererEvent,p:ScanProgress)=>callback(p);ipcRenderer.on('atlas:progress',listener);return()=>ipcRenderer.removeListener('atlas:progress',listener);},
};
contextBridge.exposeInMainWorld('gitAtlas',api);
