/* ── Supabase type definitions for @supabase/supabase-js v2.98+ ──
 *
 *  Update this file when you change your schema by running:
 *  npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
 *
 *  For now this is a hand-written subset covering the tables we use.
 */

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          tag: string;
          avatar_url: string | null;
          coins: number;
          xp: number;
          level: number;
          skin: string;
          is_online: boolean;
          last_seen: string;
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string;
          tag?: string;
          avatar_url?: string | null;
          coins?: number;
          xp?: number;
          level?: number;
          skin?: string;
          is_online?: boolean;
          last_seen?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          tag?: string;
          avatar_url?: string | null;
          coins?: number;
          xp?: number;
          level?: number;
          skin?: string;
          is_online?: boolean;
          last_seen?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          addressee_id?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friendships_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey";
            columns: ["addressee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      skins: {
        Row: {
          id: string;
          name: string;
          emoji: string;
          price: number;
          description: string;
        };
        Insert: {
          id: string;
          name: string;
          emoji: string;
          price?: number;
          description?: string;
        };
        Update: {
          id?: string;
          name?: string;
          emoji?: string;
          price?: number;
          description?: string;
        };
        Relationships: [];
      };
      user_skins: {
        Row: {
          id: string;
          user_id: string;
          skin_id: string;
          purchased_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          skin_id: string;
          purchased_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          skin_id?: string;
          purchased_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_skins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_skins_skin_id_fkey";
            columns: ["skin_id"];
            isOneToOne: false;
            referencedRelation: "skins";
            referencedColumns: ["id"];
          },
        ];
      };
      user_game_stats: {
        Row: {
          id: string;
          user_id: string;
          game_id: string;
          played: number;
          won: number;
          best_time: number | null;
          best_score: number | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_id: string;
          played?: number;
          won?: number;
          best_time?: number | null;
          best_score?: number | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_id?: string;
          played?: number;
          won?: number;
          best_time?: number | null;
          best_score?: number | null;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_game_stats_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      multiplayer_matches: {
        Row: {
          id: string;
          host_id: string;
          game_id: string;
          stake: number;
          config_seed: number | null;
          config: Json | null;
          status: string;
          winner_id: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          host_id: string;
          game_id: string;
          stake: number;
          config_seed?: number | null;
          config?: Json | null;
          status?: string;
          winner_id?: string | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          host_id?: string;
          game_id?: string;
          stake?: number;
          config_seed?: number | null;
          config?: Json | null;
          status?: string;
          winner_id?: string | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "multiplayer_matches_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "multiplayer_matches_winner_id_fkey";
            columns: ["winner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      multiplayer_match_players: {
        Row: {
          id: string;
          match_id: string;
          user_id: string;
          status: string;
          stake_locked: number;
          submitted: boolean;
          forfeited: boolean;
          elapsed_seconds: number | null;
          score: number | null;
          survived_seconds: number | null;
          submitted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          user_id: string;
          status?: string;
          stake_locked?: number;
          submitted?: boolean;
          forfeited?: boolean;
          elapsed_seconds?: number | null;
          score?: number | null;
          survived_seconds?: number | null;
          submitted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          match_id?: string;
          user_id?: string;
          status?: string;
          stake_locked?: number;
          submitted?: boolean;
          forfeited?: boolean;
          elapsed_seconds?: number | null;
          score?: number | null;
          survived_seconds?: number | null;
          submitted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "multiplayer_match_players_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "multiplayer_matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "multiplayer_match_players_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      matchmake_join: {
        Args: {
          p_game_id: string;
          p_difficulty: string | null;
        };
        Returns: Json;
      };
      matchmake_leave: {
        Args: {
          p_game_id: string;
        };
        Returns: void;
      };
      matchmake_poll: {
        Args: {
          p_game_id: string;
        };
        Returns: Json;
      };
      mp_create_match: {
        Args: {
          p_game_id: string;
          p_stake: number;
          p_invited_ids: string[];
          p_config?: Json;
          p_config_seed?: number;
        };
        Returns: void;
      };
      mp_accept_invite: {
        Args: {
          p_match_id: string;
        };
        Returns: void;
      };
      mp_decline_invite: {
        Args: {
          p_match_id: string;
        };
        Returns: void;
      };
      mp_submit_result: {
        Args: {
          p_match_id: string;
          p_elapsed_seconds: number | null;
          p_score: number | null;
          p_survived_seconds: number | null;
        };
        Returns: void;
      };
      mp_try_resolve_timeout: {
        Args: {
          p_match_id: string;
          p_timeout_seconds?: number;
        };
        Returns: string;
      };
      mp_start_match: {
        Args: {
          p_match_id: string;
          p_countdown_seconds?: number;
        };
        Returns: void;
      };
      mp_tick_match_start: {
        Args: {
          p_match_id: string;
        };
        Returns: string;
      };
      mp_forfeit_match: {
        Args: {
          p_match_id: string;
        };
        Returns: void;
      };
      mp_cancel_match: {
        Args: {
          p_match_id: string;
        };
        Returns: void;
      };
      mp_force_cleanup: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/* ── Convenience aliases ── */
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Friendship = Database['public']['Tables']['friendships']['Row'];
export type Skin = Database['public']['Tables']['skins']['Row'];
export type UserSkin = Database['public']['Tables']['user_skins']['Row'];
export type UserGameStat = Database['public']['Tables']['user_game_stats']['Row'];
export type MultiplayerMatch = Database['public']['Tables']['multiplayer_matches']['Row'];
export type MultiplayerMatchPlayer = Database['public']['Tables']['multiplayer_match_players']['Row'];
