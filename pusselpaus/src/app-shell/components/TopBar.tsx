/* ── TopBar – avatar, name + tag, coins, online count, logout ── */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useOnlineCount } from '../../hooks/useOnlineCount';
import FriendsPanel from './FriendsPanel.tsx';

export default function TopBar() {
  const { profile, user, signOut, updateProfile } = useAuth();
  const onlineCount = useOnlineCount();
  const [showFriends, setShowFriends] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!user) return null;

  const displayName =
    profile?.username
    ?? (user.user_metadata?.full_name as string | undefined)
    ?? user.email?.split('@')[0]
    ?? 'Spelare';
  const displayTag = profile?.tag ?? '0000';
  const displaySkin = profile?.skin ?? '🙂';
  const displayCoins = profile?.coins ?? 0;

  const startEdit = () => {
    if (!profile) return;
    setDraft(profile.username);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!profile) {
      setEditing(false);
      return;
    }
    const trimmed = draft.trim();
    if (trimmed && trimmed !== profile.username) {
      await updateProfile({ username: trimmed });
    }
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-black/70 px-4 py-2 backdrop-blur-md">
        {/* Left: avatar + name + tag */}
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="shrink-0 text-2xl">
            {displaySkin}
          </Link>

          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              onBlur={saveEdit}
              maxLength={20}
              className="w-28 rounded-md bg-white/10 px-2 py-0.5 text-sm font-semibold outline-none ring-1 ring-brand/50 focus:ring-brand"
            />
          ) : (
            <button
              onClick={startEdit}
              disabled={!profile}
              className="flex items-center gap-1 truncate text-sm font-semibold hover:text-brand-light transition group"
              title={profile ? 'Klicka för att byta namn' : 'Profil synkas...'}
            >
              <span className="truncate">{displayName}</span>
              <span className="text-text-muted text-xs">#{displayTag}</span>
              {profile && (
                <span className="opacity-0 group-hover:opacity-100 text-xs text-text-muted transition">✏️</span>
              )}
            </button>
          )}

          {!profile && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
              Profil synkas...
            </span>
          )}
        </div>

        {/* Center: coins */}
        <div className="flex items-center gap-1 rounded-full bg-yellow-500/20 px-3 py-1">
          <span className="text-sm">🪙</span>
          <span className="font-mono text-sm font-bold text-yellow-300">
            {displayCoins.toLocaleString('sv-SE')}
          </span>
        </div>

        {/* Right: online count + friends + logout */}
        <div className="flex items-center gap-3">
          {onlineCount !== null && (
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_theme(colors.green.400)]" />
              {onlineCount} online
            </div>
          )}

          <Link
            to="/shop"
            className="text-sm text-text-muted hover:text-brand-light transition"
            title="Skinshop"
          >
            🛍️
          </Link>

          <Link
            to="/friends-leaderboard"
            className="text-sm text-text-muted hover:text-brand-light transition"
            title="Vänligan"
          >
            🏆
          </Link>

          <Link
            to="/multiplayer"
            className="text-sm text-text-muted hover:text-brand-light transition"
            title="Multiplayer"
          >
            ⚔️
          </Link>

          <button
            onClick={() => setShowFriends((v) => !v)}
            className="text-lg hover:scale-110 transition"
            title="Vänner"
          >
            👥
          </button>

          <button
            onClick={signOut}
            className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/40 active:scale-95"
          >
            Logga ut
          </button>
        </div>
      </header>

      {showFriends && <FriendsPanel onClose={() => setShowFriends(false)} />}
    </>
  );
}
