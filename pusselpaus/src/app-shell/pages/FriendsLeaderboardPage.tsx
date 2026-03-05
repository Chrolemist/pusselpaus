import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useFriends } from '../../hooks/useFriends';
import { supabase } from '../../lib/supabaseClient';
import type { UserGameStat } from '../../lib/database.types';

interface LeaderboardRow {
  id: string;
  username: string;
  tag: string;
  skin: string;
  isMe: boolean;
  played: number;
  won: number;
  bestScore: number;
  rankScore: number;
}

function pct(won: number, played: number) {
  if (played <= 0) return 0;
  return Math.round((won / played) * 100);
}

export default function FriendsLeaderboardPage() {
  const { user, profile } = useAuth();
  const { friends, loading: friendsLoading } = useFriends();
  const [statsRows, setStatsRows] = useState<UserGameStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === 'accepted').map((f) => f.friend),
    [friends],
  );

  const participants = useMemo(() => {
    const rows: Omit<LeaderboardRow, 'played' | 'won' | 'bestScore' | 'rankScore'>[] = [];

    if (user) {
      rows.push({
        id: user.id,
        username: profile?.username ?? (user.email?.split('@')[0] ?? 'Du'),
        tag: profile?.tag ?? '0000',
        skin: profile?.skin ?? '🙂',
        isMe: true,
      });
    }

    for (const f of acceptedFriends) {
      rows.push({
        id: f.id,
        username: f.username,
        tag: f.tag,
        skin: f.skin,
        isMe: false,
      });
    }

    return Array.from(new Map(rows.map((r) => [r.id, r])).values());
  }, [user, profile, acceptedFriends]);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      const ids = participants.map((p) => p.id);
      if (ids.length === 0) {
        setStatsRows([]);
        setLoadingStats(false);
        return;
      }

      setLoadingStats(true);
      const { data } = await supabase
        .from('user_game_stats')
        .select('*')
        .in('user_id', ids)
        .returns<UserGameStat[]>();

      if (!cancelled) {
        setStatsRows(data ?? []);
        setLoadingStats(false);
      }
    };

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [participants]);

  const leaderboard = useMemo(() => {
    const byUser = new Map<string, { played: number; won: number; bestScore: number }>();

    for (const p of participants) {
      byUser.set(p.id, { played: 0, won: 0, bestScore: 0 });
    }

    for (const row of statsRows) {
      const prev = byUser.get(row.user_id) ?? { played: 0, won: 0, bestScore: 0 };
      byUser.set(row.user_id, {
        played: prev.played + row.played,
        won: prev.won + row.won,
        bestScore: Math.max(prev.bestScore, row.best_score ?? 0),
      });
    }

    const merged: LeaderboardRow[] = participants.map((p) => {
      const s = byUser.get(p.id) ?? { played: 0, won: 0, bestScore: 0 };
      const rankScore = s.won * 1000 + s.bestScore;
      return {
        ...p,
        played: s.played,
        won: s.won,
        bestScore: s.bestScore,
        rankScore,
      };
    });

    return merged.sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      if (b.won !== a.won) return b.won - a.won;
      return b.bestScore - a.bestScore;
    });
  }, [participants, statsRows]);

  const myRank = user ? leaderboard.findIndex((r) => r.id === user.id) + 1 : null;

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-10">
      <Link to="/" className="self-start text-sm text-text-muted hover:text-brand-light">← Tillbaka</Link>

      <h2 className="text-3xl font-bold">🏆 Vänligan</h2>
      <p className="text-sm text-text-muted text-center">
        Ranking baseras på vinster först, sedan bästa score.
      </p>

      {myRank && (
        <div className="rounded-full bg-brand/20 px-4 py-1 text-sm font-semibold text-brand-light">
          Din placering: #{myRank}
        </div>
      )}

      {(friendsLoading || loadingStats) ? (
        <p className="text-sm text-text-muted">Laddar topplista…</p>
      ) : leaderboard.length === 0 ? (
        <p className="text-sm text-text-muted">Lägg till vänner för att börja tävla.</p>
      ) : (
        <div className="w-full max-w-xl space-y-2">
          {leaderboard.map((r, i) => (
            <div
              key={r.id}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-white/10 ${r.isMe ? 'bg-brand/15' : 'bg-surface-card'}`}
            >
              <div className="w-8 text-center text-sm font-bold text-text-muted">#{i + 1}</div>

              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{r.skin}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {r.username}
                    {r.isMe ? ' (du)' : ''}
                  </p>
                  <p className="text-xs text-text-muted">#{r.tag}</p>
                </div>
              </div>

              <div className="text-right text-xs">
                <p className="font-semibold text-success">{r.won}/{r.played}</p>
                <p className="text-text-muted">{pct(r.won, r.played)}% vinst</p>
                <p className="text-accent">Best {r.bestScore.toLocaleString('sv-SE')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
