import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Cloud, CloudOff, Eye, EyeOff, Lock, Shield, UserCheck } from 'lucide-react';
import rinseLogo from '../assets/images/rinse_logo_1795028808300.jpg';
import { UserAccount, UserRole } from '../types/erp';

interface LoginViewProps {
  companyName: string;
  companyTagline: string;
  users: UserAccount[];
  onLoginSuccess: (user: UserAccount) => void;
  firebaseAuthReady?: boolean;
  firebaseUser?: User | null;
  firestoreStatus?: 'disconnected' | 'connecting' | 'synced' | 'unauthorized' | 'error';
  firestoreStatusMessage?: string;
  onGoogleSignIn?: () => Promise<void>;
  onGoogleSignOut?: () => Promise<void>;
}

const ROLES: UserRole[] = ['Owner', 'Manager', 'Counter Staff', 'Floor Operator'];

export function LoginView({
  companyName,
  companyTagline,
  users,
  onLoginSuccess,
  firebaseAuthReady = false,
  firebaseUser = null,
  firestoreStatus = 'disconnected',
  firestoreStatusMessage = '',
  onGoogleSignIn,
  onGoogleSignOut,
}: LoginViewProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('Owner');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedId = userId.trim().toLowerCase();
    const matched = users.find((u) => u.id.toLowerCase() === trimmedId);

    if (!matched) {
      setError('User ID not found. Please check your credentials.');
      return;
    }
    if (!matched.active) {
      setError('This user account has been deactivated by the Owner.');
      return;
    }
    if (matched.role !== selectedRole) {
      setError(
        `Role mismatch: "${matched.id}" is assigned to ${matched.role}, not ${selectedRole}.`
      );
      return;
    }
    if (matched.password !== password) {
      setError('Incorrect password for this User ID.');
      return;
    }

    onLoginSuccess(matched);
  };

  const handleGoogleConnect = async () => {
    if (!onGoogleSignIn) return;
    setGoogleBusy(true);
    setGoogleError('');
    try {
      await onGoogleSignIn();
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2.5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white p-1.5 shadow-md border border-slate-200/80 overflow-hidden">
            <img
              src={rinseLogo}
              alt="Rinse logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Rinse
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              {companyName && companyName !== 'Rinse' ? `${companyName} · ` : ''}
              {companyTagline}
            </p>
          </div>
        </div>

        <div className="liquid-glass rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200/70">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Workstation Sign In</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter your User ID, password, and assigned role
              </p>
            </div>
            <Shield className="w-5 h-5 text-[#0071E3]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Select Role
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
                {ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setSelectedRole(role);
                      setError('');
                    }}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      selectedRole === role
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="login-user-id" className="block text-xs font-medium text-slate-700 mb-1">
                User ID
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-user-id"
                  type="text"
                  required
                  autoComplete="username"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter your User ID"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl bg-white/90 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl bg-white/90 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 text-sm font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors"
            >
              Sign In as {selectedRole}
            </button>
          </form>

          {onGoogleSignIn && (
            <div className="pt-4 border-t border-slate-200/70 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5">
                  {firebaseUser && firestoreStatus === 'synced' ? (
                    <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <CloudOff className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  Cloud Real-Time Sync (Firestore)
                </span>
                {firebaseUser && onGoogleSignOut && (
                  <button
                    type="button"
                    onClick={() => void onGoogleSignOut()}
                    className="text-[11px] font-medium text-slate-500 hover:text-red-600"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {!firebaseAuthReady ? (
                <p className="text-[11px] text-slate-500">Checking cloud session...</p>
              ) : firebaseUser ? (
                <div
                  className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                    firestoreStatus === 'synced'
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                      : firestoreStatus === 'unauthorized' || firestoreStatus === 'error'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <p className="font-medium truncate">
                    {firebaseUser.email || firebaseUser.displayName}
                  </p>
                  <p className="opacity-90">
                    {firestoreStatusMessage ||
                      (firestoreStatus === 'synced'
                        ? 'Live multi-user Firestore sync active.'
                        : 'Connecting to Firestore...')}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGoogleConnect()}
                  disabled={googleBusy}
                  className="w-full py-2 px-3.5 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Cloud className="w-3.5 h-3.5 text-[#0071E3]" />
                  {googleBusy ? 'Connecting Google Sync...' : 'Connect Cloud Sync with Google'}
                </button>
              )}

              {googleError && (
                <p className="text-[11px] text-red-600 font-medium">{googleError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
