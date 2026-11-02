'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const listener = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('burrow', {
  getState: () => ipcRenderer.invoke('state:get'),
  dispatch: (action) => ipcRenderer.invoke('dispatch', action),
  newSession: (opts) => ipcRenderer.invoke('session:new', opts),
  ensureSession: (id, cols, rows) => ipcRenderer.invoke('session:ensure', id, cols, rows),
  restartSession: (id, cols, rows) => ipcRenderer.invoke('session:restart', id, cols, rows),
  stopSession: (id) => ipcRenderer.invoke('session:stop', id),
  removeSession: (id) => ipcRenderer.invoke('session:remove', id),
  pickProject: () => ipcRenderer.invoke('project:pick'),
  openProject: (id) => ipcRenderer.invoke('project:open', id),
  removeProject: (id) => ipcRenderer.invoke('project:remove', id),
  getUsage: (opts) => ipcRenderer.invoke('usage:get', opts),
  scanUsage: () => ipcRenderer.invoke('usage:scan'),
  onUsageProgress: on('usage:progress'),
  onUsageUpdated: on('usage:updated'),
  refreshAgents: () => ipcRenderer.invoke('agents:refresh'),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  fullscreen: () => ipcRenderer.send('window:fullscreen'),
  openExternal: (url) => ipcRenderer.send('shell:external', url),
  onState: on('state'),
  onAgents: on('agents'),
  onData: on('pty:data'),
  onStatus: on('status'),
  onUnread: on('unread'),
  onToast: on('toast'),
  onMaximized: on('window:maximized'),
});
