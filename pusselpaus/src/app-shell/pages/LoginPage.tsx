/* ── Login page – OAuth entry ── */

import { useState } from 'react';
import { useAuth } from '../../auth';
import { motion } from 'motion/react';
import { Check, Mail, Puzzle } from 'lucide-react';

export default function LoginPage() {
  const { signInWithGoogle, signInWithDiscord, signInWithEmail, enterGuestMode, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [emailPending, setEmailPending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const emailSuccess = emailMessage?.startsWith('Magic link skickad') === true;

  const handleEmailLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setEmailMessage('Skriv in en e-postadress först.');
      return;
    }

    setEmailPending(true);
    const error = await signInWithEmail(normalizedEmail);
    setEmailPending(false);

    if (error) {
      setEmailMessage(error);
      return;
    }

    setEmailMessage(`Magic link skickad till ${normalizedEmail}.`);
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.16),transparent_28%),linear-gradient(180deg,#08101f_0%,#0f172a_48%,#111827_100%)] px-4 py-10">
      <div className="pointer-events-none absolute -left-16 top-14 h-40 w-40 rounded-full bg-brand/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-10 h-48 w-48 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative flex w-full max-w-md flex-col gap-6 rounded-[32px] border border-white/10 bg-slate-950/60 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-7">
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-brand/30 via-brand-light/18 to-accent/18 ring-1 ring-white/10 shadow-[0_12px_36px_rgba(99,102,241,0.25)]">
          <Puzzle className="h-10 w-10 text-brand-light" />
        </div>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-light/80">Logga in</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-brand-light">
          PusselPaus
          </h1>
          <p className="mt-2 max-w-xs text-center text-sm leading-6 text-text-muted">
            Logga in för att spara dina framsteg, samla coins och tävla med vänner.
          </p>
        </div>
      </motion.div>

      <motion.div
        className="flex w-full flex-col gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        <form
          onSubmit={handleEmailLogin}
          className="rounded-[26px] border border-white/8 bg-white/[0.045] p-4 ring-1 ring-white/8 shadow-xl"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Mail className="h-4 w-4 text-brand-light" />
            Email magic link
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Vi skickar en magic link till din inkorg.
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="namn@email.se"
              disabled={loading || emailPending}
              className="min-w-0 flex-1 rounded-2xl bg-black/20 px-4 py-3 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-text-muted focus:ring-brand/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || emailPending}
              className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {emailPending ? 'Skickar...' : 'Skicka länk'}
            </button>
          </div>

          {emailMessage && (
            <div className={`mt-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-xs ring-1 ${emailSuccess ? 'bg-brand/10 text-brand-light ring-brand/25' : 'bg-red-500/10 text-red-200 ring-red-400/20'}`}>
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-semibold">{emailSuccess ? 'Kolla din inkorg' : 'Kunde inte skicka länken'}</p>
                <p className="mt-0.5 text-text-muted">{emailMessage}</p>
              </div>
            </div>
          )}
        </form>

        <div className="flex items-center gap-3 px-1 pt-1">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            eller fortsätt med
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

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

        <div className="flex flex-col items-center gap-3 pt-1">
          <button
            onClick={enterGuestMode}
            className="w-full rounded-2xl bg-surface-card/80 px-6 py-3 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:ring-brand/50 hover:text-white"
          >
            Spela som gäst
          </button>

          <p className="text-center text-xs text-text-muted/70">
            Ingen data delas med tredje part.
          </p>
        </div>
      </div>
    </div>
  );
}
