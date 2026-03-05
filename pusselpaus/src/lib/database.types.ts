/* ── Supabase type definitions for @supabase/supabase-js v2.98+ ──
 *
 *  Update this file when you change your schema by running:
 *  npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
 *
 *  For now this is a hand-written subset covering the tables we use.
 */

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/* ── Convenience aliases ── */
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Friendship = Database['public']['Tables']['friendships']['Row'];
export type Skin = Database['public']['Tables']['skins']['Row'];
export type UserSkin = Database['public']['Tables']['user_skins']['Row'];
