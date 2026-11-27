import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  Eye,
  FolderGit2,
  GitBranch,
  HardDriveUpload,
  Hash,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Palette,
  Printer,
  RefreshCw,
  Shield,
  Trash2,
  Undo2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import rinseLogo from '../assets/images/rinse_logo_1795028808300.jpg';
import {
  inviteTeamEmail,
  listWorkspaceInvites,
  revokeTeamInvite,
  type WorkspaceContext,
  type WorkspaceInviteRecord,
} from '../services/firestoreSync';
import type { CloudSyncUiState, PendingSyncOperation } from '../services/offlineSyncQueue';
import {
  AppearanceTheme,
  AppSettings,
  DeliveryOption,
  ErpState,
  GitHubSyncStatus,
  IdDateToken,
  IdFormatKey,
  IdFormatRule,
  IdSeparator,
  Invoice,
  LogoSizePreset,
  NavSection,
  OnlinePresenceUser,
  RoleActionPermissions,
  UserAccount,
  UserRole,
} from '../types/erp';
import { exportInvoiceToA4Pdf } from '../utils/pdfExport';
import { DEFAULT_ID_FORMATS, formatSmartId } from '../utils/smartId';
import { getLogoMaxHeightPx, THEME_OPTIONS } from '../utils/theme';
import { A4InvoiceDocument } from './A4InvoiceDocument';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';

interface SettingsViewProps {
  state: ErpState;
  currentUserRole: UserRole;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onRemoveLogo: () => void;
  onUpdateIdFormat: (key: IdFormatKey, patch: Partial<IdFormatRule>) => void;
  onUpdateDeliveryOption: (id: string, patch: Partial<DeliveryOption>) => void;
  onTriggerBackup: () => Promise<void>;
  onRestoreState: (restored: ErpState) => Promise<void>;
  onCreateUser: (user: Omit<UserAccount, 'createdAt' | 'active'>) => void;
  onUpdateUser: (id: string, patch: Partial<UserAccount>) => void;
  onToggleRoleSection: (role: Exclude<UserRole, 'Owner'>, section: NavSection) => void;
  onToggleRoleAction: (
    role: Exclude<UserRole, 'Owner'>,
    action: keyof RoleActionPermissions
  ) => void;
  onRequestDelete: (req: DeleteConfirmationRequest) => void;
  onlineUsers?: OnlinePresenceUser[];
  githubStatus?: GitHubSyncStatus | null;
  onRefreshGitHubStatus?: () => Promise<void>;
  onApplyPulledState?: (pulled: ErpState) => void;
  firebaseUser?: User | null;
  workspaceContext?: WorkspaceContext | null;
  firestoreStatus?: 'disconnected' | 'connecting' | 'synced' | 'unauthorized' | 'error';
  firestoreStatusMessage?: string;
  cloudSyncUiState?: CloudSyncUiState;
  pendingSyncQueue?: PendingSyncOperation[];
  syncNextRetryAt?: number | null;
  onGoogleSignIn?: () => Promise<void>;
  onGoogleSignOut?: () => Promise<void>;
  onForceFirestoreSync?: () => Promise<void>;
}

const SECTION_OPTIONS: Array<{ id: Exclude<NavSection, 'blackbox'>; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'analytics', label: 'Analytics & Charts' },
  { id: 'tasks', label: 'Tasks & Calendar' },
  { id: 'orders', label: 'Retail Orders' },
  { id: 'customers', label: 'Customers' },
  { id: 'corporate', label: 'Corporate Accounts' },
  { id: 'catalogue', label: 'Products & Services' },
  { id: 'inventory', label: 'Chemicals & Suppliers' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'opening-balance', label: 'Opening Balance' },
  { id: 'employees', label: 'Staff & Expenses' },
  { id: 'documents', label: 'Invoices & Tokens' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

const ACTION_OPTIONS: Array<{ key: keyof RoleActionPermissions; label: string }> = [
  { key: 'canCreateOrders', label: 'Create Retail Orders' },
  { key: 'canOverridePrices', label: 'Edit Catalogue & Override Prices' },
  { key: 'canCollectPayments', label: 'Collect Retail & Corporate Payments' },
  { key: 'canManageCorporate', label: 'Create Corporate Accounts & Invoices' },
  { key: 'canAdjustInventory', label: 'Record Chemical Stock Movements' },
  { key: 'canPostAccounting', label: 'Post Accounting Journals & Reversals' },
  { key: 'canManagePayrollExpenses', label: 'Process Payroll & Operating Expenses' },
  { key: 'canManageTasks', label: 'Create, Complete & Delete Tasks' },
  { key: 'canExportReports', label: 'Export Reports (CSV)' },
  { key: 'canManageBackups', label: 'Create & Restore Backups' },
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface LogoDiagnostics {
  width: number;
  height: number;
  isSvg: boolean;
  hasTransparency: boolean;
  lowResolution: boolean;
}

function inspectLogoDataUrl(dataUrl: string, mimeType: string): Promise<LogoDiagnostics> {
  const isSvg = mimeType === 'image/svg+xml' || dataUrl.startsWith('data:image/svg+xml');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 600;
      const height = img.naturalHeight || 200;
      if (isSvg) {
        resolve({ width, height, isSvg: true, hasTransparency: true, lowResolution: false });
        return;
      }
      const sampleW = Math.min(width, 256);
      const sampleH = Math.min(height, 256);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, sampleW);
      canvas.height = Math.max(1, sampleH);
      const ctx = canvas.getContext('2d');
      let hasTransparency = false;
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] < 250) {
            hasTransparency = true;
            break;
          }
        }
      }
      resolve({
        width,
        height,
        isSvg: false,
        hasTransparency,
        lowResolution: width < 300,
      });
    };
    img.onerror = () => {
      resolve({
        width: 0,
        height: 0,
        isSvg,
        hasTransparency: true,
        lowResolution: false,
      });
    };
    img.src = dataUrl;
  });
}

