import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_SERVER = path.resolve(__dirname, 'dist', 'server.mjs');
const DIST_INDEX = path.resolve(__dirname, 'dist', 'index.html');
const PROFILE_DIR = path.resolve(__dirname, 'data', '.desktop-profile');
const PREFERRED_PORT = Number(process.env.PORT) || 3000;

function checkHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(Boolean(parsed && parsed.ok && parsed.mode === 'local-first'));
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function waitForServerReady(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkHealth(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function findDesktopShellExecutable() {
  if (process.platform === 'win32') {
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const localApp = process.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      localApp ? path.join(localApp, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localApp ? path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(pf86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ].filter(Boolean);
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  const linuxCandidates = [
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return linuxCandidates.find((p) => fs.existsSync(p)) || null;
}

async function ensureBuiltIfPossible() {
  if (fs.existsSync(DIST_SERVER) && fs.existsSync(DIST_INDEX)) return true;
  console.log('Production bundle not found yet. Building Rinse...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['run', 'build'], {
    cwd: __dirname,
    stdio: 'inherit',
  });
  return result.status === 0 && fs.existsSync(DIST_SERVER) && fs.existsSync(DIST_INDEX);
}

async function main() {
  const readyToServe = await ensureBuiltIfPossible();
  if (!readyToServe) {
    console.error(
      'Unable to build or locate dist/server.mjs. On a 32-bit PC, run "npm run build" once on a 64-bit PC and copy the dist folder.'
    );
    process.exit(1);
  }

  let targetPort = PREFERRED_PORT;
  let spawnedServer = null;
  const alreadyRunning = await checkHealth(targetPort);

  if (!alreadyRunning) {
    while (!(await isPortFree(targetPort)) && targetPort < PREFERRED_PORT + 20) {
      targetPort += 1;
    }

    spawnedServer = spawn(process.execPath, [DIST_SERVER, '--prod'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(targetPort), NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    spawnedServer.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });

    const ok = await waitForServerReady(targetPort);
    if (!ok) {
      console.error(`Failed to start Rinse local server on port ${targetPort}.`);
      spawnedServer.kill();
      process.exit(1);
    }
  }

  const appUrl = `http://localhost:${targetPort}`;
  const shellExe = findDesktopShellExecutable();

  const stopServer = () => {
    if (spawnedServer && !spawnedServer.killed) {
      spawnedServer.kill();
    }
  };

  process.on('SIGINT', () => {
    stopServer();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopServer();
    process.exit(0);
  });

  if (shellExe) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    console.log(`Launching Rinse standalone window on ${appUrl}`);
    const winProcess = spawn(
      shellExe,
      [
        `--app=${appUrl}`,
        `--user-data-dir=${PROFILE_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1360,860',
      ],
      {
        cwd: __dirname,
        stdio: 'ignore',
      }
    );

    winProcess.on('exit', () => {
      stopServer();
      process.exit(0);
    });
  } else {
    console.log(`Desktop window shell (Edge/Chrome) not found; opening ${appUrl}`);
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', appUrl], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [appUrl], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [appUrl], { detached: true, stdio: 'ignore' }).unref();
    }
    console.log(`Rinse is running at ${appUrl}. Press Ctrl+C to stop.`);
  }
}

main();
