/* ── TopBar – mobile-first with hamburger menu ── */

import { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../auth';
import { useOnlineCount } from '../../hooks/useOnlineCount';
import { useFriends } from '../../hooks/useFriends';
import { useMultiplayer } from '../../multiplayer';
import { levelProgress } from '../../core/xp';
import { displaySkin } from '../../core/skin';
import type { MatchConfig } from '../../multiplayer';
import {
  Coins,
  Store,
  Trophy,
  Swords,
  Users,
  LogOut,
  Menu,
  X,
  PenLine,
  BarChart3,
} from 'lucide-react';
const FriendsPanel = lazy(() => import('./FriendsPanel'));
const MatchInboxPanel = lazy(() => import('./MatchInboxPanel'));

type NoticeItem = {
  id: number;
  kind: 'friend' | 'multiplayer';
  message: string;
};

export default function TopBar() {
  const navigate = useNavigate();
  const { profile, user, signOut, updateProfile } = useAuth();
  const onlineCount = useOnlineCount();
  const { friends, loading: friendsLoading } = useFriends();
  const mp = useMultiplayer();
  const [showFriends, setShowFriends] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [inviteActionMessage, setInviteActionMessage] = useState<string | null>(null);
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenInitialRef = useRef(false);
  const prevFriendCountRef = useRef(0);
  const prevInviteCountRef = useRef(0);

  const incomingFriendCount = friends.filter((f) => f.status === 'pending' && !f.isSender).length;
  const incomingInviteCount = mp.grouped.incoming.length;
  const totalBadge = incomingFriendCount + incomingInviteCount;
  const latestIncomingFriend = friends.find((f) => f.status === 'pending' && !f.isSender)?.friend ?? null;
  const latestIncomingInvite = mp.grouped.incoming[0] ?? null;

  const flashInviteActionMessage = useCallback((message: string) => {
    setInviteActionMessage(message);
    window.setTimeout(() => setInviteActionMessage(null), 3500);
  }, []);

  const goToInviteMatch = useCallback((entry: (typeof mp.grouped.incoming)[number]) => {
    const gameId = entry.match.game_id;
    mp.setActiveMatch(gameId, entry.match.id, {
      config: (entry.match.config as MatchConfig | null) ?? undefined,
      configSeed: entry.match.config_seed ?? undefined,
      showOverlay: true,
    });
    setShowMatches(false);
    setMenuOpen(false);
    navigate(mp.gamePath(gameId));
  }, [mp, navigate]);

  const acceptIncomingInvite = useCallback(async (entry: (typeof mp.grouped.incoming)[number]) => {
    setProcessingInviteId(entry.match.id);
    const err = await mp.acceptInvite(entry.match.id);
    setProcessingInviteId(null);
    if (err) {
      flashInviteActionMessage(err);
      return;
    }
    goToInviteMatch(entry);
  }, [flashInviteActionMessage, goToInviteMatch, mp]);

  const declineIncomingInvite = useCallback(async (entry: (typeof mp.grouped.incoming)[number]) => {
    setProcessingInviteId(entry.match.id);
    const err = await mp.declineInvite(entry.match.id);
    setProcessingInviteId(null);
    flashInviteActionMessage(err ?? 'Inbjudan nekad');
  }, [flashInviteActionMessage, mp]);

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

  /* Close menu on navigation */
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /* Close menu when clicking outside */
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

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
      <header className="sticky top-0 z-30 flex items-center justify-between bg-black/70 px-3 py-2 backdrop-blur-md">
        {/* Left: avatar + name */}
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 text-2xl">{displaySkinEmoji}</span>
          <span className="truncate text-sm font-semibold">{displayName}</span>
          <span className="text-text-muted text-xs shrink-0">#{displayTag}</span>
        </Link>

        {/* Right: level + coins + hamburger */}
        <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-1 rounded-full bg-yellow-500/20 px-2.5 py-1">
            <Coins className="h-3.5 w-3.5 text-yellow-400" />
            <span className="font-mono text-xs font-bold text-yellow-300">
              {displayCoins.toLocaleString('sv-SE')}
            </span>
          </div>

          {/* Hamburger button */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="relative rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-white transition"
            aria-label="Meny"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            {/* Notification badge */}
            {!menuOpen && totalBadge > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {totalBadge > 9 ? '9+' : totalBadge}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Hamburger dropdown menu ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            ref={menuRef}
            className="fixed right-0 top-[48px] z-40 w-64 max-w-[85vw] overflow-hidden rounded-bl-2xl border-l border-b border-white/10 bg-surface-card/95 shadow-2xl backdrop-blur-lg"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {/* Profile section */}
            <div className="border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{displaySkinEmoji}</span>
                <div className="min-w-0 flex-1">
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
                      className="w-full rounded-md bg-white/10 px-2 py-0.5 text-sm font-semibold outline-none ring-1 ring-brand/50 focus:ring-brand"
                    />
                  ) : (
                    <button
                      onClick={startEdit}
                      disabled={!profile}
                      className="flex items-center gap-1 text-sm font-semibold hover:text-brand-light transition group"
                      title="Byt namn"
                    >
                      <span className="truncate">{displayName}</span>
                      <span className="text-text-muted text-xs">#{displayTag}</span>
                      {profile && <PenLine className="h-3 w-3 text-text-muted opacity-0 group-hover:opacity-100 transition" />}
                    </button>
                  )}
                </div>
              </div>

              {onlineCount !== null && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-400 shadow-[0_0_6px_theme(colors.green.400)]" />
                  {onlineCount} online
                </div>
              )}

              {!profile && (
                <span className="mt-1 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  Profil synkas...
                </span>
              )}
            </div>

            {/* Navigation links */}
            <nav className="flex flex-col py-1">
              <MenuLink icon={<Store className="h-4 w-4" />} label="Skinshop" onClick={() => { closeMenu(); navigate('/shop'); }} />
              <MenuLink icon={<Trophy className="h-4 w-4" />} label="Vänligan" onClick={() => { closeMenu(); navigate('/friends-leaderboard'); }} />
              <MenuLink icon={<BarChart3 className="h-4 w-4" />} label="Statistik" onClick={() => { closeMenu(); navigate('/stats'); }} />
              <MenuLink
                icon={<Swords className="h-4 w-4" />}
                label="Matcher"
                badge={incomingInviteCount}
                onClick={() => { closeMenu(); setShowMatches(true); }}
              />
              <MenuLink
                icon={<Users className="h-4 w-4" />}
                label="Vänner"
                badge={incomingFriendCount}
                onClick={() => { closeMenu(); setShowFriends(true); }}
              />
            </nav>

            {/* Logout */}
            <div className="border-t border-white/10 px-4 py-3">
              <button
                onClick={() => { closeMenu(); signOut(); }}
                className="flex w-full items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/30 active:scale-[0.97]"
              >
                <LogOut className="h-4 w-4" />
                Logga ut
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop overlay when menu is open */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-[39] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeMenu}
          />
        )}
      </AnimatePresence>

      {incomingInviteCount > 0 && latestIncomingInvite && !showMatches && (
        <AnimatePresence>
          <motion.div
            className="pointer-events-none fixed inset-x-3 top-16 z-50 flex justify-center"
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <motion.div
              className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl border border-emerald-300/25 bg-gradient-to-r from-emerald-500/25 via-cyan-500/15 to-surface-card/95 px-4 py-3 shadow-2xl shadow-emerald-500/10 ring-1 ring-white/10 backdrop-blur-lg"
              animate={{ boxShadow: ['0 0 0 rgba(0,0,0,0)', '0 0 28px rgba(16,185,129,0.22)', '0 0 0 rgba(0,0,0,0)'] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl shadow-inner shadow-black/30">
                <Swords className="h-5 w-5 text-emerald-200" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-200">
                  Multiplayer-inbjudan
                </p>
                <p className="truncate text-sm font-semibold text-white">
                  {(() => {
                    const host = latestIncomingInvite.players.find((player) => player.player.user_id === latestIncomingInvite.match.host_id)?.profile;
                    const hostName = host?.username ?? 'En spelare';
                    return `${hostName} bjöd in dig till ${mp.gameLabel(latestIncomingInvite.match.game_id)}`;
                  })()}
                </p>
                <p className="text-xs text-text-muted">
                  {incomingInviteCount > 1
                    ? `${incomingInviteCount} inbjudningar väntar. Du kan gå direkt till nedräkningen här.`
                    : 'Acceptera direkt och hoppa till matchnedräkningen.'}
                </p>
                {inviteActionMessage && (
                  <p className="mt-1 text-xs font-medium text-amber-200">{inviteActionMessage}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => void declineIncomingInvite(latestIncomingInvite)}
                  disabled={processingInviteId === latestIncomingInvite.match.id}
                  className="rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Neka
                </button>
                <button
                  onClick={() => void acceptIncomingInvite(latestIncomingInvite)}
                  disabled={processingInviteId === latestIncomingInvite.match.id}
                  className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingInviteId === latestIncomingInvite.match.id ? 'Ansluter...' : 'Acceptera'}
                </button>
                {incomingInviteCount > 1 && (
                  <button
                    onClick={() => setShowMatches(true)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20"
                  >
                    Visa alla
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {incomingFriendCount > 0 && !showFriends && (
        <AnimatePresence>
          <motion.div
            className={`pointer-events-none fixed inset-x-3 z-50 flex justify-center ${incomingInviteCount > 0 && !showMatches ? 'top-36' : 'top-16'}`}
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <motion.div
              className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-brand-light/30 bg-gradient-to-r from-brand/30 via-fuchsia-500/20 to-brand/10 px-4 py-3 shadow-2xl shadow-brand/20 ring-1 ring-white/10 backdrop-blur-lg"
              animate={{ boxShadow: ['0 0 0 rgba(0,0,0,0)', '0 0 24px rgba(96,165,250,0.28)', '0 0 0 rgba(0,0,0,0)'] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl shadow-inner shadow-black/30">
                {latestIncomingFriend ? displaySkin(latestIncomingFriend.skin) : <Users className="h-5 w-5 text-brand-light" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-brand-light">
                  Ny vänförfrågan
                </p>
                <p className="truncate text-sm font-semibold text-white">
                  {incomingFriendCount === 1 && latestIncomingFriend
                    ? `${latestIncomingFriend.username} vill adda dig`
                    : `${incomingFriendCount} spelare vill adda dig`}
                </p>
                <p className="text-xs text-text-muted">
                  Öppna vänpanelen för att acceptera eller neka direkt.
                </p>
              </div>

              <button
                onClick={() => setShowFriends(true)}
                className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white shadow-lg shadow-brand/25 transition hover:brightness-110"
              >
                Visa
              </button>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      <Suspense fallback={null}>
        {showFriends && <FriendsPanel onClose={() => setShowFriends(false)} />}
        {showMatches && <MatchInboxPanel onClose={() => setShowMatches(false)} />}
      </Suspense>

      {notices.length > 0 && (
        <div className="pointer-events-none fixed right-4 top-14 z-50 flex flex-col gap-2">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-lg backdrop-blur ${notice.kind === 'friend'
                ? 'border-brand-light/25 bg-gradient-to-r from-brand/30 via-fuchsia-500/15 to-surface-card/95 ring-1 ring-brand-light/15'
                : 'border-white/10 bg-surface-card/95'}`}
            >
              <span className={notice.kind === 'friend' ? 'text-brand-light' : ''}>
                {notice.kind === 'friend' ? <Users className="h-4 w-4" /> : <Swords className="h-4 w-4" />}
              </span>
              <span className={notice.kind === 'friend' ? 'font-semibold text-white' : 'text-text-muted'}>{notice.message}</span>
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
                  Öppna
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Menu item sub-component ── */

function MenuLink({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:bg-white/5 hover:text-white transition"
    >
      {icon}
      <span className="flex-1 text-left font-medium">{label}</span>
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
