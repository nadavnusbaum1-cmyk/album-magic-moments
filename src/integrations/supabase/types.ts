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
      cluster_photo_matches: {
        Row: {
          bounding_box: Json | null
          cluster_id: string
          created_at: string
          event_id: string | null
          face_id: string | null
          id: string
          photo_id: string
          similarity: number
        }
        Insert: {
          bounding_box?: Json | null
          cluster_id: string
          created_at?: string
          event_id?: string | null
          face_id?: string | null
          id?: string
          photo_id: string
          similarity?: number
        }
        Update: {
          bounding_box?: Json | null
          cluster_id?: string
          created_at?: string
          event_id?: string | null
          face_id?: string | null
          id?: string
          photo_id?: string
          similarity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cluster_photo_matches_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "face_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_photo_matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_photo_matches_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      event_members: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_guest_uploads: boolean
          cover_image_url: string | null
          cover_photo_id: string | null
          created_at: string
          default_language: string | null
          event_date: string | null
          id: string
          is_published: boolean
          name: string
          owner_id: string
          show_all_photos: boolean
          show_people: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          allow_guest_uploads?: boolean
          cover_image_url?: string | null
          cover_photo_id?: string | null
          created_at?: string
          default_language?: string | null
          event_date?: string | null
          id?: string
          is_published?: boolean
          name: string
          owner_id: string
          show_all_photos?: boolean
          show_people?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          allow_guest_uploads?: boolean
          cover_image_url?: string | null
          cover_photo_id?: string | null
          created_at?: string
          default_language?: string | null
          event_date?: string | null
          id?: string
          is_published?: boolean
          name?: string
          owner_id?: string
          show_all_photos?: boolean
          show_people?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      face_clusters: {
        Row: {
          created_at: string
          display_name: string | null
          event_id: string | null
          hidden: boolean
          id: string
          photo_count: number
          representative_bbox: Json | null
          representative_face_id: string
          representative_photo_id: string | null
          representative_s3_key: string | null
          representative_storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          event_id?: string | null
          hidden?: boolean
          id?: string
          photo_count?: number
          representative_bbox?: Json | null
          representative_face_id: string
          representative_photo_id?: string | null
          representative_s3_key?: string | null
          representative_storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          event_id?: string | null
          hidden?: boolean
          id?: string
          photo_count?: number
          representative_bbox?: Json | null
          representative_face_id?: string
          representative_photo_id?: string | null
          representative_s3_key?: string | null
          representative_storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_clusters_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          cluster_id: string | null
          created_at: string
          event_id: string | null
          id: string
          magic_token: string
          name: string
          photo_count: number
          rekognition_face_id: string | null
          selfie_path: string | null
          updated_at: string
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          magic_token?: string
          name: string
          photo_count?: number
          rekognition_face_id?: string | null
          selfie_path?: string | null
          updated_at?: string
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          magic_token?: string
          name?: string
          photo_count?: number
          rekognition_face_id?: string | null
          selfie_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "face_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_matches: {
        Row: {
          created_at: string
          event_id: string | null
          guest_id: string
          id: string
          photo_id: string
          similarity: number
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          guest_id: string
          id?: string
          photo_id: string
          similarity: number
        }
        Update: {
          created_at?: string
          event_id?: string | null
          guest_id?: string
          id?: string
          photo_id?: string
          similarity?: number
        }
        Relationships: [
          {
            foreignKeyName: "photo_matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_matches_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_matches_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          content_type: string | null
          created_at: string
          event_id: string | null
          face_count: number
          id: string
          media_type: string
          processed: boolean
          processing_error: string | null
          review_skipped: boolean
          s3_key: string | null
          source: string
          source_label: string | null
          storage_path: string
          storage_provider: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          event_id?: string | null
          face_count?: number
          id?: string
          media_type?: string
          processed?: boolean
          processing_error?: string | null
          review_skipped?: boolean
          s3_key?: string | null
          source?: string
          source_label?: string | null
          storage_path: string
          storage_provider?: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          event_id?: string | null
          face_count?: number
          id?: string
          media_type?: string
          processed?: boolean
          processing_error?: string | null
          review_skipped?: boolean
          s3_key?: string | null
          source?: string
          source_label?: string | null
          storage_path?: string
          storage_provider?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_event_sources: {
        Args: { _event_id: string }
        Returns: {
          count: number
          source_label: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_event_host: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "host"
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
    Enums: {
      app_role: ["super_admin", "host"],
    },
  },
} as const
