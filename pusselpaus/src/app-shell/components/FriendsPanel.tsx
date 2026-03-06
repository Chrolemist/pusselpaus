/* ── FriendsPanel – slide-out friend list ── */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useFriends } from '../../hooks/useFriends';
import { useAuth } from '../../auth';
import { supabase } from '../../lib/supabaseClient';
import type { Profile, UserGameStat } from '../../lib/database.types';

interface FriendsPanelProps {
  onClose: () => void;
}

export default function FriendsPanel({ onClose }: FriendsPanelProps) {
  const { user } = useAuth();
  const { friends, sendRequest, acceptRequest, removeFriend, loading } = useFriends();
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<Profile[]>([]);
  const [selectedStatsUser, setSelectedStatsUser] = useState<Profile | null>(null);
  const [selectedStats, setSelectedStats] = useState<UserGameStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const pending = friends.filter((f) => f.status === 'pending' && !f.isSender);
  const accepted = friends.filter((f) => f.status === 'accepted');
  const sent = friends.filter((f) => f.status === 'pending' && f.isSender);

  const blockedIds = useMemo(() => {
    const ids = new Set<string>([user?.id ?? '']);
    for (const f of friends) ids.add(f.friend.id);
    return ids;
  }, [friends, user?.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchOnline = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_online', true)
        .returns<Profile[]>();

      if (cancelled) return;
      const filtered = (data ?? []).filter((p) => !blockedIds.has(p.id));
      setOnlinePlayers(filtered.slice(0, 12));
    };

    void fetchOnline();
    const interval = window.setInterval(fetchOnline, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user, blockedIds]);

  const viewStats = async (friendProfile: Profile) => {
    setSelectedStatsUser(friendProfile);
    setStatsLoading(true);
    const { data } = await supabase
      .from('user_game_stats')
      .select('*')
      .eq('user_id', friendProfile.id)
      .returns<UserGameStat[]>();
    setSelectedStats((data ?? []).sort((a, b) => a.game_id.localeCompare(b.game_id)));
    setStatsLoading(false);
  };

  const formatGame = (id: string) => {
    if (id === 'sudoku') return 'Sudoku';
    if (id === 'numberpath') return 'Sifferstigen';
    if (id === 'rytmrush') return 'RytmRush';
    return id;
  };

  const handleSend = async () => {
    if (!username.trim()) return;
    const err = await sendRequest(username.trim());
    setMessage(err ?? 'Förfrågan skickad! ✅');
    if (!err) setUsername('');
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <motion.div
      className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[90vw] flex-col bg-surface-card shadow-2xl"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-lg font-bold">👥 Vänner</h3>
        <button onClick={onClose} className="text-text-muted hover:text-white transition">
          ✕
        </button>
      </div>

      {/* Add friend */}
      <div className="flex gap-2 border-b border-white/10 px-4 py-3">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Användarnamn..."
          className="flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-brand/60"
        />
        <button
          onClick={handleSend}
          className="rounded-lg bg-brand/30 px-3 py-2 text-sm font-semibold text-brand-light transition hover:bg-brand/50 active:scale-95"
        >
          Adda
        </button>
      </div>

      {message && (
        <p className="px-4 py-2 text-xs text-accent">{message}</p>
      )}

      {/* Quick add from online players */}
      {onlinePlayers.length > 0 && (
        <div className="border-b border-white/10 px-4 py-3">
          <p className="mb-2 text-xs font-bold uppercase text-text-muted">Online nu</p>
          <div className="space-y-2">
            {onlinePlayers.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span>{p.skin ?? '🙂'}</span>
                  <div>
                    <p className="text-sm font-semibold">{p.username}</p>
                    <p className="text-[11px] text-text-muted">#{p.tag}</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const err = await sendRequest(`${p.username}#${p.tag}`);
                    setMessage(err ?? `Förfrågan skickad till ${p.username} ✅`);
                    setTimeout(() => setMessage(null), 3000);
                  }}
                  className="rounded-md bg-brand/30 px-2 py-1 text-xs font-semibold text-brand-light hover:bg-brand/50"
                >
                  Adda
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lists */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && <p className="text-sm text-text-muted">Laddar…</p>}

        {/* Pending requests */}
        {pending.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">Inkommande</p>
            {pending.map((f) => (
              <div key={f.friendshipId} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{f.friend.skin ?? '🙂'}</span>
                  <div>
                    <p className="text-sm font-semibold">{f.friend.username}</p>
                    <p className="text-xs text-text-muted">Vill bli din vän</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => acceptRequest(f.friendshipId)}
                    className="rounded-lg bg-green-500/20 px-2 py-1 text-xs font-bold text-green-400 transition hover:bg-green-500/40"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => removeFriend(f.friendshipId)}
                    className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-bold text-red-400 transition hover:bg-red-500/40"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Accepted friends */}
        {accepted.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">Vänner</p>
            {accepted.map((f) => (
              <div key={f.friendshipId} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{f.friend.skin ?? '🙂'}</span>
                  <div>
                    <p className="text-sm font-semibold">{f.friend.username}</p>
                    <div className="flex items-center gap-1">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${f.friend.is_online ? 'bg-green-400' : 'bg-gray-500'}`}
                      />
                      <p className="text-xs text-text-muted">
                        {f.friend.is_online ? 'Online' : 'Offline'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/"
                    onClick={onClose}
                    className="rounded-md bg-accent/20 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/40"
                    title="Utmana via spelet"
                  >
                    ⚔️
                  </Link>
                  <button
                    onClick={() => viewStats(f.friend)}
                    className="rounded-md bg-brand/20 px-2 py-1 text-[11px] font-semibold text-brand-light hover:bg-brand/40"
                    title="Visa statistik"
                  >
                    📊
                  </button>
                  <button
                    onClick={() => removeFriend(f.friendshipId)}
                    className="text-xs text-text-muted hover:text-red-400 transition"
                    title="Ta bort vän"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {selectedStatsUser && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">
              Statistik: {selectedStatsUser.username}#{selectedStatsUser.tag}
            </p>
            {statsLoading ? (
              <p className="text-xs text-text-muted">Laddar statistik…</p>
            ) : selectedStats.length === 0 ? (
              <p className="text-xs text-text-muted">Ingen serverstatistik ännu.</p>
            ) : (
              <div className="space-y-2">
                {selectedStats.map((s) => (
                  <div key={s.game_id} className="rounded-lg bg-black/20 px-3 py-2 text-xs">
                    <p className="font-semibold">{formatGame(s.game_id)}</p>
                    <p className="text-text-muted">{s.won} / {s.played} vunna</p>
                    {s.best_time !== null && (
                      <p className="text-text-muted">Bästa tid: {s.best_time}s</p>
                    )}
                    {s.best_score !== null && (
                      <p className="text-text-muted">Bästa score: {s.best_score.toLocaleString('sv-SE')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Sent requests */}
        {sent.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">Skickade</p>
            {sent.map((f) => (
              <div key={f.friendshipId} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{f.friend.skin ?? '🙂'}</span>
                  <p className="text-sm">{f.friend.username}</p>
                </div>
                <span className="text-xs text-text-muted">Väntar…</span>
              </div>
            ))}
          </section>
        )}

        {!loading && friends.length === 0 && (
          <p className="text-center text-sm text-text-muted py-8">
            Inga vänner ännu – adda någon ovan! ☝️
          </p>
        )}
      </div>
    </motion.div>
  );
}
