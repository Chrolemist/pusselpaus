-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.friendships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT friendships_pkey PRIMARY KEY (id),
  CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id),
  CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.multiplayer_match_players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'invited'::text CHECK (status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text])),
  stake_locked integer NOT NULL DEFAULT 0,
  submitted boolean NOT NULL DEFAULT false,
  elapsed_seconds integer,
  score integer,
  survived_seconds integer,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  forfeited boolean NOT NULL DEFAULT false,
  CONSTRAINT multiplayer_match_players_pkey PRIMARY KEY (id),
  CONSTRAINT multiplayer_match_players_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.multiplayer_matches(id),
  CONSTRAINT multiplayer_match_players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.multiplayer_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL,
  game_id text NOT NULL,
  stake integer NOT NULL CHECK (stake >= 0),
  status text NOT NULL DEFAULT 'waiting'::text CHECK (status = ANY (ARRAY['waiting'::text, 'starting'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])),
  winner_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  config_seed bigint,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT multiplayer_matches_pkey PRIMARY KEY (id),
  CONSTRAINT multiplayer_matches_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.profiles(id),
  CONSTRAINT multiplayer_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text NOT NULL DEFAULT 'Spelare'::text,
  avatar_url text,
  coins integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  skin text NOT NULL DEFAULT '🙂'::text,
  is_online boolean NOT NULL DEFAULT false,
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tag text NOT NULL DEFAULT lpad((floor((random() * (10000)::double precision)))::text, 4, '0'::text),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.skins (
  id text NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL,
  price integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT ''::text,
  CONSTRAINT skins_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_game_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_id text NOT NULL,
  played integer NOT NULL DEFAULT 0,
  won integer NOT NULL DEFAULT 0,
  best_time integer,
  best_score integer,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_game_stats_pkey PRIMARY KEY (id),
  CONSTRAINT user_game_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_skins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  skin_id text NOT NULL,
  purchased_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_skins_pkey PRIMARY KEY (id),
  CONSTRAINT user_skins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_skins_skin_id_fkey FOREIGN KEY (skin_id) REFERENCES public.skins(id)
);