export function SettingsView({
  state,
  currentUserRole,
  onUpdateSettings,
  onRemoveLogo,
  onUpdateIdFormat,
  onUpdateDeliveryOption,
  onTriggerBackup,
  onRestoreState,
  onCreateUser,
  onUpdateUser,
  onToggleRoleSection,
  onToggleRoleAction,
  onRequestDelete,
  onlineUsers = [],
  githubStatus,
  onRefreshGitHubStatus,
  onApplyPulledState,
  firebaseUser = null,
  workspaceContext = null,
  firestoreStatus = 'disconnected',
  firestoreStatusMessage = '',
  cloudSyncUiState = 'offline_local',
  pendingSyncQueue = [],
  syncNextRetryAt = null,
  onGoogleSignIn,
  onGoogleSignOut,
  onForceFirestoreSync,
}: SettingsViewProps) {
  const isOwner = currentUserRole === 'Owner';
  const [companyName, setCompanyName] = useState(state.settings.companyName);
  const [companyAddress, setCompanyAddress] = useState(state.settings.companyAddress);
  const [companyPhone, setCompanyPhone] = useState(state.settings.companyPhone);
  const [currencyCode, setCurrencyCode] = useState(state.settings.currencyCode);
  const [currencySymbol, setCurrencySymbol] = useState(state.settings.currencySymbol);
  const [invoiceTerms, setInvoiceTerms] = useState(state.settings.invoiceTerms);
  const [serverBackups, setServerBackups] = useState<
    Array<{ name: string; sizeBytes: number; createdAt: string }>
  >([]);
  const [statusMessage, setStatusMessage] = useState('');

  // GitHub Cloud Sync UI State
  const [ghRepos, setGhRepos] = useState<
    Array<{ fullName: string; name: string; private: boolean; defaultBranch: string; url: string }>
  >([]);
  const [ghRepoInput, setGhRepoInput] = useState(githubStatus?.repoFullName || '');
  const [ghBranchInput, setGhBranchInput] = useState(githubStatus?.branch || 'main');
  const [ghPathInput, setGhPathInput] = useState(githubStatus?.filePath || 'data/laundry-erp.json');
  const [ghNewRepoName, setGhNewRepoName] = useState('rinse-cloud-data');
  const [ghBusy, setGhBusy] = useState(false);
  const [ghError, setGhError] = useState('');

  useEffect(() => {
    if (githubStatus) {
      if (githubStatus.repoFullName) setGhRepoInput(githubStatus.repoFullName);
      if (githubStatus.branch) setGhBranchInput(githubStatus.branch);
      if (githubStatus.filePath) setGhPathInput(githubStatus.filePath);
    }
  }, [githubStatus]);

  const loadGitHubRepos = async () => {
    try {
      const res = await fetch('/api/github/repos');
      if (res.ok) {
        const data = await res.json();
        setGhRepos(data.repos || []);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    if (githubStatus?.connected) {
      loadGitHubRepos();
    }
  }, [githubStatus?.connected]);

  const [teamInvites, setTeamInvites] = useState<WorkspaceInviteRecord[]>([]);
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [inviteRoleInput, setInviteRoleInput] = useState('Staff');
  const [fsBusy, setFsBusy] = useState(false);

  const loadTeamInvites = async () => {
    if (!firebaseUser || !workspaceContext?.isAdmin) {
      setTeamInvites([]);
      return;
    }
    try {
      const list = await listWorkspaceInvites(firebaseUser, workspaceContext.isBootstrappedAdmin);
      setTeamInvites(list);
    } catch {
      // ignore if not admin
    }
  };

  useEffect(() => {
    void loadTeamInvites();
  }, [firebaseUser?.uid, workspaceContext?.isAdmin]);

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'github') {
        onRefreshGitHubStatus?.();
        loadGitHubRepos();
        setStatusMessage(`Connected to GitHub as @${event.data?.user?.login || 'user'}.`);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onRefreshGitHubStatus]);

  const handleConnectGitHub = async () => {
    setGhError('');
    setGhBusy(true);
    try {
      const res = await fetch('/api/github/auth/url');
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start GitHub sign-in.');
      }
      const popup = window.open(data.url, 'github_oauth_popup', 'width=620,height=720');
      if (!popup) {
        setGhError('Popup blocked by browser. Please allow popups for this site and click again.');
      }
    } catch (err) {
      setGhError(err instanceof Error ? err.message : 'GitHub connection error.');
    } finally {
      setGhBusy(false);
    }
  };

  const handleCreatePrivateGitHubRepo = async () => {
    setGhError('');
    setGhBusy(true);
    try {
      const res = await fetch('/api/github/repos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ghNewRepoName || 'rinse-cloud-data' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create repository');
      await loadGitHubRepos();
      await onRefreshGitHubStatus?.();
      setStatusMessage(`Created private GitHub repository ${data.repo?.fullName} and enabled auto-sync.`);
    } catch (err) {
      setGhError(err instanceof Error ? err.message : 'Could not create GitHub repo.');
    } finally {
      setGhBusy(false);
    }
  };

  const handleSaveGitHubConfig = async (autoSyncOverride?: boolean) => {
    setGhError('');
    setGhBusy(true);
    try {
      const res = await fetch('/api/github/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoFullName: ghRepoInput,
          branch: ghBranchInput,
          filePath: ghPathInput,
          autoSync: autoSyncOverride ?? githubStatus?.autoSync ?? true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save GitHub config');
      await onRefreshGitHubStatus?.();
      setStatusMessage('GitHub repository sync settings saved.');
    } catch (err) {
      setGhError(err instanceof Error ? err.message : 'Failed to update settings.');
    } finally {
      setGhBusy(false);
    }
  };

  const handlePushToGitHub = async () => {
    setGhError('');
    setGhBusy(true);
    try {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedBy: currentUserRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to push to GitHub');
      await onRefreshGitHubStatus?.();
      setStatusMessage('Shared ERP data pushed to GitHub repository.');
    } catch (err) {
      setGhError(err instanceof Error ? err.message : 'GitHub push failed.');
    } finally {
      setGhBusy(false);
    }
  };

  const handlePullFromGitHub = async () => {
    setGhError('');
    setGhBusy(true);
    try {
      const res = await fetch('/api/github/pull', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pull from GitHub');
      if (data.state && onApplyPulledState) {
        onApplyPulledState(data.state);
      }
      await onRefreshGitHubStatus?.();
      setStatusMessage('Pulled latest shared data from GitHub and synced to all connected users.');
    } catch (err) {
      setGhError(err instanceof Error ? err.message : 'GitHub pull failed.');
    } finally {
      setGhBusy(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    setGhError('');
    setGhBusy(true);
    try {
      await fetch('/api/github/disconnect', { method: 'POST' });
      setGhRepos([]);
      await onRefreshGitHubStatus?.();
      setStatusMessage('Disconnected GitHub account sync.');
    } finally {
      setGhBusy(false);
    }
  };

  // Company Branding Upload State
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoDiag, setLogoDiag] = useState<LogoDiagnostics | null>(null);
  const [samplePreviewOpen, setSamplePreviewOpen] = useState(false);

  // Owner Role Permissions Editor
  const [managedRole, setManagedRole] = useState<Exclude<UserRole, 'Owner'>>('Counter Staff');

  // New User Form (Owner only)
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Counter Staff');
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (state.settings.companyLogoDataUrl) {
      inspectLogoDataUrl(
        state.settings.companyLogoDataUrl,
        state.settings.companyLogoMimeType || ''
      ).then(setLogoDiag);
    } else {
      setLogoDiag(null);
    }
  }, [state.settings.companyLogoDataUrl, state.settings.companyLogoMimeType]);

  const loadServerBackups = async () => {
    try {
      const res = await fetch('/api/backups');
      if (res.ok) {
        const data = await res.json();
        setServerBackups(data.backups || []);
      }
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    loadServerBackups();
  }, [state.settings.lastBackupAt]);

  const handleLogoFile = async (file: File) => {
    setLogoError('');
    const lowerName = file.name.toLowerCase();
    const isAllowed =
      file.type === 'image/svg+xml' ||
      file.type === 'image/png' ||
      file.type === 'image/webp' ||
      lowerName.endsWith('.svg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp');

    if (!isAllowed) {
      setLogoError(
        'Unsupported file type. Please upload an SVG, transparent PNG, or transparent WebP file (JPG files are not accepted).'
      );
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Maximum allowed size is 2 MB.`
      );
      return;
    }

    const mime =
      file.type ||
      (lowerName.endsWith('.svg')
        ? 'image/svg+xml'
        : lowerName.endsWith('.webp')
        ? 'image/webp'
        : 'image/png');

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) {
        setLogoError('Could not read image file.');
        return;
      }
      const diag = await inspectLogoDataUrl(dataUrl, mime);
      setLogoDiag(diag);
      onUpdateSettings({
        companyLogoDataUrl: dataUrl,
        companyLogoMimeType: mime,
      });
      setStatusMessage('Company logo saved for offline preview, print, and PDF export.');
    };
    reader.onerror = () => {
      setLogoError('Failed to read selected logo file.');
    };
    reader.readAsDataURL(file);
  };

  const handleUseDefaultRinseLogo = () => {
    setLogoError('');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 512;
      canvas.height = img.naturalHeight || 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setLogoError('Could not process default Rinse logo.');
        return;
      }
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const diag = await inspectLogoDataUrl(dataUrl, 'image/png');
      setLogoDiag(diag);
      onUpdateSettings({
        companyLogoDataUrl: dataUrl,
        companyLogoMimeType: 'image/png',
      });
      setStatusMessage('Rinse brand logo applied for offline A4 invoices, print, and PDF export.');
    };
    img.onerror = () => {
      setLogoError('Could not load default Rinse logo asset.');
    };
    img.src = rinseLogo;
  };

  const handleDownloadJsonBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rinse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ErpState;
      if (!parsed.settings || !Array.isArray(parsed.accounts)) {
        setStatusMessage('Invalid backup file format.');
        return;
      }
      await onRestoreState(parsed);
      setStatusMessage('Backup verified and restored successfully.');
    } catch {
      setStatusMessage('Failed to parse backup JSON.');
    }
  };

  const canBackup = isOwner || state.rolePermissions[currentUserRole]?.actions.canManageBackups;
  const managedPerms = state.rolePermissions[managedRole];
  const logoSize = state.settings.companyLogoSize || 'Medium';
  const showBrandName = state.settings.showBrandNameWithLogo ?? true;
  const activeTheme: AppearanceTheme = state.settings.appearanceTheme || 'colorful';

  const sampleInvoice: Invoice = state.invoices[0] || {
    id: 'INV-SAMPLE-0001',
    orderId: 'ORD-SAMPLE-0001',
    customerId: 'CUS-0001',
    customerName: 'Hotel Royal Sample Account',
    customerPhone: '+880 1711-000111',
    customerAddress: 'Road 11, Banani, Dhaka',
    isCorporate: false,
    issuedAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    lines: [
      {
        productName: 'Executive Dress Shirt',
        serviceName: 'Wash + Steam Press',
        quantity: 6,
        unitPrice: 120,
        discount: 0,
        total: 720,
      },
      {
        productName: 'King Bedsheet (Cotton)',
        serviceName: 'Sanitized Wash',
        quantity: 4,
        unitPrice: 240,
        discount: 0,
        total: 960,
      },
    ],
    subtotal: 1680,
    discountTotal: 40,
    extraCharges: 0,
    grandTotal: 1640,
    paidAmount: 1000,
    dueAmount: 640,
    paymentTerms: 'Due on delivery',
    termsAndConditions: state.settings.invoiceTerms,
    reprintCount: 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Settings, Branding, Appearance &amp; Access Control
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Company logo &amp; branding, UI appearance themes, Smart ID formats, staff accounts, and backups
        </p>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {statusMessage}
        </div>
      )}

      {/* Company Branding Section (inside Company Details) */}
      <div className="liquid-glass rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#0071E3]" />
              Company Branding (Invoice Logo)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload your vector SVG or transparent PNG/WebP logo for offline A4 invoices, printing, and PDF exports
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSamplePreviewOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl btn-primary"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview A4 Invoice
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Upload Dropzone, Checkerboard/White Previews, Controls */}
          <div className="lg:col-span-7 space-y-4">
            <input
              ref={logoInputRef}
              type="file"
              accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoFile(file);
                e.target.value = '';
              }}
              className="hidden"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleLogoFile(file);
              }}
              onClick={() => logoInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-[#0071E3] bg-blue-50/70'
                  : 'border-slate-300 bg-white/75 hover:border-[#0071E3] hover:bg-white'
              }`}
            >
              <Upload className="w-6 h-6 text-[#0071E3] mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                Drag and drop your logo here, or click to browse
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Accepted: SVG (preferred), transparent PNG, transparent WebP · Max size 2 MB
              </p>
            </div>

            {logoError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{logoError}</span>
              </div>
            )}

            {logoDiag && !logoDiag.isSvg && !logoDiag.hasTransparency && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs font-medium text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  This logo has a solid background and may look like a box on the invoice. A transparent logo is recommended.
                </span>
              </div>
            )}

            {logoDiag && !logoDiag.isSvg && logoDiag.lowResolution && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs font-medium text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Low-resolution logo detected ({logoDiag.width}×{logoDiag.height}px). Images narrower than 300 px may look blurry when printed.
                </span>
              </div>
            )}

            {/* Live Previews: White + Light-Grey Checkerboard */}
            {state.settings.companyLogoDataUrl ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <span className="block text-[11px] font-medium text-slate-500">
                      On White Invoice Paper
                    </span>
                    <div className="h-24 flex items-center justify-center rounded-lg border border-slate-100 bg-white p-2">
                      <img
                        src={state.settings.companyLogoDataUrl}
                        alt="Logo on white background"
                        style={{ maxHeight: `${getLogoMaxHeightPx(logoSize)}px` }}
                        className="object-contain max-w-full"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <span className="block text-[11px] font-medium text-slate-500">
                      Transparency Check (Checkerboard)
                    </span>
                    <div className="h-24 flex items-center justify-center rounded-lg border border-slate-200 checkerboard-bg p-2">
                      <img
                        src={state.settings.companyLogoDataUrl}
                        alt="Logo transparency check"
                        style={{ maxHeight: `${getLogoMaxHeightPx(logoSize)}px` }}
                        className="object-contain max-w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl btn-secondary"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Replace logo
                  </button>
                  <button
                    type="button"
                    onClick={handleUseDefaultRinseLogo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl btn-secondary"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Use Rinse App Logo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRequestDelete({
                        itemType: 'Company Logo',
                        itemNameOrId: state.settings.companyName,
                        bodyText:
                          'The uploaded company logo will be removed from future A4 invoices and previews. Old invoices with saved snapshots are unchanged.',
                        confirmLabel: 'Remove Logo',
                        onConfirmDelete: onRemoveLogo,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove logo
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-white/75 border border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
                <span>
                  No invoice logo selected yet. Invoices display your business name cleanly, or apply the built-in Rinse logo.
                </span>
                <button
                  type="button"
                  onClick={handleUseDefaultRinseLogo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl btn-secondary shrink-0"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-[#0071E3]" />
                  Use Rinse App Logo
                </button>
              </div>
            )}

            {/* Logo Size & Brand Name Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/70">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Logo Size on Invoice
                </label>
                <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                  {(['Small', 'Medium', 'Large'] as LogoSizePreset[]).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onUpdateSettings({ companyLogoSize: sz })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        logoSize === sz
                          ? 'bg-white text-[#0071E3] shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBrandName}
                    onChange={(e) => onUpdateSettings({ showBrandNameWithLogo: e.target.checked })}
                    className="rounded border-slate-300 text-[#0071E3]"
                  />
                  Show brand name next to logo
                </label>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Always-Visible Logo Preparation Instructions */}
          <div className="lg:col-span-5 rounded-2xl bg-blue-50/70 border border-blue-200 p-5 space-y-3 text-xs text-slate-700">
            <h3 className="text-sm font-semibold text-slate-900">How to prepare your logo</h3>
            <ul className="space-y-2 leading-relaxed list-disc pl-4">
              <li>
                <strong>Best choice:</strong> an SVG file. It stays sharp at any size.
              </li>
              <li>
                <strong>Second best:</strong> a PNG with a transparent background, at least 600 px wide.
              </li>
              <li>Avoid JPG files or logos with a white box around them.</li>
              <li>Keep the logo wider than it is tall. Very tall logos will be scaled down.</li>
              <li>
                The logo appears in the top-left corner of every invoice, before your business name.
              </li>
              <li>
                After uploading, press <strong>&apos;Preview A4 Invoice&apos;</strong> to check how it looks.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Appearance & Color Theme Selector */}
      <div className="liquid-glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#0071E3]" />
              Appearance Theme
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Applies instantly across sidebar, dashboard KPIs, order badges, and tables (invoices remain clean white for print)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {THEME_OPTIONS.map((t) => {
            const selected = activeTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onUpdateSettings({ appearanceTheme: t.id });
                  setStatusMessage(`Appearance theme switched to "${t.label}".`);
                }}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  selected
                    ? 'bg-white border-[#0071E3] ring-2 ring-[#0071E3]/20 shadow-sm'
                    : 'bg-white/75 border-slate-200 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{t.label}</span>
                  <div className="flex items-center gap-1">
                    {t.swatches.map((hex) => (
                      <span
                        key={hex}
                        className="w-3 h-3 rounded-sm inline-block border border-black/10"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{t.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Owner-Only: Role Permissions & Staff Accounts Management */}
      {isOwner && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Role Permissions Matrix */}
          <div className="lg:col-span-7 liquid-glass rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/70">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#0071E3]" />
                  Role Permissions Manager (What Each Role Can See &amp; Do)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Owner retains full access. Black Box is permanently hidden from all other roles.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                {(['Manager', 'Counter Staff', 'Floor Operator'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setManagedRole(r)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      managedRole === r
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Visible Sections */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-600">
                  Pages {managedRole} Can See
                </h3>
                <div className="space-y-1.5">
                  {SECTION_OPTIONS.map((sec) => {
                    const checked = managedPerms.visibleSections.includes(sec.id);
                    return (
                      <label
                        key={sec.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white/75 border border-slate-200/70 cursor-pointer hover:bg-white text-xs"
                      >
                        <span className="font-medium text-slate-800">{sec.label}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleRoleSection(managedRole, sec.id)}
                          className="rounded border-slate-300 text-[#0071E3]"
                        />
                      </label>
                    );
                  })}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100/80 border border-slate-200/70 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Lock className="w-3.5 h-3.5" />
                      Black Box Audit Trail
                    </span>
                    <span className="text-[11px] font-semibold">Owner Exclusive</span>
                  </div>
                </div>
              </div>

              {/* Allowed Capabilities */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-600">
                  Actions {managedRole} Can Do
                </h3>
                <div className="space-y-1.5">
                  {ACTION_OPTIONS.map((act) => {
                    const checked = managedPerms.actions[act.key];
                    return (
                      <label
                        key={act.key}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white/75 border border-slate-200/70 cursor-pointer hover:bg-white text-xs"
                      >
                        <span className="font-medium text-slate-800 pr-2">{act.label}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleRoleAction(managedRole, act.key)}
                          className="rounded border-slate-300 text-[#0071E3]"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Login Accounts Manager */}
          <div className="lg:col-span-5 space-y-6">
            <div className="liquid-glass rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Staff Login Credentials (ID, Password &amp; Role)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each User ID signs into its assigned role only
                </p>
              </div>

              <div className="divide-y divide-slate-200/60">
                {state.users.map((u) => (
                  <div key={u.id} className="py-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {u.displayName}{' '}
                          <span className="font-mono text-slate-500">({u.id})</span>
                        </p>
                        <p className="text-[11px] text-[#0071E3] font-medium">{u.role}</p>
                      </div>
                      {u.id !== 'Ankonbabu' && u.id !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => onUpdateUser(u.id, { active: !u.active })}
                          className={`px-2.5 py-1 rounded-lg font-medium ${
                            u.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {u.active ? 'Active' : 'Disabled'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={passwordDrafts[u.id] ?? ''}
                        onChange={(e) =>
                          setPasswordDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        placeholder={`Current pass: ${u.password}`}
                        className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextPass = (passwordDrafts[u.id] || '').trim();
                          if (!nextPass) return;
                          onUpdateUser(u.id, { password: nextPass });
                          setPasswordDrafts((prev) => ({ ...prev, [u.id]: '' }));
                          setStatusMessage(`Updated password for User ID "${u.id}".`);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg btn-secondary"
                      >
                        <KeyRound className="w-3 h-3" />
                        Update Pass
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const cleanId = newUserId.trim().toLowerCase();
                  if (!cleanId || !newUserPass.trim()) return;
                  if (state.users.some((u) => u.id.toLowerCase() === cleanId)) {
                    setStatusMessage(`User ID "${cleanId}" already exists.`);
                    return;
                  }
                  onCreateUser({
                    id: cleanId,
                    displayName: newUserName.trim() || cleanId,
                    password: newUserPass.trim(),
                    role: newUserRole,
                  });
                  setNewUserId('');
                  setNewUserName('');
                  setNewUserPass('');
                  setStatusMessage(`Created login "${cleanId}" for role ${newUserRole}.`);
                }}
                className="pt-4 border-t border-slate-200/70 space-y-2.5"
              >
                <p className="text-xs font-semibold text-slate-700">Create New Login Account</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    required
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    placeholder="Login ID (e.g. rahim)"
                    className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                  <input
                    required
                    value={newUserPass}
                    onChange={(e) => setNewUserPass(e.target.value)}
                    placeholder="Password"
                    className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Display Name"
                    className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    <option value="Manager">Manager</option>
                    <option value="Counter Staff">Counter Staff</option>
                    <option value="Floor Operator">Floor Operator</option>
                    <option value="Owner">Owner</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl btn-primary"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add User Account
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Company Details, ID Formats, Delivery Rules & Backups */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onUpdateSettings({
                companyName,
                companyAddress,
                companyPhone,
                currencyCode,
                currencySymbol,
                invoiceTerms,
              });
              setStatusMessage('Company profile and invoice preferences saved.');
            }}
            className="liquid-glass rounded-2xl p-6 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900">Company &amp; Currency Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Business Name</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Phone Number</label>
                <input
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Business Address</label>
                <input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Currency Preset</label>
                <select
                  value={currencyCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setCurrencyCode(code);
                    if (code === 'BDT') setCurrencySymbol('Tk');
                    else if (code === 'USD') setCurrencySymbol('$');
                    else if (code === 'EUR') setCurrencySymbol('€');
                    else if (code === 'GBP') setCurrencySymbol('£');
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  <option value="BDT">Bangladeshi Taka (BDT / Tk)</option>
                  <option value="USD">US Dollar (USD / $)</option>
                  <option value="EUR">Euro (EUR / €)</option>
                  <option value="GBP">British Pound (GBP / £)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Symbol</label>
                <input
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">
                  Default Invoice Terms &amp; Conditions
                </label>
                <textarea
                  rows={2}
                  value={invoiceTerms}
                  onChange={(e) => setInvoiceTerms(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl btn-primary">
                Save Company Settings
              </button>
            </div>
          </form>

          {/* Smart ID Formats Configuration */}
          <div className="liquid-glass rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Hash className="w-4 h-4 text-[#0071E3]" />
                ID Formats (Smart ID System)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure prefix, separator, optional year/month token, zero-padding, and starting numbers for retail and corporate records
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse erp-table">
                <thead>
                  <tr className="border-b border-slate-200/70">
                    <th className="py-2 pr-2">ID Type</th>
                    <th className="py-2 px-1.5">Prefix</th>
                    <th className="py-2 px-1.5">Sep</th>
                    <th className="py-2 px-1.5">Date Token</th>
                    <th className="py-2 px-1.5">Digits</th>
                    <th className="py-2 px-1.5">Next #</th>
                    <th className="py-2 pl-2 text-right">Live Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {(
                    [
                      'customer',
                      'retailOrder',
                      'corporateOrder',
                      'retailInvoice',
                      'corporateInvoice',
                    ] as IdFormatKey[]
                  ).map((k) => {
                    const rule = state.idFormats?.[k] || DEFAULT_ID_FORMATS[k];
                    const preview = formatSmartId(rule, rule.nextNumber);
                    return (
                      <tr key={k}>
                        <td className="py-2.5 pr-2 font-semibold text-slate-800 whitespace-nowrap">
                          {rule.label}
                        </td>
                        <td className="py-2.5 px-1.5">
                          <input
                            type="text"
                            maxLength={14}
                            value={rule.prefix}
                            onChange={(e) =>
                              onUpdateIdFormat(k, {
                                prefix: e.target.value.replace(/[^A-Za-z0-9\-_]/g, '').toUpperCase(),
                              })
                            }
                            className="w-20 px-2 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                          />
                        </td>
                        <td className="py-2.5 px-1.5">
                          <select
                            value={rule.separator}
                            onChange={(e) =>
                              onUpdateIdFormat(k, { separator: e.target.value as IdSeparator })
                            }
                            className="px-2 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                          >
                            <option value="-">-</option>
                            <option value="/">/</option>
                            <option value="">None</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-1.5">
                          <select
                            value={rule.dateToken}
                            onChange={(e) =>
                              onUpdateIdFormat(k, { dateToken: e.target.value as IdDateToken })
                            }
                            className="px-2 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                          >
                            <option value="NONE">None</option>
                            <option value="YYYY">YYYY</option>
                            <option value="YYYY-MM">YYYY-MM</option>
                            <option value="YYMM">YYMM</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-1.5">
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={rule.padding}
                            onChange={(e) =>
                              onUpdateIdFormat(k, {
                                padding: Math.max(1, Math.min(8, Number(e.target.value) || 4)),
                              })
                            }
                            className="w-12 px-2 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                          />
                        </td>
                        <td className="py-2.5 px-1.5">
                          <input
                            type="number"
                            min={1}
                            value={rule.nextNumber}
                            onChange={(e) =>
                              onUpdateIdFormat(k, {
                                nextNumber: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="w-16 px-2 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                          />
                        </td>
                        <td className="py-2.5 pl-2 text-right font-mono font-semibold text-[#0071E3] whitespace-nowrap">
                          {preview}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delivery Options Config */}
          <div className="liquid-glass rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              Configurable Delivery Options (Retail)
            </h2>
            <div className="divide-y divide-slate-200/60 text-xs">
              {state.deliveryOptions.map((opt) => (
                <div key={opt.id} className="py-3 grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-4 font-semibold text-slate-900">{opt.name}</span>
                  <div className="col-span-4 flex items-center gap-1.5">
                    <span className="text-slate-500">Target (h):</span>
                    <input
                      type="number"
                      min={1}
                      value={opt.targetHours}
                      onChange={(e) =>
                        onUpdateDeliveryOption(opt.id, { targetHours: Number(e.target.value) })
                      }
                      className="w-16 px-2 py-1 font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="col-span-4 flex items-center justify-end gap-1.5">
                    <span className="text-slate-500">Multiplier:</span>
                    <input
                      type="number"
                      min={0.5}
                      step={0.1}
                      value={opt.multiplier}
                      onChange={(e) =>
                        onUpdateDeliveryOption(opt.id, { multiplier: Number(e.target.value) })
                      }
                      className="w-16 px-2 py-1 font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Multi-User Cloud Sync, Backups & Shortcuts */}
        <div className="lg:col-span-5 space-y-6">
          {(isOwner || canBackup) && (
            <div className="liquid-glass rounded-2xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-[#0071E3]" />
                    Multi-User Web Sync &amp; GitHub Data Store
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real-time WebSocket sync shares one live database across all online staff devices, backed up automatically to GitHub.
                  </p>
                </div>
                <span className="text-[11px] font-mono font-semibold text-slate-600 bg-white px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                  Rev #{state.syncRevision ?? 1}
                </span>
              </div>

              {/* Firebase Firestore Live Multi-User Sync & Offline Outbox */}
              <div className="p-3.5 rounded-xl bg-white/90 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-[#0071E3]" />
                    Firebase Firestore Live Sync &amp; Local Outbox
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                      cloudSyncUiState === 'synced'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : cloudSyncUiState === 'pending'
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : cloudSyncUiState === 'paused' || cloudSyncUiState === 'unauthorized'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {cloudSyncUiState === 'synced'
                      ? 'Synced'
                      : cloudSyncUiState === 'pending'
                        ? `Saved Locally (${pendingSyncQueue.length} Pending)`
                        : cloudSyncUiState === 'paused'
                          ? 'Sync Paused - Retry Soon'
                          : cloudSyncUiState === 'unauthorized'
                            ? 'Needs Invite'
                            : 'Local Only'}
                  </span>
                </div>

                {firebaseUser ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span className="truncate font-mono">{firebaseUser.email}</span>
                      {onGoogleSignOut && (
                        <button
                          type="button"
                          onClick={() => void onGoogleSignOut()}
                          className="text-red-600 hover:underline shrink-0 font-medium"
                        >
                          Sign Out
                        </button>
                      )}
                    </div>
                    {firestoreStatusMessage && (
                      <p className="text-[11px] text-slate-600">{firestoreStatusMessage}</p>
                    )}
                    {cloudSyncUiState === 'paused' && syncNextRetryAt && (
                      <p className="text-[11px] text-amber-700 font-mono">
                        Next automatic retry at {new Date(syncNextRetryAt).toLocaleTimeString()}
                      </p>
                    )}
                    {onForceFirestoreSync && firestoreStatus !== 'unauthorized' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={fsBusy}
                          onClick={async () => {
                            setFsBusy(true);
                            try {
                              await onForceFirestoreSync();
                            } finally {
                              setFsBusy(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg btn-secondary disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${fsBusy ? 'animate-spin' : ''}`} />
                          Sync Now{pendingSyncQueue.length > 0 ? ` (${pendingSyncQueue.length})` : ''}
                        </button>
                      </div>
                    )}

                    {pendingSyncQueue.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-700">
                            Pending Browser Outbox ({pendingSyncQueue.length})
                          </span>
                          <span className="text-slate-500">Saved safely in browser</span>
                        </div>
                        <div className="max-h-32 overflow-y-auto divide-y divide-slate-200/70">
                          {pendingSyncQueue.slice(-6).reverse().map((op) => (
                            <div
                              key={op.id}
                              className="py-1 flex items-center justify-between gap-2 text-[10px]"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-slate-800 truncate">
                                  {op.actionLabel} ·{' '}
                                  <span className="font-mono text-slate-500">
                                    {op.targetDocIds.join(', ')}
                                  </span>
                                </p>
                                {op.lastError && (
                                  <p className="text-amber-700 truncate">{op.lastError}</p>
                                )}
                              </div>
                              <div className="text-right font-mono text-slate-500 shrink-0">
                                <span>{new Date(op.timestamp).toLocaleTimeString()}</span>
                                {op.retryCount > 0 && (
                                  <span className="ml-1.5 text-amber-700">r{op.retryCount}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isOwner && workspaceContext?.isAdmin && (
                      <div className="pt-2 border-t border-slate-200/70 space-y-2">
                        <p className="text-[11px] font-semibold text-slate-700">
                          Cloud Team Access (Authorized Google Emails)
                        </p>
                        <div className="flex gap-1.5">
                          <input
                            type="email"
                            value={inviteEmailInput}
                            onChange={(e) => setInviteEmailInput(e.target.value)}
                            placeholder="staff@gmail.com"
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                          />
                          <input
                            type="text"
                            value={inviteRoleInput}
                            onChange={(e) => setInviteRoleInput(e.target.value)}
                            placeholder="Role"
                            className="w-20 px-2 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                          />
                          <button
                            type="button"
                            disabled={fsBusy || !inviteEmailInput.trim()}
                            onClick={async () => {
                              if (!firebaseUser) return;
                              setFsBusy(true);
                              try {
                                await inviteTeamEmail({
                                  email: inviteEmailInput,
                                  roleNote: inviteRoleInput,
                                  invitedByUser: firebaseUser,
                                });
                                setInviteEmailInput('');
                                await loadTeamInvites();
                                setStatusMessage('Staff Google email authorized for live Firestore sync.');
                              } finally {
                                setFsBusy(false);
                              }
                            }}
                            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg btn-primary shrink-0 disabled:opacity-50"
                          >
                            Authorize
                          </button>
                        </div>
                        {teamInvites.length > 0 && (
                          <div className="space-y-1">
                            {teamInvites.map((inv) => (
                              <div
                                key={inv.email}
                                className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-lg bg-slate-50 border border-slate-200/80"
                              >
                                <span className="truncate font-mono text-slate-700">
                                  {inv.email} ({inv.roleNote})
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await revokeTeamInvite(inv.email);
                                    await loadTeamInvites();
                                  }}
                                  className="text-red-600 hover:underline shrink-0"
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  onGoogleSignIn && (
                    <button
                      type="button"
                      onClick={() => void onGoogleSignIn()}
                      className="w-full py-2 px-3 text-xs font-semibold rounded-xl btn-primary inline-flex items-center justify-center gap-1.5"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      Connect Google Cloud Sync
                    </button>
                  )
                )}
              </div>

              {/* Team Web Access URL */}
              <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#0071E3]" />
                    Team Multi-User URL ({onlineUsers.length} online)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.origin);
                      setStatusMessage('Copied shared multi-user web app link.');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg btn-secondary"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Link
                  </button>
                </div>
                <p className="text-[11px] font-mono text-slate-600 truncate">
                  {typeof window !== 'undefined' ? window.location.origin : ''}
                </p>
                {onlineUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {onlineUsers.map((u) => (
                      <span
                        key={u.clientId}
                        className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 text-[#0071E3] border border-blue-200/70"
                      >
                        {u.displayName} ({u.role})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* GitHub Cloud Repository Connection */}
              {ghError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {ghError}
                </div>
              )}

              {githubStatus?.connected ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-emerald-900 inline-flex items-center gap-1.5">
                        <FolderGit2 className="w-3.5 h-3.5" />
                        GitHub Connected
                        {githubStatus.githubUser?.login ? ` (@${githubStatus.githubUser.login})` : ' (Server Env)'}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        {githubStatus.lastSyncedAt
                          ? `Last ${githubStatus.lastSyncDirection || 'sync'}: ${new Date(githubStatus.lastSyncedAt).toLocaleString()}`
                          : 'Ready — select or create a private repository below.'}
                      </p>
                    </div>
                    {!githubStatus.envTokenConfigured && (
                      <button
                        type="button"
                        onClick={handleDisconnectGitHub}
                        disabled={ghBusy}
                        className="text-[11px] font-medium text-red-600 hover:underline shrink-0"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>

                  {githubStatus.repoPrivate === false && githubStatus.repoFullName && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                      <strong>Privacy Notice:</strong> <span className="font-mono">{githubStatus.repoFullName}</span> is currently <strong>Public</strong>. Switch it to <strong>Private</strong> in your GitHub repository Settings so business accounts and customer data stay private.
                    </div>
                  )}

                  {ghRepos.length > 0 ? (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Select Shared Data Repository
                      </label>
                      <select
                        value={ghRepoInput}
                        onChange={(e) => {
                          const selected = ghRepos.find((r) => r.fullName === e.target.value);
                          setGhRepoInput(e.target.value);
                          if (selected) setGhBranchInput(selected.defaultBranch || 'main');
                        }}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                      >
                        <option value="">-- Choose Repository --</option>
                        {ghRepoInput && !ghRepos.some((r) => r.fullName === ghRepoInput) && (
                          <option value={ghRepoInput} disabled>
                            {ghRepoInput} (Not accessible / 404)
                          </option>
                        )}
                        {ghRepos.map((r) => (
                          <option key={r.fullName} value={r.fullName}>
                            {r.fullName} {r.private ? '(Private)' : '(Public)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        GitHub Repository (owner/repo)
                      </label>
                      <input
                        type="text"
                        value={ghRepoInput}
                        onChange={(e) => setGhRepoInput(e.target.value)}
                        placeholder="username/rinse-cloud-data"
                        className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                      />
                    </div>
                  )}

                  {(!ghRepoInput || Boolean(githubStatus.lastError)) && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                      <p className="text-[11px] font-semibold text-slate-700">
                        Create a new Private GitHub Data Repository:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={ghNewRepoName}
                          onChange={(e) => setGhNewRepoName(e.target.value)}
                          placeholder="rinse-cloud-data"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={handleCreatePrivateGitHubRepo}
                          disabled={ghBusy}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg btn-primary shrink-0"
                        >
                          Create Private Repo
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1 inline-flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        Branch
                      </label>
                      <input
                        type="text"
                        value={ghBranchInput}
                        onChange={(e) => setGhBranchInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        JSON Path
                      </label>
                      <input
                        type="text"
                        value={ghPathInput}
                        onChange={(e) => setGhPathInput(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={githubStatus.autoSync}
                        onChange={(e) => handleSaveGitHubConfig(e.target.checked)}
                      />
                      Auto-commit changes to GitHub
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSaveGitHubConfig()}
                      disabled={ghBusy}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg btn-secondary"
                    >
                      Save Repo
                    </button>
                  </div>

                  {githubStatus.lastError && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      {githubStatus.lastError}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handlePushToGitHub}
                      disabled={ghBusy || !ghRepoInput}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl btn-primary disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Push to GitHub
                    </button>
                    <button
                      type="button"
                      onClick={handlePullFromGitHub}
                      disabled={ghBusy || !ghRepoInput}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl btn-secondary disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${ghBusy ? 'animate-spin' : ''}`} />
                      Pull Latest
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {githubStatus?.oauthConfigured ? (
                    <button
                      type="button"
                      onClick={handleConnectGitHub}
                      disabled={ghBusy}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl btn-primary"
                    >
                      <FolderGit2 className="w-4 h-4" />
                      Connect GitHub Account (OAuth)
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                      <p className="font-semibold text-slate-800">
                        Enable GitHub Cloud Sync
                      </p>
                      <p>
                        Multi-user real-time WebSocket sync across browsers is already active on this server. To also mirror shared data into a GitHub repository, set either <code className="font-mono text-[11px]">GITHUB_CLIENT_ID</code> + <code className="font-mono text-[11px]">GITHUB_CLIENT_SECRET</code> (for 1-click OAuth) or <code className="font-mono text-[11px]">GITHUB_TOKEN</code> + <code className="font-mono text-[11px]">GITHUB_REPO</code> in your server environment.
                      </p>
                      {githubStatus?.callbackUrl && (
                        <p className="text-[11px] font-mono text-slate-500 break-all">
                          OAuth Callback: {githubStatus.callbackUrl}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {canBackup && (
            <div className="liquid-glass rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Automatic &amp; Manual Backups
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Last backup:{' '}
                    {state.settings.lastBackupAt
                      ? new Date(state.settings.lastBackupAt).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.settings.autoBackupEnabled}
                    onChange={(e) => onUpdateSettings({ autoBackupEnabled: e.target.checked })}
                  />
                  Auto
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    await onTriggerBackup();
                    await loadServerBackups();
                    setStatusMessage('Verified server snapshot backup saved.');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl btn-primary"
                >
                  <HardDriveUpload className="w-3.5 h-3.5" />
                  Backup Now
                </button>
                <button
                  onClick={handleDownloadJsonBackup}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl btn-secondary"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export JSON
                </button>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl btn-secondary cursor-pointer">
                  <Undo2 className="w-3.5 h-3.5" />
                  Restore JSON
                  <input type="file" accept=".json" onChange={handleUploadRestore} className="hidden" />
                </label>
              </div>

              {serverBackups.length > 0 && (
                <div className="pt-3 border-t border-slate-200/70 space-y-1.5 text-xs">
                  <p className="font-semibold text-slate-500">Recent Server Snapshots</p>
                  {serverBackups.slice(0, 4).map((b) => (
                    <div key={b.name} className="flex items-center justify-between text-slate-600">
                      <span className="font-mono truncate max-w-[190px]">{b.name}</span>
                      <button
                        onClick={async () => {
                          const res = await fetch('/api/restore', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: b.name }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            await onRestoreState(data.state);
                            setStatusMessage(`Restored snapshot ${b.name}`);
                          }
                        }}
                        className="text-[#0071E3] hover:underline font-medium"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="liquid-glass rounded-2xl p-6 text-xs space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Keyboard Shortcuts</h2>
            <div className="flex justify-between text-slate-600">
              <span>New Retail Order</span>
              <kbd className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                Alt + N
              </kbd>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Quick Command / Search</span>
              <kbd className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                Ctrl + K
              </kbd>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Undo / Redo Catalogue Edit</span>
              <kbd className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                Ctrl+Z / Ctrl+Shift+Z
              </kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Sample A4 Invoice Preview Modal */}
      {samplePreviewOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
          onClick={() => setSamplePreviewOpen(false)}
        >
          <div
            className="w-full max-w-4xl bg-slate-100 rounded-2xl border border-slate-300 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-800">
                Sample A4 Invoice Preview — Logo &amp; Branding Check
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportInvoiceToA4Pdf(sampleInvoice, state.settings)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg btn-secondary"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg btn-primary"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print A4
                </button>
                <button
                  type="button"
                  onClick={() => setSamplePreviewOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-x-auto max-h-[82vh] overflow-y-auto">
              <A4InvoiceDocument invoice={sampleInvoice} settings={state.settings} isPreviewFrame />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
