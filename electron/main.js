const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 360,
    minHeight: 560,
    title: '科学计算器',
    backgroundColor: '#e8eaed',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
}

// ===== 自动更新：断点续传下载到 userData/updates =====
function updateDir() {
  const dir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statusOf(fileName) {
  const dir = updateDir();
  const full = path.join(dir, fileName);
  const part = full + '.part';
  try {
    if (fs.existsSync(full) && fs.statSync(full).size > 0) {
      const size = fs.statSync(full).size;
      return { received: size, complete: true, path: full };
    }
    const received = fs.existsSync(part) ? fs.statSync(part).size : 0;
    return { received, complete: false, path: '' };
  } catch (e) {
    return { received: 0, complete: false, path: '' };
  }
}

const activeDownloads = new Map();

function downloadFile(url, fileName, onProgress) {
  if (activeDownloads.has(fileName)) return activeDownloads.get(fileName);

  const task = new Promise((resolve) => {
    const dir = updateDir();
    const finalPath = path.join(dir, fileName);
    const partPath = finalPath + '.part';

    if (fs.existsSync(finalPath) && fs.statSync(finalPath).size > 0) {
      resolve({ ok: true, path: finalPath, complete: true, size: fs.statSync(finalPath).size });
      return;
    }

    let lastEmit = 0;

    const follow = (targetUrl, depth) => {
      if (depth > 6) { resolve({ ok: false, error: 'too many redirects' }); return; }
      let start = 0;
      try { start = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0; } catch (e) { start = 0; }

      const headers = { 'User-Agent': 'ScientificCalculator-Updater' };
      if (start > 0) headers.Range = 'bytes=' + start + '-';

      let req;
      try {
        req = https.get(targetUrl, { headers }, (res) => {
          const code = res.statusCode || 0;

          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            follow(new URL(res.headers.location, targetUrl).toString(), depth + 1);
            return;
          }
          if (code === 416) {
            res.resume();
            try { fs.unlinkSync(partPath); } catch (e) {}
            follow(targetUrl, depth + 1);
            return;
          }
          if (code !== 200 && code !== 206) {
            res.resume();
            resolve({ ok: false, error: 'HTTP ' + code });
            return;
          }

          let total = 0;
          const cr = res.headers['content-range'];
          const m = cr && /\/(\d+)$/.exec(cr);
          if (m) total = parseInt(m[1], 10);
          else if (res.headers['content-length']) total = start + parseInt(res.headers['content-length'], 10);

          const append = code === 206 && start > 0;
          const out = fs.createWriteStream(partPath, { flags: append ? 'a' : 'w' });
          let received = append ? start : 0;

          res.on('data', (chunk) => {
            received += chunk.length;
            const now = Date.now();
            if (now - lastEmit > 200) {
              lastEmit = now;
              onProgress(received, total);
            }
          });
          res.on('error', () => {
            try { out.end(); } catch (e) {}
            resolve({ ok: false, error: 'network error' });
          });
          out.on('error', () => resolve({ ok: false, error: 'write error' }));

          res.pipe(out);

          out.on('finish', () => {
            onProgress(received, total);
            try {
              if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
              fs.renameSync(partPath, finalPath);
              resolve({ ok: true, path: finalPath, complete: true, size: received });
            } catch (e) {
              resolve({ ok: false, error: 'rename failed' });
            }
          });
        });
      } catch (e) {
        resolve({ ok: false, error: e.message });
        return;
      }

      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    };

    follow(url, 0);
  }).finally(() => {
    activeDownloads.delete(fileName);
  });

  activeDownloads.set(fileName, task);
  return task;
}

ipcMain.handle('update:status', (event, fileName) => {
  if (!fileName) return { received: 0, complete: false, path: '' };
  return statusOf(fileName);
});

ipcMain.handle('update:download', (event, opts) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const fileName = opts.fileName;
  return downloadFile(opts.url, fileName, (received, total) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:progress', { fileName, received, total });
    }
  });
});

ipcMain.handle('update:open', async (event, filePath) => {
  if (!filePath) return 'no path';
  return shell.openPath(filePath);
});

ipcMain.handle('update:reveal', (event, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
});

ipcMain.handle('update:openExternal', (event, url) => {
  if (url) shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
