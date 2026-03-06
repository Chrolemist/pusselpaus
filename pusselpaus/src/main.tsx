import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const CHUNK_RELOAD_GUARD = 'pusselpaus:chunk-reload-once';
const BUILD_KEY = 'pusselpaus:client-build';
const BUILD_SYNC_GUARD = 'pusselpaus:build-sync-once';

async function forceClientResync() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  window.location.reload();
}

function handleBuildDrift() {
  const previousBuild = localStorage.getItem(BUILD_KEY);
  const syncGuard = sessionStorage.getItem(BUILD_SYNC_GUARD);

  if (previousBuild && previousBuild !== __APP_BUILD__ && syncGuard !== __APP_BUILD__) {
    sessionStorage.setItem(BUILD_SYNC_GUARD, __APP_BUILD__);
    void forceClientResync();
    return;
  }

  localStorage.setItem(BUILD_KEY, __APP_BUILD__);
}

handleBuildDrift();

function tryRecoverChunkError() {
  const alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_GUARD) === '1';
  if (alreadyTried) return;
  sessionStorage.setItem(CHUNK_RELOAD_GUARD, '1');

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.update();
      }
      window.location.reload();
    });
    return;
  }

  window.location.reload();
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  tryRecoverChunkError();
});

window.addEventListener('error', (event) => {
  const message = String(event.message ?? '');
  if (message.includes('Failed to fetch dynamically imported module')) {
    tryRecoverChunkError();
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
    const source =
      target instanceof HTMLScriptElement
        ? target.src
        : target.href;

    if (source.includes('/assets/')) {
      tryRecoverChunkError();
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
