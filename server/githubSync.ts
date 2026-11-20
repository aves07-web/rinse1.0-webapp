import fs from 'fs';
import path from 'path';
import type { ErpState, GitHubSyncStatus } from '../src/types/erp';
import { migrateErpState } from '../src/utils/migration';

export interface GitHubSyncServerConfig {
  accessToken?: string;
  githubUser?: {
    login: string;
    avatarUrl?: string;
    name?: string;
  };
  repoFullName?: string;
  repoPrivate?: boolean;
  lastEnvRepo?: string;
  branch: string;
  filePath: string;
  autoSync: boolean;
  lastFileSha?: string;
  lastEtag?: string;
  lastSyncedAt?: string;
  lastSyncDirection?: 'push' | 'pull';
  lastCommitSha?: string;
  lastError?: string;
}

export interface GitHubRepoSummary {
  fullName: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  url: string;
}

function getEnvBranch(): string {
  return process.env.GITHUB_BRANCH?.trim() || 'main';
}

function getEnvFilePath(): string {
  return process.env.GITHUB_DATA_PATH?.trim().replace(/^\/+/, '') || 'data/laundry-erp.json';
}

function githubHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Rinse-Laundry-ERP',
  };
}

function sanitizeRepoSlug(slug: string): string {
  return slug
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

function encodeGitHubPath(filePath: string): string {
  return filePath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

export class GitHubSyncManager {
  private configFile: string;
  private config: GitHubSyncServerConfig;
  private syncing = false;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushPromise: Promise<void> | null = null;

  constructor(dataDir: string) {
    this.configFile = path.resolve(dataDir, 'github-sync.json');
    this.config = this.loadConfig(dataDir);
  }

  private loadConfig(dataDir: string): GitHubSyncServerConfig {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    let stored: Partial<GitHubSyncServerConfig> = {};
    if (fs.existsSync(this.configFile)) {
      try {
        stored = JSON.parse(fs.readFileSync(this.configFile, 'utf-8')) as Partial<GitHubSyncServerConfig>;
      } catch (err) {
        console.warn('[GitHubSync] Failed to parse github-sync.json, using defaults:', err);
        stored = {};
      }
    }
    const envRepo = process.env.GITHUB_REPO ? sanitizeRepoSlug(process.env.GITHUB_REPO) : undefined;
    const storedRepo = stored.repoFullName ? sanitizeRepoSlug(stored.repoFullName) : undefined;
    const envRepoChanged = Boolean(envRepo && envRepo !== stored.lastEnvRepo);
    const resolvedRepo = envRepoChanged ? envRepo : storedRepo || envRepo;

    return {
      accessToken: stored.accessToken,
      githubUser: stored.githubUser,
      repoFullName: resolvedRepo,
      repoPrivate: envRepoChanged ? undefined : stored.repoPrivate,
      lastEnvRepo: envRepo || stored.lastEnvRepo,
      branch: process.env.GITHUB_BRANCH?.trim() || stored.branch || getEnvBranch(),
      filePath: process.env.GITHUB_DATA_PATH?.trim().replace(/^\/+/, '') || stored.filePath || getEnvFilePath(),
      autoSync: stored.autoSync ?? Boolean(process.env.GITHUB_TOKEN?.trim() && resolvedRepo),
      lastFileSha: envRepoChanged ? undefined : stored.lastFileSha,
      lastEtag: envRepoChanged ? undefined : stored.lastEtag,
      lastSyncedAt: stored.lastSyncedAt,
      lastSyncDirection: stored.lastSyncDirection,
      lastCommitSha: stored.lastCommitSha,
      lastError: envRepoChanged ? undefined : stored.lastError,
    };
  }

  private saveConfig() {
    const dir = path.dirname(this.configFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf-8');
    try {
      fs.renameSync(tmp, this.configFile);
    } catch {
      fs.copyFileSync(tmp, this.configFile);
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore cleanup error
      }
    }
  }

  public getEffectiveToken(): string | undefined {
    const token = this.config.accessToken || process.env.GITHUB_TOKEN?.trim();
    return token || undefined;
  }

  public isReadyToSync(): boolean {
    return Boolean(this.getEffectiveToken() && this.config.repoFullName);
  }

  public hasPendingLocalPush(): boolean {
    return this.syncing || this.pushTimer !== null;
  }

  public getStatus(callbackUrl: string): GitHubSyncStatus {
    const token = this.getEffectiveToken();
    return {
      oauthConfigured: Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()),
      envTokenConfigured: Boolean(process.env.GITHUB_TOKEN?.trim()),
      connected: Boolean(token),
      githubUser: this.config.githubUser,
      repoFullName: this.config.repoFullName,
      repoPrivate: this.config.repoPrivate,
      branch: this.config.branch || getEnvBranch(),
      filePath: this.config.filePath || getEnvFilePath(),
      autoSync: this.config.autoSync,
      syncing: this.syncing,
      lastSyncedAt: this.config.lastSyncedAt,
      lastSyncDirection: this.config.lastSyncDirection,
      lastCommitSha: this.config.lastCommitSha,
      lastError: this.config.lastError,
      callbackUrl,
    };
  }

  public async verifyRepositoryAccess(): Promise<{ ok: boolean; error?: string }> {
    const token = this.getEffectiveToken();
    const repo = this.config.repoFullName;
    if (!token) {
      return { ok: false, error: 'Missing GitHub credentials (set GITHUB_TOKEN or connect via GitHub OAuth).' };
    }
    if (!repo || !repo.includes('/')) {
      return {
        ok: false,
        error: `Invalid or unresolved GITHUB_REPO ("${repo || ''}"). Expected format "owner/repo".`,
      };
    }

    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: githubHeaders(token),
    });
    if (repoRes.status === 401 || repoRes.status === 403) {
      const msg = `GitHub authentication/permission failed (${repoRes.status}) for "${repo}". Verify GITHUB_TOKEN has Contents read/write access.`;
      console.warn(`[GitHubSync] ${msg}`);
      this.config.lastError = msg;
      this.saveConfig();
      return { ok: false, error: msg };
    }
    if (repoRes.status === 404) {
      const accessible = await this.listRepos().catch(() => []);
      const accessibleHint =
        accessible.length > 0
          ? ` Accessible repos for this token: ${accessible.map((r) => r.fullName).join(', ')}.`
          : '';
      const msg = `GitHub repository "${repo}" was not found or token lacks access (404).${accessibleHint} Choose an accessible repo or click "Create Private Repo" in Settings.`;
      console.warn(`[GitHubSync] ${msg}`);
      this.config.lastError = msg;
      this.saveConfig();
      return { ok: false, error: msg };
    }
    if (!repoRes.ok) {
      const msg = `GitHub repository check failed (${repoRes.status}) for "${repo}".`;
      console.warn(`[GitHubSync] ${msg}`);
      this.config.lastError = msg;
      this.saveConfig();
      return { ok: false, error: msg };
    }

    const repoInfo = (await repoRes.json()) as { private?: boolean; default_branch?: string };
    this.config.repoPrivate = repoInfo.private;
    const branch = this.config.branch || repoInfo.default_branch || getEnvBranch();
    const branchRes = await fetch(
      `https://api.github.com/repos/${repo}/branches/${encodeURIComponent(branch)}`,
      { headers: githubHeaders(token) }
    );
    if (branchRes.status === 404) {
      const msg = `Branch "${branch}" returned 404 on "${repo}". Ensure the repository is initialized with at least one commit or set GITHUB_BRANCH="${repoInfo.default_branch || 'main'}".`;
      console.warn(`[GitHubSync] ${msg}`);
      this.config.lastError = msg;
      this.saveConfig();
      return { ok: false, error: msg };
    }

    this.config.lastError = undefined;
    this.saveConfig();
    return { ok: true };
  }

  public async ensureInitialized(): Promise<void> {
    const token = this.getEffectiveToken();
    if (!token) return;

    try {
      if (!this.config.githubUser) {
        this.config.githubUser = await this.fetchGitHubUser(token);
      }
      if (this.config.repoFullName && !this.config.repoFullName.includes('/')) {
        const repos = await this.listRepos();
        const match = repos.find(
          (r) => r.name.toLowerCase() === this.config.repoFullName!.toLowerCase()
        );
        if (match) {
          this.config.repoFullName = match.fullName;
          this.config.repoPrivate = match.private;
          if (!process.env.GITHUB_BRANCH) {
            this.config.branch = match.defaultBranch || this.config.branch;
          }
        } else if (this.config.githubUser?.login) {
          this.config.repoFullName = `${this.config.githubUser.login}/${this.config.repoFullName}`;
        }
        console.info(`[GitHubSync] Resolved GITHUB_REPO slug to "${this.config.repoFullName}"`);
      } else if (this.config.repoFullName && this.config.repoPrivate === undefined) {
        const check = await this.verifyRepositoryAccess();
        if (!check.ok) return;
      }
      this.config.lastError = undefined;
      this.saveConfig();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GitHub initialization failed';
      console.warn('[GitHubSync] ensureInitialized warning:', msg);
      this.config.lastError = msg;
      this.saveConfig();
    }
  }

  public async setOAuthToken(token: string) {
    const user = await this.fetchGitHubUser(token);
    this.config.accessToken = token;
    this.config.githubUser = user;
    this.config.lastError = undefined;
    this.saveConfig();
    return user;
  }

  public disconnect() {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.config.accessToken = undefined;
    this.config.githubUser = undefined;
    this.config.lastFileSha = undefined;
    this.config.lastError = undefined;
    this.config.autoSync = false;
    this.saveConfig();
  }

  public updateSettings(patch: {
    repoFullName?: string;
    branch?: string;
    filePath?: string;
    autoSync?: boolean;
  }) {
    if (patch.repoFullName !== undefined) {
      const cleaned = sanitizeRepoSlug(patch.repoFullName);
      if (cleaned !== this.config.repoFullName) {
        this.config.lastFileSha = undefined;
      }
      this.config.repoFullName = cleaned || undefined;
    }
    if (patch.branch !== undefined) {
      this.config.branch = patch.branch.trim() || getEnvBranch();
    }
    if (patch.filePath !== undefined) {
      const cleanedPath = patch.filePath.trim().replace(/^\/+/, '');
      if (cleanedPath !== this.config.filePath) {
        this.config.lastFileSha = undefined;
      }
      this.config.filePath = cleanedPath || getEnvFilePath();
    }
    if (patch.autoSync !== undefined) {
      this.config.autoSync = patch.autoSync;
    }
    this.config.lastError = undefined;
    this.saveConfig();
  }

  public async fetchGitHubUser(tokenOverride?: string): Promise<{ login: string; avatarUrl?: string; name?: string }> {
    const token = tokenOverride || this.getEffectiveToken();
    if (!token) throw new Error('GitHub is not connected.');
    const res = await fetch('https://api.github.com/user', {
      headers: githubHeaders(token),
    });
    if (!res.ok) {
      throw new Error(`GitHub user lookup failed (${res.status})`);
    }
    const data = (await res.json()) as { login: string; avatar_url?: string; name?: string };
    return {
      login: data.login,
      avatarUrl: data.avatar_url,
      name: data.name || data.login,
    };
  }

  public async listRepos(): Promise<GitHubRepoSummary[]> {
    const token = this.getEffectiveToken();
    if (!token) throw new Error('GitHub is not connected.');
    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      { headers: githubHeaders(token) }
    );
    if (!res.ok) {
      throw new Error(`Unable to fetch repositories (${res.status})`);
    }
    const raw = (await res.json()) as Array<{
      full_name: string;
      name: string;
      private: boolean;
      default_branch: string;
      html_url: string;
    }>;
    return raw.map((r) => ({
      fullName: r.full_name,
      name: r.name,
      private: r.private,
      defaultBranch: r.default_branch || 'main',
      url: r.html_url,
    }));
  }

  public async createPrivateDataRepo(name: string): Promise<GitHubRepoSummary> {
    const token = this.getEffectiveToken();
    if (!token) throw new Error('GitHub is not connected.');
    const cleanName = name.trim().replace(/[^a-zA-Z0-9._-]/g, '-') || 'rinse-cloud-data';
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        ...githubHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: cleanName,
        private: true,
        auto_init: true,
        description: 'Rinse ERP Shared Multi-User Cloud Data Store',
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Failed to create GitHub repository (${res.status}): ${errBody}`);
    }
    const created = (await res.json()) as {
      full_name: string;
      name: string;
      private: boolean;
      default_branch: string;
      html_url: string;
    };
    this.updateSettings({
      repoFullName: created.full_name,
      branch: created.default_branch || 'main',
      autoSync: true,
    });
    return {
      fullName: created.full_name,
      name: created.name,
      private: created.private,
      defaultBranch: created.default_branch || 'main',
      url: created.html_url,
    };
  }

  public async pullState(): Promise<{
    found: boolean;
    state?: ErpState;
    fileSha?: string;
  }> {
    if (this.config.repoFullName && !this.config.repoFullName.includes('/')) {
      await this.ensureInitialized();
    }
    const token = this.getEffectiveToken();
    const repo = this.config.repoFullName;
    if (!token || !repo) {
      throw new Error('GitHub repository is not configured.');
    }
    this.syncing = true;
    try {
      const filePath = this.config.filePath || getEnvFilePath();
      const branchName = this.config.branch || getEnvBranch();
      const encodedPath = encodeGitHubPath(filePath);
      const branch = encodeURIComponent(branchName);
      const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${branch}`;
      const res = await fetch(url, { headers: githubHeaders(token) });

      if (res.status === 404) {
        const access = await this.verifyRepositoryAccess();
        if (!access.ok) {
          throw new Error(access.error || `GitHub 404 while accessing ${repo} (${branchName})`);
        }
        console.info(`[GitHubSync] File "${filePath}" does not exist yet in "${repo}@${branchName}" (404).`);
        this.config.lastFileSha = undefined;
        this.config.lastEtag = undefined;
        this.config.lastError = undefined;
        this.saveConfig();
        return { found: false };
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const msg = `GitHub pull failed (${res.status}) for "${repo}/${filePath}@${branchName}": ${errBody.slice(0, 160)}`;
        console.error(`[GitHubSync] ${msg}`);
        this.config.lastError = msg;
        this.saveConfig();
        throw new Error(msg);
      }

      const etag = res.headers.get('etag') || undefined;
      const data = (await res.json()) as {
        sha: string;
        content?: string;
        encoding?: string;
        download_url?: string;
      };

      let rawJson = '';
      if (data.content && data.encoding === 'base64') {
        rawJson = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      } else if (data.download_url) {
        const dl = await fetch(data.download_url, { headers: githubHeaders(token) });
        if (!dl.ok) throw new Error(`GitHub raw download failed (${dl.status})`);
        rawJson = await dl.text();
      } else {
        throw new Error('Unsupported GitHub file response format.');
      }

      const parsed = JSON.parse(rawJson) as Partial<ErpState>;
      if (!parsed || !parsed.settings || !Array.isArray(parsed.accounts)) {
        throw new Error('Remote GitHub JSON is not a valid Rinse ERP state file.');
      }

      const migrated = migrateErpState(parsed);
      this.config.lastFileSha = data.sha;
      this.config.lastEtag = etag;
      this.config.lastSyncedAt = new Date().toISOString();
      this.config.lastSyncDirection = 'pull';
      this.config.lastError = undefined;
      this.saveConfig();

      return { found: true, state: migrated, fileSha: data.sha };
    } finally {
      this.syncing = false;
    }
  }

  public async checkForRemoteUpdate(): Promise<{ updated: boolean; state?: ErpState }> {
    if (!this.isReadyToSync() || !this.config.autoSync || this.hasPendingLocalPush()) {
      return { updated: false };
    }
    const token = this.getEffectiveToken();
    const repo = this.config.repoFullName;
    if (!token || !repo || !repo.includes('/')) {
      return { updated: false };
    }

    try {
      const encodedPath = encodeGitHubPath(this.config.filePath || getEnvFilePath());
      const branch = encodeURIComponent(this.config.branch || getEnvBranch());
      const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${branch}`;
      const headers: Record<string, string> = githubHeaders(token);
      if (this.config.lastEtag) {
        headers['If-None-Match'] = this.config.lastEtag;
      }

      const res = await fetch(url, { headers });
      if (res.status === 304 || res.status === 404) {
        return { updated: false };
      }
      if (!res.ok) {
        console.warn(`[GitHubSync] Poll check failed (${res.status}) on "${repo}"`);
        return { updated: false };
      }

      const etag = res.headers.get('etag') || undefined;
      const data = (await res.json()) as {
        sha?: string;
        content?: string;
        encoding?: string;
        download_url?: string;
      };

      if (!data.sha || data.sha === this.config.lastFileSha) {
        this.config.lastEtag = etag;
        this.saveConfig();
        return { updated: false };
      }

      let rawJson = '';
      if (data.content && data.encoding === 'base64') {
        rawJson = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      } else if (data.download_url) {
        const dl = await fetch(data.download_url, { headers: githubHeaders(token) });
        if (!dl.ok) return { updated: false };
        rawJson = await dl.text();
      } else {
        return { updated: false };
      }

      const parsed = JSON.parse(rawJson) as Partial<ErpState>;
      if (!parsed || !parsed.settings || !Array.isArray(parsed.accounts)) {
        return { updated: false };
      }

      const migrated = migrateErpState(parsed);
      this.config.lastFileSha = data.sha;
      this.config.lastEtag = etag;
      this.config.lastSyncedAt = new Date().toISOString();
      this.config.lastSyncDirection = 'pull';
      this.config.lastError = undefined;
      this.saveConfig();

      return { updated: true, state: migrated };
    } catch (err) {
      console.warn('[GitHubSync] Poll error:', err instanceof Error ? err.message : err);
      return { updated: false };
    }
  }

  private async fetchRemoteFileSha(token: string, repo: string, filePath: string, branch: string): Promise<string | undefined> {
    const encodedPath = encodeGitHubPath(filePath);
    const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
    const res = await fetch(url, { headers: githubHeaders(token) });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      console.warn(`[GitHubSync] fetchRemoteFileSha (${res.status}) for "${repo}/${filePath}@${branch}"`);
      return undefined;
    }
    const data = (await res.json()) as { sha?: string };
    return data.sha;
  }

  public async pushState(state: ErpState, updatedBy?: string): Promise<{ commitSha?: string; syncedAt: string }> {
    if (this.config.repoFullName && !this.config.repoFullName.includes('/')) {
      await this.ensureInitialized();
    }
    const token = this.getEffectiveToken();
    const repo = this.config.repoFullName;
    if (!token || !repo) {
      throw new Error('GitHub repository is not configured.');
    }

    const runPush = async () => {
      this.syncing = true;
      try {
        const filePath = this.config.filePath || getEnvFilePath();
        const branch = this.config.branch || getEnvBranch();
        const encodedPath = encodeGitHubPath(filePath);
        const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;

        let sha = this.config.lastFileSha;
        if (!sha) {
          sha = await this.fetchRemoteFileSha(token, repo, filePath, branch);
        }

        const contentBase64 = Buffer.from(JSON.stringify(state, null, 2), 'utf-8').toString('base64');
        const message = `Rinse cloud sync${updatedBy ? ` by ${updatedBy}` : ''} (rev ${state.syncRevision ?? 1})`;

        const attemptPut = async (targetSha?: string) =>
          fetch(url, {
            method: 'PUT',
            headers: {
              ...githubHeaders(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message,
              content: contentBase64,
              branch,
              ...(targetSha ? { sha: targetSha } : {}),
            }),
          });

        let res = await attemptPut(sha);
        if (res.status === 409 || res.status === 422) {
          const latestSha = await this.fetchRemoteFileSha(token, repo, filePath, branch);
          res = await attemptPut(latestSha);
        }

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 404) {
            const access = await this.verifyRepositoryAccess();
            if (!access.ok) {
              throw new Error(access.error);
            }
          }
          const msg = `GitHub push failed (${res.status}) on "${repo}/${filePath}@${branch}": ${errText.slice(0, 180)}`;
          console.warn(`[GitHubSync] ${msg}`);
          this.config.lastError = msg;
          this.saveConfig();
          throw new Error(msg);
        }

        const result = (await res.json()) as {
          content?: { sha?: string };
          commit?: { sha?: string };
        };
        const syncedAt = new Date().toISOString();
        this.config.lastFileSha = result.content?.sha;
        this.config.lastEtag = undefined;
        this.config.lastCommitSha = result.commit?.sha;
        this.config.lastSyncedAt = syncedAt;
        this.config.lastSyncDirection = 'push';
        this.config.lastError = undefined;
        this.saveConfig();

        return { commitSha: result.commit?.sha, syncedAt };
      } finally {
        this.syncing = false;
      }
    };

    const nextPush = this.pushPromise
      ? this.pushPromise.then(runPush, runPush)
      : runPush();
    this.pushPromise = nextPush.then(
      () => undefined,
      () => undefined
    );
    return await nextPush;
  }

  public scheduleAutoPush(getLatestState: () => ErpState, updatedBy?: string, onComplete?: () => void) {
    if (!this.config.autoSync || !this.isReadyToSync()) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(async () => {
      this.pushTimer = null;
      try {
        await this.pushState(getLatestState(), updatedBy);
      } catch (err) {
        console.warn('[GitHubSync] Auto-push skipped:', err instanceof Error ? err.message : err);
      } finally {
        onComplete?.();
      }
    }, 1500);
  }
}
