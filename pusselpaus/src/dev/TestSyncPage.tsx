import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import type { MultiplayerMatch, MultiplayerMatchPlayer, Profile } from '../lib/database.types';
import { useMultiplayer } from '../multiplayer/useMultiplayer';

type PlayerWithProfile = {
  player: MultiplayerMatchPlayer;
  profile: Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'level'> | null;
};

type LogItem = {
  id: string;
  at: string;
  text: string;
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return String(value);
  return `${new Date(ms).toLocaleString('sv-SE')} (${ms})`;
}

function deltaFromCreated(readyAt: string | null | undefined, createdAt: string | undefined): string {
  if (!readyAt || !createdAt) return '—';
  const readyMs = new Date(readyAt).getTime();
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(readyMs) || !Number.isFinite(createdMs)) return '—';
  return `${readyMs - createdMs} ms`;
}

export default function TestSyncPage() {
  const { user } = useAuth();
  const mp = useMultiplayer();
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [manualMatchId, setManualMatchId] = useState('');
  const [match, setMatch] = useState<MultiplayerMatch | null>(null);
  const [players, setPlayers] = useState<PlayerWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markReadyError, setMarkReadyError] = useState<string | null>(null);
  const [readyStateText, setReadyStateText] = useState<string>('—');
  const [logs, setLogs] = useState<LogItem[]>([]);

  const addLog = useCallback((text: string) => {
    const now = new Date();
    setLogs((prev) => [
      {
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        at: now.toLocaleTimeString('sv-SE'),
        text,
      },
      ...prev,
    ].slice(0, 30));
  }, []);

  const candidateMatches = useMemo(
    () => mp.matches.filter((entry) => ['waiting', 'starting', 'in_progress'].includes(entry.match.status)),
    [mp.matches],
  );
  const autoSelectedMatchId = candidateMatches[0]?.match.id ?? '';
  const effectiveSelectedMatchId = selectedMatchId || autoSelectedMatchId;
  const effectiveManualMatchId = manualMatchId || autoSelectedMatchId;
  const currentUserId = user?.id ?? null;

  const loadMatchSnapshot = useCallback(async () => {
    if (!effectiveSelectedMatchId) {
      setMatch(null);
      setPlayers([]);
      return;
    }

    setLoading(true);
    setError(null);

    const [{ data: matchRow, error: matchError }, { data: playerRows, error: playerError }] = await Promise.all([
      supabase
        .from('multiplayer_matches')
        .select('*')
        .eq('id', effectiveSelectedMatchId)
        .maybeSingle<MultiplayerMatch>(),
      supabase
        .from('multiplayer_match_players')
        .select('*')
        .eq('match_id', effectiveSelectedMatchId)
        .returns<MultiplayerMatchPlayer[]>(),
    ]);

    if (matchError || playerError) {
      setError(matchError?.message ?? playerError?.message ?? 'Kunde inte läsa testdata');
      setLoading(false);
      return;
    }

    const userIds = Array.from(new Set((playerRows ?? []).map((row) => row.user_id)));
    let profileMap = new Map<string, Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'level'>>();

    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, tag, skin, level')
        .in('id', userIds)
        .returns<Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'level'>[]>();

      if (profileError) {
        setError(profileError.message || 'Kunde inte läsa profiler');
        setLoading(false);
        return;
      }

      profileMap = new Map((profileRows ?? []).map((profile) => [profile.id, profile]));
    }

    setMatch(matchRow ?? null);
    setPlayers((playerRows ?? []).map((player) => ({
      player,
      profile: profileMap.get(player.user_id) ?? null,
    })));
    setLoading(false);
  }, [effectiveSelectedMatchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMatchSnapshot();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMatchSnapshot]);

  useEffect(() => {
    if (!effectiveSelectedMatchId) return;

    const channel = supabase
      .channel(`test-sync-${effectiveSelectedMatchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'multiplayer_match_players',
          filter: `match_id=eq.${effectiveSelectedMatchId}`,
        },
        (payload) => {
          addLog(`players:${payload.eventType} ${JSON.stringify(payload.new ?? payload.old ?? {})}`);
          void loadMatchSnapshot();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'multiplayer_matches',
          filter: `id=eq.${effectiveSelectedMatchId}`,
        },
        (payload) => {
          addLog(`match:${payload.eventType} ${JSON.stringify(payload.new ?? payload.old ?? {})}`);
          void loadMatchSnapshot();
        },
      )
      .subscribe((status) => {
        addLog(`realtime:${status}`);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveSelectedMatchId, addLog, loadMatchSnapshot]);

  const myRow = useMemo(
    () => players.find((entry) => entry.player.user_id === currentUserId) ?? null,
    [players, currentUserId],
  );

  const handleSelectMatch = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
    setManualMatchId(matchId);
    setLogs([]);
    setReadyStateText('—');
    setMarkReadyError(null);
  }, []);

  const handleApplyManualMatch = useCallback(() => {
    const next = effectiveManualMatchId.trim();
    if (!next) return;
    handleSelectMatch(next);
  }, [handleSelectMatch, effectiveManualMatchId]);

  const handleDirectReadyUpdate = useCallback(async () => {
    if (!currentUserId || !effectiveSelectedMatchId) return;
    setMarkReadyError(null);
    const nowIso = new Date().toISOString();
    addLog(`write:update ready_at=${nowIso}`);
    const { error: updateError } = await supabase
      .from('multiplayer_match_players')
      .update({
        ready: true,
        ready_at: nowIso,
      })
      .eq('match_id', effectiveSelectedMatchId)
      .eq('user_id', currentUserId);

    if (updateError) {
      setMarkReadyError(updateError.message || 'Kunde inte uppdatera ready');
      addLog(`write:error ${updateError.message || 'okänd write-error'}`);
      return;
    }

    addLog('write:ok');
    await loadMatchSnapshot();
  }, [currentUserId, effectiveSelectedMatchId, addLog, loadMatchSnapshot]);

  const handleRpcReady = useCallback(async () => {
    if (!effectiveSelectedMatchId) return;
    setMarkReadyError(null);
    addLog('rpc:markReady call');
    const result = await mp.markReady(effectiveSelectedMatchId);
    if (result.error) {
      setMarkReadyError(result.error);
      addLog(`rpc:markReady error ${result.error}`);
    } else {
      addLog(`rpc:markReady ok ${JSON.stringify(result.data ?? {})}`);
    }
    await loadMatchSnapshot();
  }, [effectiveSelectedMatchId, addLog, mp, loadMatchSnapshot]);

  const handleReadReadyState = useCallback(async () => {
    if (!effectiveSelectedMatchId) return;
    addLog('rpc:readyState call');
    const result = await mp.readyState(effectiveSelectedMatchId);
    if (result.error) {
      setReadyStateText(`Fel: ${result.error}`);
      addLog(`rpc:readyState error ${result.error}`);
      return;
    }
    setReadyStateText(JSON.stringify(result.data ?? {}, null, 2));
    addLog(`rpc:readyState ok ${JSON.stringify(result.data ?? {})}`);
  }, [effectiveSelectedMatchId, addLog, mp]);

  return (
    <div className="mx-auto max-w-6xl p-6 text-sm text-white">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Test Sync</h1>
          <p className="text-white/70">
            Minimal sandlåda för att se exakt när `ready` och `ready_at` synkas mellan två klienter.
          </p>
        </div>
        <Link className="rounded border border-white/20 px-3 py-2 text-white/80 hover:bg-white/10" to="/">
          Tillbaka
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <section className="rounded border border-white/20 p-4">
          <h2 className="mb-3 text-lg font-semibold">1. Välj match</h2>
          <div className="mb-4 space-y-2">
            {candidateMatches.length === 0 && (
              <p className="text-white/60">Inga aktiva matcher hittades för den här användaren.</p>
            )}
            {candidateMatches.map((entry) => (
              <button
                key={entry.match.id}
                className={`block w-full rounded border px-3 py-2 text-left ${effectiveSelectedMatchId === entry.match.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/20 hover:bg-white/5'}`}
                onClick={() => handleSelectMatch(entry.match.id)}
                type="button"
              >
                <div>{entry.match.game_id} · {entry.match.status}</div>
                <div className="text-xs text-white/60">{entry.match.id}</div>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-white/20 bg-black/20 px-3 py-2"
              onChange={(event) => setManualMatchId(event.target.value)}
              placeholder="Klistra in match-id manuellt"
              value={effectiveManualMatchId}
            />
            <button
              className="rounded border border-white/20 px-3 py-2 hover:bg-white/10"
              onClick={handleApplyManualMatch}
              type="button"
            >
              Ladda
            </button>
          </div>
        </section>

        <section className="rounded border border-white/20 p-4">
          <h2 className="mb-3 text-lg font-semibold">2. Testa write / read</h2>
          <div className="mb-3 space-y-2 text-white/80">
            <div>Min användare: {currentUserId ?? '—'}</div>
            <div>Vald match: {effectiveSelectedMatchId || '—'}</div>
            <div>Matchstatus: {match?.status ?? '—'}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-white/20 px-3 py-2 hover:bg-white/10 disabled:opacity-50"
              disabled={!effectiveSelectedMatchId || !currentUserId}
              onClick={handleDirectReadyUpdate}
              type="button"
            >
              Sätt min ready_at direkt
            </button>
            <button
              className="rounded border border-white/20 px-3 py-2 hover:bg-white/10 disabled:opacity-50"
              disabled={!effectiveSelectedMatchId}
              onClick={handleRpcReady}
              type="button"
            >
              Kör `mp.markReady()`
            </button>
            <button
              className="rounded border border-white/20 px-3 py-2 hover:bg-white/10 disabled:opacity-50"
              disabled={!effectiveSelectedMatchId}
              onClick={handleReadReadyState}
              type="button"
            >
              Läs `mp.readyState()`
            </button>
            <button
              className="rounded border border-white/20 px-3 py-2 hover:bg-white/10 disabled:opacity-50"
              disabled={!effectiveSelectedMatchId}
              onClick={() => void loadMatchSnapshot()}
              type="button"
            >
              Uppdatera snapshot
            </button>
          </div>
          {markReadyError && <p className="mt-3 text-red-300">{markReadyError}</p>}
          {error && <p className="mt-3 text-red-300">{error}</p>}
        </section>
      </div>

      <div className="mb-6 rounded border border-white/20 p-4">
        <h2 className="mb-3 text-lg font-semibold">3. Server-snapshot</h2>
        <div className="mb-4 grid gap-2 text-white/80 md:grid-cols-2">
          <div>Loading: {loading ? 'ja' : 'nej'}</div>
          <div>Match skapad: {formatTimestamp(match?.created_at)}</div>
          <div>Startad: {formatTimestamp(match?.started_at)}</div>
          <div>Ready-state RPC: <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 text-xs">{readyStateText}</pre></div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/20 text-white/70">
                <th className="px-2 py-2">Spelare</th>
                <th className="px-2 py-2">user_id</th>
                <th className="px-2 py-2">status</th>
                <th className="px-2 py-2">ready</th>
                <th className="px-2 py-2">ready_at</th>
                <th className="px-2 py-2">Δ från created_at</th>
                <th className="px-2 py-2">clickedAccept?</th>
              </tr>
            </thead>
            <tbody>
              {players.map(({ player, profile }) => {
                const createdMs = match?.created_at ? new Date(match.created_at).getTime() : 0;
                const readyMs = player.ready_at ? new Date(player.ready_at).getTime() : 0;
                const clickedAccept = !!match?.created_at && readyMs > createdMs + 1000;
                return (
                  <tr key={player.id} className={`border-b border-white/10 ${player.user_id === currentUserId ? 'bg-emerald-500/10' : ''}`}>
                    <td className="px-2 py-2">{profile?.username ?? 'Spelare'} {player.user_id === currentUserId ? '(du)' : ''}</td>
                    <td className="px-2 py-2">{player.user_id}</td>
                    <td className="px-2 py-2">{player.status}</td>
                    <td className="px-2 py-2">{String(player.ready)}</td>
                    <td className="px-2 py-2">{formatTimestamp(player.ready_at)}</td>
                    <td className="px-2 py-2">{deltaFromCreated(player.ready_at, match?.created_at)}</td>
                    <td className="px-2 py-2">{clickedAccept ? 'ja' : 'nej'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {myRow && (
          <p className="mt-3 text-white/70">
            Min rad nu: status={myRow.player.status}, ready={String(myRow.player.ready)}, ready_at={formatTimestamp(myRow.player.ready_at)}
          </p>
        )}
      </div>

      <div className="rounded border border-white/20 p-4">
        <h2 className="mb-3 text-lg font-semibold">4. Realtimelog</h2>
        <p className="mb-3 text-white/60">
          Öppna sidan i två fönster. När du trycker på en knapp i ena fönstret ska en ny rad dyka upp här direkt i andra.
        </p>
        <div className="max-h-[420px] overflow-auto rounded bg-black/20 p-3 font-mono text-xs text-white/80">
          {logs.length === 0 ? (
            <div>Ingen realtime ännu.</div>
          ) : (
            logs.map((item) => (
              <div key={item.id} className="mb-1">
                [{item.at}] {item.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
