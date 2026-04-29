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
          cluster_id: string
          created_at: string
          id: string
          photo_id: string
          similarity: number
        }
        Insert: {
          cluster_id: string
          created_at?: string
          id?: string
          photo_id: string
          similarity?: number
        }
        Update: {
          cluster_id?: string
          created_at?: string
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
            foreignKeyName: "cluster_photo_matches_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      face_clusters: {
        Row: {
          created_at: string
          display_name: string | null
          hidden: boolean
          id: string
          photo_count: number
          representative_face_id: string
          representative_photo_id: string | null
          representative_s3_key: string | null
          representative_storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          hidden?: boolean
          id?: string
          photo_count?: number
          representative_face_id: string
          representative_photo_id?: string | null
          representative_s3_key?: string | null
          representative_storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          hidden?: boolean
          id?: string
          photo_count?: number
          representative_face_id?: string
          representative_photo_id?: string | null
          representative_s3_key?: string | null
          representative_storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      guests: {
        Row: {
          cluster_id: string | null
          created_at: string
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
        ]
      }
      photo_matches: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          photo_id: string
          similarity: number
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          photo_id: string
          similarity: number
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          photo_id?: string
          similarity?: number
        }
        Relationships: [
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
          created_at: string
          face_count: number
          id: string
          processed: boolean
          processing_error: string | null
          s3_key: string | null
          source: string
          storage_path: string
          storage_provider: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          face_count?: number
          id?: string
          processed?: boolean
          processing_error?: string | null
          s3_key?: string | null
          source?: string
          storage_path: string
          storage_provider?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          face_count?: number
          id?: string
          processed?: boolean
          processing_error?: string | null
          s3_key?: string | null
          source?: string
          storage_path?: string
          storage_provider?: string
          uploaded_by?: string | null
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
