import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { INITIAL_ERP_STATE } from './src/data/seedData';
import type { ErpState, OnlinePresenceUser, ScheduledTask, UserRole } from './src/types/erp';
import { migrateErpState } from './src/utils/migration';
import { GitHubSyncManager } from './server/githubSync';

const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT =
  path.basename(currentDir) === 'dist' ? path.resolve(currentDir, '..') : currentDir;

function resolvePaths(customDataDir?: string) {
  const dataDir =
    customDataDir || process.env.RINSE_DATA_DIR || path.resolve(APP_ROOT, 'data');
  const backupDir = path.resolve(dataDir, 'backups');
  const stateFile = path.resolve(dataDir, 'laundry-erp.json');
  return { dataDir, backupDir, stateFile };
}

function ensureDirs(dataDir: string, backupDir: string) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
}

function loadState(dataDir: string, backupDir: string, stateFile: string): ErpState {
  ensureDirs(dataDir, backupDir);
  if (!fs.existsSync(stateFile)) {
    const seeded: ErpState = {
      ...INITIAL_ERP_STATE,
      syncRevision: 1,
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: 'System',
    };
    fs.writeFileSync(stateFile, JSON.stringify(seeded, null, 2), 'utf-8');
    return seeded;
  }
  try {
    const raw = fs.readFileSync(stateFile, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ErpState>;
    const migrated = migrateErpState(parsed);
    return {
      ...migrated,
      syncRevision: migrated.syncRevision || 1,
    };
  } catch {
    return { ...INITIAL_ERP_STATE, syncRevision: 1 };
  }
}

function saveStateAtomic(dataDir: string, backupDir: string, stateFile: string, state: ErpState) {
  ensureDirs(dataDir, backupDir);
  const tmpFile = `${stateFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  try {
    fs.renameSync(tmpFile, stateFile);
  } catch {
    // Windows 32/64-bit antivirus or file-lock fallback when overwriting existing JSON
    fs.copyFileSync(tmpFile, stateFile);
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup failure if already unlocked
    }
  }
}

function formatIcsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '20261118T120000Z';
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function buildIcsFeed(state: ErpState): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rinse//Laundry Operations & Task Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(state.settings.companyName)} Operations`,
  ];

  for (const task of state.tasks) {
    const start = formatIcsDate(task.dueAt);
    const endIso = new Date(new Date(task.dueAt).getTime() + 30 * 60000).toISOString();
    const end = formatIcsDate(endIso);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@rinse.local`);
    lines.push(`DTSTAMP:${formatIcsDate(new Date().toISOString())}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${escapeIcsText(`[${task.priority}] ${task.title}`)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(`${task.description} | Assignee: ${task.assignee} | Status: ${task.status}`)}`);
    lines.push(`CATEGORIES:${escapeIcsText(task.category)}`);
    lines.push(`STATUS:${task.status === 'Completed' ? 'COMPLETED' : 'CONFIRMED'}`);
    if (task.reminderMinutesBefore > 0) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeIcsText(task.title)}`);
      lines.push(`TRIGGER:-PT${task.reminderMinutesBefore}M`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  for (const order of state.orders) {
    if (order.stage === 'Delivered') continue;
    const start = formatIcsDate(order.expectedDeliveryAt);
    const endIso = new Date(new Date(order.expectedDeliveryAt).getTime() + 30 * 60000).toISOString();
    const end = formatIcsDate(endIso);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:ORDER-${order.id}@rinse.local`);
    lines.push(`DTSTAMP:${formatIcsDate(order.createdAt)}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${escapeIcsText(`Delivery Due: ${order.id} (${order.customerName})`)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(`Stage: ${order.stage} | Service Tier: ${order.deliveryOptionName} | Total: ${state.settings.currencySymbol} ${order.totalAmount}`)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

interface WsClientMeta {
  clientId: string;
  userId?: string;
  displayName?: string;
  role?: UserRole;
  connectedAt: string;
}

export interface StartServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  distDir?: string;
  forceProd?: boolean;
}

export async function startServer(options: StartServerOptions = {}) {
  const { dataDir, backupDir, stateFile } = resolvePaths(options.dataDir);
  const app = express();
  const requestedPort = options.port ?? (Number(process.env.PORT) || 3000);
  const host = options.host || '0.0.0.0';

  const githubSync = new GitHubSyncManager(dataDir);
  let currentState: ErpState = loadState(dataDir, backupDir, stateFile);
  const wsClients = new Map<WebSocket, WsClientMeta>();
  const pendingOAuthStates = new Map<string, number>();
  let activePort = requestedPort;

  const resolveAppUrl = (req?: express.Request) => {
    const envUrl = process.env.APP_URL?.trim();
    if (envUrl && envUrl !== 'MY_APP_URL') {
      return envUrl.replace(/\/+$/, '');
    }
    if (req) {
      const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'http';
      const reqHost = req.get('host');
      if (reqHost) return `${proto}://${reqHost}`.replace(/\/+$/, '');
    }
    return `http://localhost:${activePort}`;
  };

  const getOnlineUsers = (): OnlinePresenceUser[] => {
    const list: OnlinePresenceUser[] = [];
    for (const meta of wsClients.values()) {
      if (meta.userId && meta.displayName && meta.role) {
        list.push({
          clientId: meta.clientId,
          userId: meta.userId,
          displayName: meta.displayName,
          role: meta.role,
          connectedAt: meta.connectedAt,
        });
      }
    }
    return list;
  };

  const broadcastJson = (payload: unknown, excludeClientId?: string) => {
    const serialized = JSON.stringify(payload);
    for (const [socket, meta] of wsClients.entries()) {
      if (excludeClientId && meta.clientId === excludeClientId) continue;
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(serialized);
        } catch {
          // ignore broken socket write
        }
      }
    }
  };

  const applyAuthoritativeState = (
    incoming: ErpState,
    opts: { updatedBy?: string; originClientId?: string; skipGitHubPush?: boolean } = {}
  ): ErpState => {
    const migrated = migrateErpState(incoming);
    const nextRevision = Math.max(currentState.syncRevision ?? 1, migrated.syncRevision ?? 0) + 1;
    const nowIso = new Date().toISOString();
    const stamped: ErpState = {
      ...migrated,
      syncRevision: nextRevision,
      lastUpdatedAt: nowIso,
      lastUpdatedBy: opts.updatedBy || migrated.lastUpdatedBy || 'Staff',
    };
    currentState = stamped;
    saveStateAtomic(dataDir, backupDir, stateFile, currentState);

    broadcastJson(
      {
        type: 'state:updated',
        revision: currentState.syncRevision,
        updatedBy: currentState.lastUpdatedBy,
        updatedAt: currentState.lastUpdatedAt,
        originClientId: opts.originClientId,
        state: currentState,
      },
      opts.originClientId
    );

    if (!opts.skipGitHubPush) {
      githubSync.scheduleAutoPush(
        () => currentState,
        currentState.lastUpdatedBy,
        () => {
          broadcastJson({
            type: 'github:status',
            status: githubSync.getStatus(`${resolveAppUrl()}/auth/callback`),
          });
        }
      );
    }

    return currentState;
  };

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'multi-user-sync',
      revision: currentState.syncRevision ?? 1,
      onlineClients: wsClients.size,
      githubConnected: githubSync.isReadyToSync(),
      platform: process.platform,
      arch: process.arch,
    });
  });

  app.get('/api/state', (_req, res) => {
    res.json(currentState);
  });

  app.put('/api/state', (req, res) => {
    const body = req.body as
      | ErpState
      | { state?: ErpState; baseRevision?: number; updatedBy?: string; clientId?: string };

    const isWrapped = body && typeof body === 'object' && 'state' in body && body.state;
    const nextState = (isWrapped ? body.state : body) as ErpState;
    const baseRevision = isWrapped ? body.baseRevision : undefined;
    const updatedBy = isWrapped ? body.updatedBy : undefined;
    const clientId = isWrapped ? body.clientId : undefined;

    if (!nextState || !nextState.settings || !Array.isArray(nextState.accounts)) {
      res.status(400).json({ error: 'Invalid ERP state payload' });
      return;
    }

    const currentRev = currentState.syncRevision ?? 1;
    if (typeof baseRevision === 'number' && baseRevision !== currentRev) {
      res.status(409).json({
        error: 'conflict',
        message: 'Another connected user saved a newer update.',
        currentRevision: currentRev,
        latestState: currentState,
      });
      return;
    }

    const saved = applyAuthoritativeState(nextState, {
      updatedBy,
      originClientId: clientId,
    });

    res.json({
      ok: true,
      revision: saved.syncRevision,
      savedAt: saved.lastUpdatedAt,
    });
  });

  app.post('/api/backup', (req, res) => {
    const sourceState = (
      req.body && req.body.settings ? req.body : currentState
    ) as ErpState;
    ensureDirs(dataDir, backupDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;
    const filePath = path.resolve(backupDir, filename);
    const updatedState: ErpState = {
      ...sourceState,
      settings: {
        ...sourceState.settings,
        lastBackupAt: new Date().toISOString(),
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(updatedState, null, 2), 'utf-8');
    const saved = applyAuthoritativeState(updatedState, { updatedBy: 'Snapshot Backup' });
    res.json({
      ok: true,
      filename,
      lastBackupAt: saved.settings.lastBackupAt,
      revision: saved.syncRevision,
    });
  });

  app.get('/api/backups', (_req, res) => {
    ensureDirs(dataDir, backupDir);
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 20)
      .map((name) => {
        const stat = fs.statSync(path.resolve(backupDir, name));
        return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      });
    res.json({ backups: files });
  });

  app.post('/api/restore', (req, res) => {
    const { state, filename } = req.body as { state?: ErpState; filename?: string };
    let restored: ErpState | null = null;
    if (filename) {
      const target = path.resolve(backupDir, path.basename(filename));
      if (!fs.existsSync(target)) {
        res.status(404).json({ error: 'Backup snapshot not found' });
        return;
      }
      restored = JSON.parse(fs.readFileSync(target, 'utf-8')) as ErpState;
    } else if (state && state.settings && Array.isArray(state.accounts)) {
      restored = state;
    }

    if (!restored) {
      res.status(400).json({ error: 'Invalid restore payload' });
      return;
    }
    const saved = applyAuthoritativeState(restored, { updatedBy: 'Backup Restore' });
    res.json({ ok: true, state: saved, revision: saved.syncRevision });
  });

  // ==========================================
  // GitHub OAuth & Shared Cloud Sync APIs
  // ==========================================
  app.get('/api/github/status', async (req, res) => {
    const callbackUrl = `${resolveAppUrl(req)}/auth/callback`;
    try {
      const hasToken = Boolean(githubSync.getEffectiveToken());
      const current = githubSync.getStatus(callbackUrl);
      if (hasToken && (!current.githubUser || (current.repoFullName && !current.repoFullName.includes('/')))) {
        await githubSync.ensureInitialized();
      }
      if (hasToken && req.query.verify === '1') {
        await githubSync.verifyRepositoryAccess();
      }
      const status = githubSync.getStatus(callbackUrl);
      console.info(
        `[GET /api/github/status] connected=${status.connected} envToken=${status.envTokenConfigured} repo=${status.repoFullName || 'unset'} branch=${status.branch} path=${status.filePath}${status.lastError ? ` error="${status.lastError}"` : ''}`
      );
      res.json(status);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GET /api/github/status] Failed:', msg);
      res.status(500).json({
        ...githubSync.getStatus(callbackUrl),
        error: msg,
      });
    }
  });

  app.get('/api/github/auth/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(400).json({
        error: 'GitHub OAuth is not configured on the server (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET).',
      });
      return;
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(nonce, Date.now() + 10 * 60 * 1000);
    for (const [k, exp] of pendingOAuthStates.entries()) {
      if (exp < Date.now()) pendingOAuthStates.delete(k);
    }

    const redirectUri = `${resolveAppUrl(req)}/auth/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
      state: nonce,
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
  });

  const handleGitHubOAuthCallback = async (req: express.Request, res: express.Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const stateParam = typeof req.query.state === 'string' ? req.query.state : '';
    const errParam = typeof req.query.error_description === 'string'
      ? req.query.error_description
      : typeof req.query.error === 'string'
        ? req.query.error
        : '';

    if (errParam) {
      res.status(400).send(`<html><body><p>GitHub authorization cancelled: ${errParam}</p><script>setTimeout(()=>window.close(),1800)</script></body></html>`);
      return;
    }

    const expectedExpiry = pendingOAuthStates.get(stateParam);
    if (!code || !expectedExpiry || expectedExpiry < Date.now()) {
      res.status(400).send('<html><body><p>Invalid or expired OAuth state. Please close this window and try again.</p></body></html>');
      return;
    }
    pendingOAuthStates.delete(stateParam);

    try {
      const clientId = process.env.GITHUB_CLIENT_ID!;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET!;
      const redirectUri = `${resolveAppUrl(req)}/auth/callback`;

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Token exchange failed');
      }

      const user = await githubSync.setOAuthToken(tokenData.access_token);
      const isHttps = resolveAppUrl(req).startsWith('https://');
      res.cookie('rinse_gh_connected', user.login, {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      broadcastJson({
        type: 'github:status',
        status: githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`),
      });

      res.send(`<!DOCTYPE html>
<html>
  <head><title>Rinse GitHub Sync Connected</title></head>
  <body style="font-family: system-ui, sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f8fafc; color:#0f172a;">
    <div style="text-align:center; padding:24px;">
      <h2 style="margin:0 0 8px;">GitHub Connected</h2>
      <p style="margin:0; color:#475569;">Signed in as @${user.login}. Returning to Rinse...</p>
    </div>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github', user: ${JSON.stringify(user)} }, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GitHub OAuth failed';
      res.status(500).send(`<html><body><p>Authentication error: ${msg}</p></body></html>`);
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], handleGitHubOAuthCallback);

  app.get('/api/github/repos', async (_req, res) => {
    try {
      const repos = await githubSync.listRepos();
      res.json({ repos });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to list repos';
      console.error('[GET /api/github/repos] Error:', msg);
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/github/repos/create', async (req, res) => {
    try {
      const { name } = req.body as { name?: string };
      const repo = await githubSync.createPrivateDataRepo(name || 'rinse-cloud-data');
      console.info(`[POST /api/github/repos/create] Created private repo "${repo.fullName}"`);
      broadcastJson({
        type: 'github:status',
        status: githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`),
      });
      res.json({ ok: true, repo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create repo';
      console.error('[POST /api/github/repos/create] Error:', msg);
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/github/config', async (req, res) => {
    try {
      const { repoFullName, branch, filePath, autoSync } = req.body as {
        repoFullName?: string;
        branch?: string;
        filePath?: string;
        autoSync?: boolean;
      };
      githubSync.updateSettings({ repoFullName, branch, filePath, autoSync });
      await githubSync.ensureInitialized();
      const status = githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`);
      console.info(`[POST /api/github/config] Updated repo="${status.repoFullName || ''}" branch="${status.branch}" autoSync=${status.autoSync}`);
      broadcastJson({ type: 'github:status', status });
      res.json({ ok: true, status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update GitHub config';
      console.error('[POST /api/github/config] Error:', msg);
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/github/push', async (req, res) => {
    try {
      const { updatedBy } = (req.body || {}) as { updatedBy?: string };
      const result = await githubSync.pushState(currentState, updatedBy || currentState.lastUpdatedBy);
      const status = githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`);
      console.info(`[POST /api/github/push] Pushed rev=${currentState.syncRevision ?? 1} to "${status.repoFullName}" commit=${result.commitSha}`);
      broadcastJson({ type: 'github:status', status });
      res.json({ ok: true, ...result, status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GitHub push failed';
      console.error('[POST /api/github/push] Error:', msg);
      const status = githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`);
      broadcastJson({ type: 'github:status', status });
      res.status(400).json({ error: msg, status });
    }
  });

  app.post('/api/github/pull', async (req, res) => {
    try {
      const pulled = await githubSync.pullState();
      if (!pulled.found || !pulled.state) {
        const status = githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`);
        console.warn(`[POST /api/github/pull] 404 file not found yet at "${status.repoFullName}/${status.filePath}@${status.branch}"`);
        res.status(404).json({
          error: `No state file found at "${status.filePath}" on "${status.repoFullName}@${status.branch}". Click Push to GitHub once to initialize it.`,
          status,
        });
        return;
      }
      const saved = applyAuthoritativeState(pulled.state, {
        updatedBy: 'GitHub Cloud Pull',
        skipGitHubPush: true,
      });
      const status = githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`);
      console.info(`[POST /api/github/pull] Pulled rev=${saved.syncRevision} from "${status.repoFullName}"`);
      broadcastJson({ type: 'github:status', status });
      res.json({ ok: true, state: saved, revision: saved.syncRevision, status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GitHub pull failed';
      console.error('[POST /api/github/pull] Error:', msg);
      const status = githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`);
      broadcastJson({ type: 'github:status', status });
      res.status(400).json({ error: msg, status });
    }
  });

  app.post('/api/github/disconnect', (req, res) => {
    githubSync.disconnect();
    const status = githubSync.getStatus(`${resolveAppUrl(req)}/auth/callback`);
    console.info('[POST /api/github/disconnect] Disconnected GitHub sync');
    broadcastJson({ type: 'github:status', status });
    res.json({ ok: true, status });
  });

  // Calendar REST & iCalendar (.ics) APIs
  app.get('/api/calendar/feed.ics', (_req, res) => {
    const ics = buildIcsFeed(currentState);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="rinse-calendar.ics"');
    res.send(ics);
  });

  app.get('/api/calendar/events', (_req, res) => {
    const orderEvents = currentState.orders
      .filter((o) => o.stage !== 'Delivered')
      .map((o) => ({
        id: `ORDER-${o.id}`,
        title: `Order ${o.id} Delivery (${o.customerName})`,
        start: o.expectedDeliveryAt,
        category: 'Order Delivery',
        stage: o.stage,
        linkedRecordId: o.id,
      }));
    const taskEvents = currentState.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      start: t.dueAt,
      category: t.category,
      priority: t.priority,
      status: t.status,
      assignee: t.assignee,
      linkedRecordId: t.linkedRecordId,
    }));
    res.json({ events: [...taskEvents, ...orderEvents] });
  });

  app.post('/api/calendar/events', (req, res) => {
    const body = req.body as Partial<ScheduledTask>;
    if (!body.title || !body.dueAt) {
      res.status(400).json({ error: 'Title and dueAt are required' });
      return;
    }
    const newTask: ScheduledTask = {
      id: `TSK-${Date.now().toString().slice(-5)}`,
      title: body.title,
      description: body.description || '',
      category: body.category || 'General',
      priority: body.priority || 'Normal',
      status: body.status || 'Pending',
      dueAt: body.dueAt,
      reminderMinutesBefore: body.reminderMinutesBefore ?? 60,
      assignee: body.assignee || 'Owner',
      linkedRecordId: body.linkedRecordId,
      autoGenerated: false,
    };
    const nextState: ErpState = {
      ...currentState,
      tasks: [newTask, ...currentState.tasks],
    };
    const saved = applyAuthoritativeState(nextState, { updatedBy: 'Calendar API' });
    res.status(201).json({ task: newTask, revision: saved.syncRevision });
  });

  // Explicit 404 handler for unmatched /api/* routes (prevents SPA fallback in dev mode)
  app.use('/api', (req, res) => {
    console.warn(`[API 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  const distPath = options.distDir || path.resolve(APP_ROOT, 'dist');
  const distIndexPath = path.resolve(distPath, 'index.html');
  const forceProd =
    options.forceProd ||
    process.env.NODE_ENV === 'production' ||
    process.argv.includes('--prod');

  const serveStaticDist = () => {
    if (!fs.existsSync(distIndexPath)) {
      throw new Error(
        `Production build not found at ${distIndexPath}. Run "npm run build" first.`
      );
    }
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API route not found' });
        return;
      }
      res.sendFile(distIndexPath);
    });
  };

  if (!forceProd) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      if (fs.existsSync(distIndexPath)) {
        console.warn(
          'Vite dev middleware unavailable (such as 32-bit host); serving prebuilt dist/.'
        );
        serveStaticDist();
      } else {
        throw err;
      }
    }
  } else {
    serveStaticDist();
  }

  const started = await new Promise<{
    app: express.Express;
    server: ReturnType<express.Express['listen']>;
    port: number;
  }>((resolve) => {
    const server = app.listen(requestedPort, host, () => {
      const addr = server.address();
      const actualPort =
        typeof addr === 'object' && addr ? addr.port : requestedPort;
      activePort = actualPort;

      const wss = new WebSocketServer({ server, path: '/ws' });
      wss.on('connection', (socket) => {
        const meta: WsClientMeta = {
          clientId: crypto.randomUUID(),
          connectedAt: new Date().toISOString(),
        };
        wsClients.set(socket, meta);

        socket.send(
          JSON.stringify({
            type: 'sync:init',
            revision: currentState.syncRevision ?? 1,
            state: currentState,
            onlineUsers: getOnlineUsers(),
            githubStatus: githubSync.getStatus(`${resolveAppUrl()}/auth/callback`),
          })
        );

        socket.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as {
              type?: string;
              clientId?: string;
              userId?: string;
              displayName?: string;
              role?: UserRole;
            };
            if (msg.type === 'presence:identify') {
              if (msg.clientId) meta.clientId = msg.clientId;
              meta.userId = msg.userId;
              meta.displayName = msg.displayName;
              meta.role = msg.role;
              broadcastJson({
                type: 'presence:update',
                onlineUsers: getOnlineUsers(),
              });
            }
          } catch {
            // ignore malformed frames
          }
        });

        socket.on('close', () => {
          wsClients.delete(socket);
          broadcastJson({
            type: 'presence:update',
            onlineUsers: getOnlineUsers(),
          });
        });
      });

      const ghPollTimer = setInterval(() => {
        if (!githubSync.isReadyToSync() || githubSync.hasPendingLocalPush()) return;
        githubSync
          .checkForRemoteUpdate()
          .then((res) => {
            if (res.updated && res.state) {
              const remoteRev = res.state.syncRevision ?? 1;
              const localRev = currentState.syncRevision ?? 1;
              if (remoteRev >= localRev) {
                currentState = res.state;
                saveStateAtomic(dataDir, backupDir, stateFile, currentState);
                broadcastJson({
                  type: 'state:updated',
                  revision: currentState.syncRevision ?? 1,
                  updatedBy: currentState.lastUpdatedBy || 'GitHub Cloud Sync',
                  updatedAt: currentState.lastUpdatedAt,
                  state: currentState,
                });
              }
              broadcastJson({
                type: 'github:status',
                status: githubSync.getStatus(`${resolveAppUrl()}/auth/callback`),
              });
            }
          })
          .catch((err) => {
            console.warn('[GitHubSync Poll] Error:', err instanceof Error ? err.message : err);
          });
      }, 15000);

      server.on('close', () => {
        clearInterval(ghPollTimer);
        try {
          wss.close();
        } catch {
          // ignore close failure
        }
      });

      console.log(
        `Rinse ERP server running on http://localhost:${actualPort} (${process.platform}/${process.arch})`
      );
      resolve({ app, server, port: actualPort });
    });
  });

  // Non-blocking startup initialization & pull/init from GitHub when configured
  if (githubSync.getEffectiveToken()) {
    githubSync
      .ensureInitialized()
      .then(async () => {
        if (!githubSync.isReadyToSync()) {
          console.warn('[GitHubSync Boot] Token present but GITHUB_REPO is missing or invalid.');
          return;
        }
        const pulled = await githubSync.pullState();
        if (pulled.found && pulled.state) {
          const remoteRev = pulled.state.syncRevision ?? 1;
          const localRev = currentState.syncRevision ?? 1;
          const localIsFreshEmpty =
            currentState.orders.length === 0 &&
            currentState.customers.length === 0 &&
            currentState.journalEntries.length === 0;
          if (remoteRev > localRev || (localIsFreshEmpty && pulled.state.orders.length > 0)) {
            currentState = pulled.state;
            saveStateAtomic(dataDir, backupDir, stateFile, currentState);
            broadcastJson({
              type: 'state:updated',
              revision: currentState.syncRevision ?? 1,
              updatedBy: 'GitHub Cloud Boot Sync',
              updatedAt: currentState.lastUpdatedAt,
              state: currentState,
            });
            console.info(`[GitHubSync Boot] Pulled rev=${remoteRev} from GitHub.`);
          } else {
            console.info(`[GitHubSync Boot] Verified sync (local rev=${localRev}, remote rev=${remoteRev}).`);
          }
        } else if (!pulled.found) {
          const pushed = await githubSync.pushState(currentState, 'Initial Cloud Sync');
          console.info(`[GitHubSync Boot] Initialized remote state file (commit=${pushed.commitSha}).`);
        }
        broadcastJson({
          type: 'github:status',
          status: githubSync.getStatus(`${resolveAppUrl()}/auth/callback`),
        });
      })
      .catch((err) => {
        console.error('[GitHubSync Boot] Sync failed:', err instanceof Error ? err.message : err);
        broadcastJson({
          type: 'github:status',
          status: githubSync.getStatus(`${resolveAppUrl()}/auth/callback`),
        });
      });
  } else {
    console.info('[GitHubSync Boot] GITHUB_TOKEN not set; running with local JSON persistence only.');
  }

  return started;
}

if (process.env.RINSE_NO_AUTOSTART !== '1') {
  startServer().catch((err) => {
    console.error('Failed to start Rinse server:', err);
    process.exit(1);
  });
}
