/* ── TopBar – avatar, name + tag, coins, online count, logout ── */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useOnlineCount } from '../../hooks/useOnlineCount';
import { useFriends } from '../../hooks/useFriends';
import { useMultiplayer } from '../../multiplayer';
import { levelProgress } from '../../core/xp';
import { displaySkin } from '../../core/skin';
import FriendsPanel from './FriendsPanel.tsx';
import MatchInboxPanel from './MatchInboxPanel.tsx';

type NoticeItem = {
  id: number;
  kind: 'friend' | 'multiplayer';
  message: string;
};

export default function TopBar() {
  const { profile, user, signOut, updateProfile } = useAuth();
  const onlineCount = useOnlineCount();
  const { friends, loading: friendsLoading } = useFriends();
  const mp = useMultiplayer();
  const [showFriends, setShowFriends] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenInitialRef = useRef(false);
  const prevFriendCountRef = useRef(0);
  const prevInviteCountRef = useRef(0);

  const incomingFriendCount = friends.filter((f) => f.status === 'pending' && !f.isSender).length;
  const incomingInviteCount = mp.grouped.incoming.length;

  const pushNotice = (kind: NoticeItem['kind'], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }, 5500);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (friendsLoading || mp.loading) return;

    if (!seenInitialRef.current) {
      seenInitialRef.current = true;
      prevFriendCountRef.current = incomingFriendCount;
      prevInviteCountRef.current = incomingInviteCount;

      if (incomingFriendCount > 0) {
        pushNotice('friend', `${incomingFriendCount} ny vänförfrågan`);
      }
      if (incomingInviteCount > 0) {
        pushNotice('multiplayer', `${incomingInviteCount} multiplayer-inbjudan väntar`);
      }
      return;
    }

    if (incomingFriendCount > prevFriendCountRef.current) {
      const delta = incomingFriendCount - prevFriendCountRef.current;
      pushNotice('friend', `${delta} ny vänförfrågan`);
    }

    if (incomingInviteCount > prevInviteCountRef.current) {
      const delta = incomingInviteCount - prevInviteCountRef.current;
      pushNotice('multiplayer', `${delta} ny multiplayer-inbjudan`);
    }

    prevFriendCountRef.current = incomingFriendCount;
    prevInviteCountRef.current = incomingInviteCount;
  }, [friendsLoading, mp.loading, incomingFriendCount, incomingInviteCount]);

  if (!user) return null;

  const displayName =
    profile?.username
    ?? (user.user_metadata?.full_name as string | undefined)
    ?? user.email?.split('@')[0]
    ?? 'Spelare';
  const displayTag = profile?.tag ?? '0000';
  const displaySkinEmoji = displaySkin(profile?.skin);
  const displayCoins = profile?.coins ?? 0;
  const displayLevel = profile?.level ?? 1;
  const xpProgress = levelProgress(profile?.xp ?? 0);

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
            {displaySkinEmoji}
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

        {/* Center: level + coins */}
        <div className="flex items-center gap-3">
          {/* Level badge + XP bar */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-bold text-brand-light leading-none">
              Lv {displayLevel}
            </span>
            <div className="h-1 w-10 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${Math.round(xpProgress * 100)}%` }}
              />
            </div>
          </div>

          {/* Coins */}
          <div className="flex items-center gap-1 rounded-full bg-yellow-500/20 px-3 py-1">
            <span className="text-sm">🪙</span>
            <span className="font-mono text-sm font-bold text-yellow-300">
              {displayCoins.toLocaleString('sv-SE')}
            </span>
          </div>
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

          <button
            onClick={() => { setShowMatches((v) => !v); setShowFriends(false); }}
            className="relative text-sm text-text-muted hover:text-brand-light transition"
            title="Matcher"
          >
            ⚔️
            {incomingInviteCount > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {incomingInviteCount > 9 ? '9+' : incomingInviteCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setShowFriends((v) => !v); setShowMatches(false); }}
            className="relative text-lg hover:scale-110 transition"
            title="Vänner"
          >
            👥
            {incomingFriendCount > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {incomingFriendCount > 9 ? '9+' : incomingFriendCount}
              </span>
            )}
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
      {showMatches && <MatchInboxPanel onClose={() => setShowMatches(false)} />}

      {notices.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-16 z-50 flex flex-col gap-2">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-surface-card/95 px-3 py-2 text-sm shadow-lg backdrop-blur"
            >
              <span>{notice.kind === 'friend' ? '👥' : '⚔️'}</span>
              <span className="text-text-muted">{notice.message}</span>
              {notice.kind === 'friend' ? (
                <button
                  onClick={() => setShowFriends(true)}
                  className="rounded-md bg-brand/30 px-2 py-1 text-xs font-semibold text-brand-light hover:bg-brand/50"
                >
                  Öppna
                </button>
              ) : (
                <button
                  onClick={() => setShowMatches(true)}
                  className="rounded-md bg-accent/20 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/40"
                >
                  Joina
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
