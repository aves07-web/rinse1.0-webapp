import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

const rootEl = document.getElementById('root');

if (rootEl) {
  const mountNode: HTMLElement = rootEl;
  let bootDone = false;
  let bootObserver: MutationObserver | null = null;

  const cleanupBootGuard = () => {
    bootDone = true;
    window.removeEventListener('error', onBootError);
    bootObserver?.disconnect();
    bootObserver = null;
  };

  function renderBootFallback(reason: unknown) {
    if (bootDone || mountNode.childElementCount > 0) return;
    cleanupBootGuard();
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unexpected startup error';

    const wrapper = document.createElement('div');
    wrapper.className = 'min-h-screen flex items-center justify-center p-6 bg-[#F5F5F7] text-[#1D1D1F]';

    const card = document.createElement('div');
    card.className = 'w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-lg p-6 space-y-4';

    const title = document.createElement('h1');
    title.className = 'text-lg font-bold text-slate-900';
    title.textContent = 'Rinse could not finish loading';

    const desc = document.createElement('p');
    desc.className = 'text-xs text-slate-600 leading-relaxed';
    desc.textContent =
      'A startup error prevented the workspace from rendering. Reloading or clearing the current workstation session usually resolves this immediately.';

    const errBox = document.createElement('div');
    errBox.className =
      'p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-mono text-red-700 break-words';
    errBox.textContent = msg;

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 pt-1';

    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.className =
      'px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0062C8]';
    reloadBtn.textContent = 'Reload Page';
    reloadBtn.onclick = () => window.location.reload();

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className =
      'px-4 py-2 text-xs font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200';
    resetBtn.textContent = 'Reset Session & Reload';
    resetBtn.onclick = () => {
      try {
        window.sessionStorage.clear();
      } catch {
        // ignore blocked storage
      }
      window.location.reload();
    };

    actions.appendChild(reloadBtn);
    actions.appendChild(resetBtn);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(errBox);
    card.appendChild(actions);
    wrapper.appendChild(card);
    mountNode.replaceChildren(wrapper);
  }

  function onBootError(ev: ErrorEvent) {
    renderBootFallback(ev.error || ev.message);
  }

  window.addEventListener('error', onBootError);

  if (typeof MutationObserver !== 'undefined') {
    bootObserver = new MutationObserver(() => {
      if (mountNode.childElementCount > 0) {
        cleanupBootGuard();
      }
    });
    bootObserver.observe(mountNode, { childList: true });
  }

  try {
    createRoot(mountNode).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (err) {
    renderBootFallback(err);
  }
}
