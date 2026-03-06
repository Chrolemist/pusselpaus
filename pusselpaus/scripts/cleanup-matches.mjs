/**
 * Rensa ALLA aktiva multiplayer-matcher i Supabase.
 * Sätter status='cancelled' på matcher och 'forfeited' på spelare.
 *
 * Kör: node scripts/cleanup-matches.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Läs .env
const env = readFileSync('.env', 'utf-8');
const get = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();

const url = get('VITE_SUPABASE_URL');
const key = get('VITE_SUPABASE_ANON_KEY');
if (!url || !key) { console.error('Saknar .env-nycklar'); process.exit(1); }

const supabase = createClient(url, key);

async function cleanup() {
  console.log('🔍 Söker aktiva matcher...\n');

  // 1. Hämta alla matcher som INTE är finished/cancelled
  const { data: matches, error: mErr } = await supabase
    .from('multiplayer_matches')
    .select('id, status, host_id, game_id, created_at')
    .in('status', ['waiting', 'starting', 'in_progress']);

  if (mErr) { console.error('❌ Kunde inte hämta matcher:', mErr.message); return; }

  if (!matches?.length) {
    console.log('✅ Inga aktiva matcher hittades — allt är rent!');
    return;
  }

  console.log(`⚠️  Hittade ${matches.length} aktiva matcher:\n`);
  for (const m of matches) {
    console.log(`  • ${m.id}  status=${m.status}  game=${m.game_id}  host=${m.host_id}  skapad=${m.created_at}`);
  }

  // 2. Hämta alla match_players för dessa matcher
  const matchIds = matches.map(m => m.id);
  const { data: players, error: pErr } = await supabase
    .from('multiplayer_match_players')
    .select('id, match_id, user_id, status, forfeited')
    .in('match_id', matchIds);

  if (pErr) { console.error('❌ Kunde inte hämta spelare:', pErr.message); return; }

  console.log(`\n👥 Hittade ${players?.length ?? 0} spelar-rader\n`);
  for (const p of players ?? []) {
    console.log(`  • match=${p.match_id}  user=${p.user_id}  status=${p.status}  forfeited=${p.forfeited}`);
  }

  // 3. Uppdatera alla match_players → forfeited + declined
  console.log('\n🧹 Rensar spelare...');
  const { error: upErr } = await supabase
    .from('multiplayer_match_players')
    .update({ status: 'forfeited', forfeited: true })
    .in('match_id', matchIds);

  if (upErr) {
    console.error('❌ Kunde inte uppdatera spelare:', upErr.message);
  } else {
    console.log('✅ Alla spelar-rader satt till forfeited');
  }

  // 4. Uppdatera alla matcher → cancelled
  console.log('🧹 Rensar matcher...');
  const { error: umErr } = await supabase
    .from('multiplayer_matches')
    .update({ status: 'cancelled' })
    .in('id', matchIds);

  if (umErr) {
    console.error('❌ Kunde inte uppdatera matcher:', umErr.message);
  } else {
    console.log('✅ Alla matcher satta till cancelled');
  }

  // 5. Verifiera
  console.log('\n🔍 Verifierar...');
  const { data: remaining } = await supabase
    .from('multiplayer_matches')
    .select('id, status')
    .in('status', ['waiting', 'starting', 'in_progress']);

  if (remaining?.length) {
    console.log(`⚠️  Fortfarande ${remaining.length} aktiva matcher kvar (RLS kan blockera uppdateringar)`);
    for (const r of remaining) console.log(`  • ${r.id}  status=${r.status}`);
    console.log('\n💡 Om matcher fanns kvar: kör detta SQL i Supabase Dashboard → SQL Editor:');
    console.log(`
UPDATE multiplayer_match_players SET status = 'forfeited', forfeited = true
WHERE match_id IN (
  SELECT id FROM multiplayer_matches WHERE status IN ('waiting','starting','in_progress')
);

UPDATE multiplayer_matches SET status = 'cancelled'
WHERE status IN ('waiting','starting','in_progress');
`);
  } else {
    console.log('✅ Allt rent! Inga aktiva matcher kvar.');
  }
}

cleanup().catch(e => console.error('Fatal:', e));
