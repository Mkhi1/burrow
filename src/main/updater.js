'use strict';

// Auto-update from GitHub releases. Downloads quietly in the background and
// installs when you choose "Restart to update" (or the next time you quit).
// Never restarts on its own: people run agents inside Burrow.

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

function startUpdater({ app, send }) {
  let status = { state: 'idle', current: app.getVersion() };
  const set = (patch) => {
    status = { ...status, ...patch };
    send('update', status);
  };

  if (!app.isPackaged) {
    return { status: () => ({ ...status, state: 'dev' }), check: async () => {}, install: () => {} };
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => set({ state: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    const msg = String(err?.message || err);
    // No release with update info on GitHub yet: not a real problem, nothing newer exists.
    if (/latest\.yml|404|No published versions/i.test(msg)) set({ state: 'latest', checkedAt: Date.now() });
    else if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|net::/i.test(msg)) set({ state: 'error', error: 'offline' });
    else set({ state: 'error', error: msg.split('\n')[0].slice(0, 80) });
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);
  setInterval(check, CHECK_EVERY_MS);

  return {
    status: () => status,
    check,
    // Silent install, then start Burrow again.
    install: () => status.state === 'ready' && autoUpdater.quitAndInstall(true, true),
  };
}

module.exports = { startUpdater };
