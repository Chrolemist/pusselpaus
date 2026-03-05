/* ── Supabase client (singleton) ── */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase-nycklar saknas! Lägg till VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i .env',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
