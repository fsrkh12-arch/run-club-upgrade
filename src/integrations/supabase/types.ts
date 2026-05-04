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
      goals: {
        Row: {
          created_at: string
          current_value: number
          due_date: string | null
          id: string
          metric: string
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
          status?: string
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
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
          handle: string | null
          id: string
          runner_level: string
          updated_at: string
          user_id: string
          weekly_km_goal: number
        }
        Insert: {
          avatar_initials?: string
          bio?: string | null
          city?: string
          created_at?: string
          display_name?: string
          handle?: string | null
          id?: string
          runner_level?: string
          updated_at?: string
          user_id: string
          weekly_km_goal?: number
        }
        Update: {
          avatar_initials?: string
          bio?: string | null
          city?: string
          created_at?: string
          display_name?: string
          handle?: string | null
          id?: string
          runner_level?: string
          updated_at?: string
          user_id?: string
          weekly_km_goal?: number
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
          updated_at?: string
          user_id?: string
          visibility?: string
          weather?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
