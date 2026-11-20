const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('rinseDesktop', {
  isDesktopApp: true,
  platform: process.platform,
  arch: process.arch,
});
