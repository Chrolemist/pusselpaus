/* ── Login page – OAuth entry ── */

import { useAuth } from '../../auth';
import { motion } from 'motion/react';
import { Puzzle } from 'lucide-react';

export default function LoginPage() {
  const { signInWithGoogle, signInWithDiscord, enterGuestMode, loading } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4">
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Puzzle className="h-16 w-16 text-brand-light" />
        <h1 className="text-4xl font-extrabold tracking-tight text-brand-light">
          PusselPaus
        </h1>
        <p className="max-w-xs text-center text-sm text-text-muted">
          Logga in för att spara dina framsteg, samla coins och tävla med vänner!
        </p>
      </motion.div>

      <motion.div
        className="flex w-full max-w-sm flex-col gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <motion.button
          onClick={signInWithGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-lg font-semibold text-gray-800 shadow-xl transition hover:shadow-2xl active:scale-95 disabled:opacity-50"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Logga in med Google
        </motion.button>

        <motion.button
          onClick={signInWithDiscord}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-2xl px-8 py-4 text-lg font-semibold text-white shadow-xl transition hover:shadow-2xl active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: '#5865F2' }}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.328-.403.768-.554 1.112a18.27 18.27 0 0 0-5.331 0A12.64 12.64 0 0 0 9.446 3 19.736 19.736 0 0 0 5.01 4.373C2.203 8.523 1.443 12.57 1.823 16.56a19.936 19.936 0 0 0 5.993 3.03 14.32 14.32 0 0 0 1.286-2.106 12.955 12.955 0 0 1-2.023-.97c.17-.123.336-.252.496-.385 3.905 1.838 8.143 1.838 12.002 0 .161.133.326.262.497.385a12.91 12.91 0 0 1-2.026.972 14.06 14.06 0 0 0 1.287 2.104 19.915 19.915 0 0 0 6-3.03c.455-4.627-.776-8.637-3.018-12.19ZM9.954 14.092c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.156 2.418 0 1.334-.955 2.419-2.156 2.419Zm4.092 0c-1.182 0-2.156-1.085-2.156-2.419 0-1.333.955-2.418 2.156-2.418 1.21 0 2.177 1.095 2.157 2.418 0 1.334-.947 2.419-2.157 2.419Z" />
          </svg>
          Logga in med Discord
        </motion.button>
      </motion.div>

      <button
        onClick={enterGuestMode}
        className="rounded-xl bg-surface-card px-6 py-3 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:ring-brand/50"
      >
        Spela som gäst
      </button>

      <p className="text-xs text-text-muted opacity-60">
        Ingen data delas med tredje part.
      </p>
    </div>
  );
}
