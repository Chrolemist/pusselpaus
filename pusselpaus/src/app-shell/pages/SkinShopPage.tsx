import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { supabase } from '../../lib/supabaseClient';
import type { Profile, Skin } from '../../lib/database.types';

export default function SkinShopPage() {
  const { user, profile, refreshProfile, updateProfile } = useAuth();
  const [skins, setSkins] = useState<Skin[]>([]);
  const [ownedSkinIds, setOwnedSkinIds] = useState<Set<string>>(new Set(['default']));
  const [loading, setLoading] = useState(true);
  const [busySkinId, setBusySkinId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadShop = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data: skinData }, { data: userSkinsData }] = await Promise.all([
      supabase.from('skins').select('*').order('price', { ascending: true }).returns<Skin[]>(),
      supabase.from('user_skins').select('skin_id').eq('user_id', user.id),
    ]);

    const owned = new Set<string>(['default']);
    for (const row of userSkinsData ?? []) owned.add(row.skin_id as string);

    setSkins(skinData ?? []);
    setOwnedSkinIds(owned);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  const coins = profile?.coins ?? 0;

  const handleEquip = useCallback(async (skin: Skin) => {
    setBusySkinId(skin.id);
    setMessage(null);
    try {
      await updateProfile({ skin: skin.emoji });
      setMessage(`${skin.name} utrustad ✅`);
    } catch {
      setMessage('Kunde inte byta skin just nu.');
    } finally {
      setBusySkinId(null);
    }
  }, [updateProfile]);

  const handleBuy = useCallback(async (skin: Skin) => {
    if (!user || !profile) return;

    if (ownedSkinIds.has(skin.id)) {
      await handleEquip(skin);
      return;
    }

    if (coins < skin.price) {
      setMessage('Du har inte tillräckligt med coins.');
      return;
    }

    setBusySkinId(skin.id);
    setMessage(null);

    try {
      const { data: updatedProfile, error: coinsError } = await supabase
        .from('profiles')
        .update({ coins: coins - skin.price })
        .eq('id', user.id)
        .gte('coins', skin.price)
        .select('*')
        .returns<Profile[]>()
        .single();

      if (coinsError || !updatedProfile) {
        setMessage('Köpet misslyckades (coins uppdaterades inte).');
        return;
      }

      const { error: insertError } = await supabase
        .from('user_skins')
        .insert({ user_id: user.id, skin_id: skin.id });

      if (insertError && insertError.code !== '23505') {
        setMessage('Köpet misslyckades (skin kunde inte sparas).');
        return;
      }

      await refreshProfile();
      await loadShop();
      setMessage(`Du köpte ${skin.name}! 🛍️`);
    } catch {
      setMessage('Något gick fel vid köp.');
    } finally {
      setBusySkinId(null);
    }
  }, [coins, handleEquip, loadShop, ownedSkinIds, profile, refreshProfile, user]);

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-10">
      <Link to="/" className="self-start text-sm text-text-muted hover:text-brand-light">← Tillbaka</Link>

      <h2 className="text-3xl font-bold">🛍️ Skinshop</h2>
      <p className="text-sm text-text-muted">Lås upp nya avatars med dina coins</p>

      <div className="rounded-full bg-yellow-500/20 px-4 py-2 text-sm">
        <span className="mr-2">🪙</span>
        <span className="font-mono font-bold text-yellow-300">{coins.toLocaleString('sv-SE')}</span>
      </div>

      {message && (
        <p className="rounded-lg bg-brand/20 px-3 py-2 text-xs text-brand-light">{message}</p>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Laddar shop...</p>
      ) : (
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skins.map((skin) => {
            const owned = ownedSkinIds.has(skin.id);
            const equipped = profile?.skin === skin.emoji;
            const insufficientCoins = !owned && coins < skin.price;
            const busy = busySkinId === skin.id;

            return (
              <div
                key={skin.id}
                className="flex flex-col items-center gap-3 rounded-2xl bg-surface-card p-5 shadow-lg ring-1 ring-white/10"
              >
                <span className="text-5xl">{skin.emoji}</span>
                <p className="text-lg font-semibold">{skin.name}</p>
                <p className="text-center text-xs text-text-muted">{skin.description}</p>
                <p className="text-sm font-bold text-yellow-300">🪙 {skin.price.toLocaleString('sv-SE')}</p>

                {equipped ? (
                  <span className="rounded-lg bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-300">
                    Utrustad
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      if (owned) {
                        void handleEquip(skin);
                      } else {
                        void handleBuy(skin);
                      }
                    }}
                    disabled={busy || insufficientCoins}
                    className="rounded-lg bg-brand/30 px-4 py-2 text-xs font-bold text-brand-light transition hover:bg-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Vänta…' : owned ? 'Använd' : `Köp för ${skin.price}`}
                  </button>
                )}

                {!owned && insufficientCoins && (
                  <p className="text-[11px] text-red-300">För få coins</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
