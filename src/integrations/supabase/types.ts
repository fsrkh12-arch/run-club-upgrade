export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      challenge_members: {
        Row: {
          challenge_id: string
          id: string
          joined_at: string
          progress_km: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          id?: string
          joined_at?: string
          progress_km?: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          id?: string
          joined_at?: string
          progress_km?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_members_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          badge_label: string
          created_at: string
          description: string | null
          ends_on: string
          id: string
          starts_on: string
          target_km: number
          title: string
          updated_at: string
        }
        Insert: {
          badge_label?: string
          created_at?: string
          description?: string | null
          ends_on?: string
          id?: string
          starts_on?: string
          target_km?: number
          title: string
          updated_at?: string
        }
        Update: {
          badge_label?: string
          created_at?: string
          description?: string | null
          ends_on?: string
          id?: string
          starts_on?: string
          target_km?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      communities: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          description: string | null
          emoji: string
          id: string
          is_official: boolean
          name: string
          slug: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string
          id?: string
          is_official?: boolean
          name: string
          slug: string
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          emoji?: string
          id?: string
          is_official?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          community_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          community_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          community_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          community_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          community_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          community_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_mutes: {
        Row: {
          community_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          category: string
          content: string
          created_at: string
          distance_km: number | null
          id: string
          pace_seconds: number | null
          route_name: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          distance_km?: number | null
          id?: string
          pace_seconds?: number | null
          route_name?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          distance_km?: number | null
          id?: string
          pace_seconds?: number | null
          route_name?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      daily_checkins: {
        Row: {
          checkin_on: string
          id: string
          user_id: string
          xp_awarded: number
        }
        Insert: {
          checkin_on?: string
          id?: string
          user_id: string
          xp_awarded?: number
        }
        Update: {
          checkin_on?: string
          id?: string
          user_id?: string
          xp_awarded?: number
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current_value: number
          due_date: string | null
          id: string
          metric: string
          notified_complete: boolean
          status: string
          target_value: number
          title: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          due_date?: string | null
          id?: string
          metric?: string
          notified_complete?: boolean
          status?: string
          target_value?: number
          title: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          due_date?: string | null
          id?: string
          metric?: string
          notified_complete?: boolean
          status?: string
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          community_id: string | null
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          community_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          community_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      post_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_initials: string
          bio: string | null
          city: string
          created_at: string
          display_name: string
          dob: string | null
          handle: string | null
          height_cm: number | null
          id: string
          last_active_on: string | null
          runner_level: string
          streak_days: number
          updated_at: string
          user_id: string
          weekly_km_goal: number
          weight_kg: number | null
          xp: number
        }
        Insert: {
          avatar_initials?: string
          bio?: string | null
          city?: string
          created_at?: string
          display_name?: string
          dob?: string | null
          handle?: string | null
          height_cm?: number | null
          id?: string
          last_active_on?: string | null
          runner_level?: string
          streak_days?: number
          updated_at?: string
          user_id: string
          weekly_km_goal?: number
          weight_kg?: number | null
          xp?: number
        }
        Update: {
          avatar_initials?: string
          bio?: string | null
          city?: string
          created_at?: string
          display_name?: string
          dob?: string | null
          handle?: string | null
          height_cm?: number | null
          id?: string
          last_active_on?: string | null
          runner_level?: string
          streak_days?: number
          updated_at?: string
          user_id?: string
          weekly_km_goal?: number
          weight_kg?: number | null
          xp?: number
        }
        Relationships: []
      }
      runs: {
        Row: {
          avg_heart_rate: number | null
          avg_pace_seconds: number
          cadence: number | null
          calories: number | null
          created_at: string
          distance_km: number
          duration_seconds: number
          effort: number
          elevation_m: number
          id: string
          notes: string | null
          route_name: string
          run_at: string
          shoe: string | null
          start_lat: number | null
          start_lng: number | null
          step_count: number | null
          track_points: Json | null
          trail_id: string | null
          updated_at: string
          user_id: string
          visibility: string
          weather: string | null
        }
        Insert: {
          avg_heart_rate?: number | null
          avg_pace_seconds?: number
          cadence?: number | null
          calories?: number | null
          created_at?: string
          distance_km?: number
          duration_seconds?: number
          effort?: number
          elevation_m?: number
          id?: string
          notes?: string | null
          route_name: string
          run_at?: string
          shoe?: string | null
          start_lat?: number | null
          start_lng?: number | null
          step_count?: number | null
          track_points?: Json | null
          trail_id?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
          weather?: string | null
        }
        Update: {
          avg_heart_rate?: number | null
          avg_pace_seconds?: number
          cadence?: number | null
          calories?: number | null
          created_at?: string
          distance_km?: number
          duration_seconds?: number
          effort?: number
          elevation_m?: number
          id?: string
          notes?: string | null
          route_name?: string
          run_at?: string
          shoe?: string | null
          start_lat?: number | null
          start_lng?: number | null
          step_count?: number | null
          track_points?: Json | null
          trail_id?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
          weather?: string | null
        }
        Relationships: []
      }
      side_quest_completions: {
        Row: {
          completed_at: string
          id: string
          quest_id: string
          run_id: string | null
          user_id: string
          xp_awarded: number
        }
        Insert: {
          completed_at?: string
          id?: string
          quest_id: string
          run_id?: string | null
          user_id: string
          xp_awarded?: number
        }
        Update: {
          completed_at?: string
          id?: string
          quest_id?: string
          run_id?: string | null
          user_id?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "side_quest_completions_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "side_quests"
            referencedColumns: ["id"]
          },
        ]
      }
      side_quests: {
        Row: {
          created_at: string
          day: string
          description: string
          difficulty: string
          id: string
          kind: string
          slot: number
          threshold: number
          title: string
          xp_reward: number
        }
        Insert: {
          created_at?: string
          day?: string
          description: string
          difficulty?: string
          id?: string
          kind: string
          slot: number
          threshold: number
          title: string
          xp_reward?: number
        }
        Update: {
          created_at?: string
          day?: string
          description?: string
          difficulty?: string
          id?: string
          kind?: string
          slot?: number
          threshold?: number
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
      trails: {
        Row: {
          city: string | null
          created_at: string
          description: string | null
          distance_km: number
          id: string
          is_public: boolean
          name: string
          polyline: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          distance_km?: number
          id?: string
          is_public?: boolean
          name: string
          polyline?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          distance_km?: number
          id?: string
          is_public?: boolean
          name?: string
          polyline?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          accent: string
          default_run_visibility: string
          language: string
          notify_challenges: boolean
          notify_messages: boolean
          notify_weekly_summary: boolean
          preferred_run_days: string[]
          profile_visibility: string
          show_on_leaderboard: boolean
          theme: string
          units: string
          updated_at: string
          user_id: string
          weekly_km_goal: number
        }
        Insert: {
          accent?: string
          default_run_visibility?: string
          language?: string
          notify_challenges?: boolean
          notify_messages?: boolean
          notify_weekly_summary?: boolean
          preferred_run_days?: string[]
          profile_visibility?: string
          show_on_leaderboard?: boolean
          theme?: string
          units?: string
          updated_at?: string
          user_id: string
          weekly_km_goal?: number
        }
        Update: {
          accent?: string
          default_run_visibility?: string
          language?: string
          notify_challenges?: boolean
          notify_messages?: boolean
          notify_weekly_summary?: boolean
          preferred_run_days?: string[]
          profile_visibility?: string
          show_on_leaderboard?: boolean
          theme?: string
          units?: string
          updated_at?: string
          user_id?: string
          weekly_km_goal?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_community_member: {
        Args: { _community_id: string; _user_id: string }
        Returns: boolean
      }
      seed_daily_quests: { Args: { _day?: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
