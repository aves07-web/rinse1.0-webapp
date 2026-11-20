const { app, BrowserWindow, Menu, dialog } = require('electron');
const fs = require('fs');
const net = require('net');
const path = require('path');

let mainWindow = null;
let httpServer = null;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

async function createDesktopWindow() {
  const appRoot = app.getAppPath();
  const distDir = path.join(appRoot, 'dist');
  const distServerPath = path.join(distDir, 'server.cjs');
  const dataDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(appRoot, 'data');

  process.env.RINSE_NO_AUTOSTART = '1';
  process.env.NODE_ENV = 'production';

  const preferredPort = (await isPortAvailable(3000)) ? 3000 : 0;
  const serverModule = require(distServerPath);
  const started = await serverModule.startServer({
    port: preferredPort,
    host: '127.0.0.1',
    dataDir,
    distDir,
    forceProd: true,
  });

  httpServer = started.server;
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const primaryIconPath = path.join(appRoot, 'electron', 'assets', iconName);
  const fallbackIconPath = path.join(appRoot, 'build', iconName);
  const iconPath = fs.existsSync(primaryIconPath) ? primaryIconPath : fallbackIconPath;

  mainWindow = new BrowserWindow({
    title: 'Rinse',
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F5F5F7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  await mainWindow.loadURL(`http://127.0.0.1:${started.port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await createDesktopWindow();
    } catch (err) {
      dialog.showErrorBox(
        'Rinse Startup Error',
        err instanceof Error ? err.message : String(err)
      );
      app.quit();
    }

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createDesktopWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    if (httpServer) {
      try {
        httpServer.close();
      } catch {
        // Ignore close errors on shutdown
      }
      httpServer = null;
    }
  });
}
