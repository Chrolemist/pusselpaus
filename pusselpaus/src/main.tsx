import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const CHUNK_RELOAD_GUARD = 'pusselpaus:chunk-reload-once';

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
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
