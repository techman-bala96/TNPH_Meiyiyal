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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      certificates: {
        Row: {
          certificate_number: string
          created_at: string
          id: string
          issued_at: string
          request_id: string
          user_id: string
          verification_code: string
          worker_id: string
        }
        Insert: {
          certificate_number: string
          created_at?: string
          id?: string
          issued_at?: string
          request_id: string
          user_id: string
          verification_code: string
          worker_id: string
        }
        Update: {
          certificate_number?: string
          created_at?: string
          id?: string
          issued_at?: string
          request_id?: string
          user_id?: string
          verification_code?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          media_url: string | null
          message: string
          message_type: string
          request_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          media_url?: string | null
          message: string
          message_type?: string
          request_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          media_url?: string | null
          message?: string
          message_type?: string
          request_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_verification: {
        Row: {
          aadhaar_number_hash: string | null
          aadhaar_verified: boolean
          created_at: string
          id: string
          pan_name: string | null
          pan_number: string | null
          pan_verified: boolean
          rejection_reason: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          verified_at: string | null
          video_verification_url: string | null
          video_verified: boolean
          worker_id: string
        }
        Insert: {
          aadhaar_number_hash?: string | null
          aadhaar_verified?: boolean
          created_at?: string
          id?: string
          pan_name?: string | null
          pan_number?: string | null
          pan_verified?: boolean
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          verified_at?: string | null
          video_verification_url?: string | null
          video_verified?: boolean
          worker_id: string
        }
        Update: {
          aadhaar_number_hash?: string | null
          aadhaar_verified?: boolean
          created_at?: string
          id?: string
          pan_name?: string | null
          pan_number?: string | null
          pan_verified?: boolean
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          verified_at?: string | null
          video_verification_url?: string | null
          video_verified?: boolean
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_verification_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      occupation_services: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          occupation_id: string
          price_max: number
          price_min: number
          price_unit_en: string
          price_unit_ta: string
          service_name_en: string
          service_name_ta: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          occupation_id: string
          price_max?: number
          price_min?: number
          price_unit_en?: string
          price_unit_ta?: string
          service_name_en: string
          service_name_ta: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          occupation_id?: string
          price_max?: number
          price_min?: number
          price_unit_en?: string
          price_unit_ta?: string
          service_name_en?: string
          service_name_ta?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "occupation_services_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["id"]
          },
        ]
      }
      occupations: {
        Row: {
          category: Database["public"]["Enums"]["worker_category"]
          created_at: string
          description: string | null
          description_ta: string | null
          icon: string | null
          id: string
          name: string
          name_ta: string | null
          payment_methodology: Database["public"]["Enums"]["payment_methodology"]
        }
        Insert: {
          category: Database["public"]["Enums"]["worker_category"]
          created_at?: string
          description?: string | null
          description_ta?: string | null
          icon?: string | null
          id?: string
          name: string
          name_ta?: string | null
          payment_methodology: Database["public"]["Enums"]["payment_methodology"]
        }
        Update: {
          category?: Database["public"]["Enums"]["worker_category"]
          created_at?: string
          description?: string | null
          description_ta?: string | null
          icon?: string | null
          id?: string
          name?: string
          name_ta?: string | null
          payment_methodology?: Database["public"]["Enums"]["payment_methodology"]
        }
        Relationships: []
      }
      profile_visitors: {
        Row: {
          id: string
          profile_user_id: string
          visited_at: string
          visitor_user_id: string
        }
        Insert: {
          id?: string
          profile_user_id: string
          visited_at?: string
          visitor_user_id: string
        }
        Update: {
          id?: string
          profile_user_id?: string
          visited_at?: string
          visitor_user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          phone_number: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          phone_number?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_requests: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          final_price: number | null
          id: string
          occupation_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          proposed_price: number | null
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at: string
          user_id: string
          user_rating: number | null
          user_review: string | null
          worker_id: string
          worker_rating: number | null
          worker_review: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          final_price?: number | null
          id?: string
          occupation_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          proposed_price?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at?: string
          user_id: string
          user_rating?: number | null
          user_review?: string | null
          worker_id: string
          worker_rating?: number | null
          worker_review?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          final_price?: number | null
          id?: string
          occupation_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          proposed_price?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          updated_at?: string
          user_id?: string
          user_rating?: number | null
          user_review?: string | null
          worker_id?: string
          worker_rating?: number | null
          worker_review?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attachments: string[] | null
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: string[] | null
          category: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: string[] | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          request_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["transaction_type"]
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_education: {
        Row: {
          created_at: string
          degree_name: string
          document_url: string | null
          id: string
          institution: string
          worker_id: string
          year_completed: number | null
        }
        Insert: {
          created_at?: string
          degree_name: string
          document_url?: string | null
          id?: string
          institution: string
          worker_id: string
          year_completed?: number | null
        }
        Update: {
          created_at?: string
          degree_name?: string
          document_url?: string | null
          id?: string
          institution?: string
          worker_id?: string
          year_completed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_education_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_experience: {
        Row: {
          company_name: string
          created_at: string
          description: string | null
          document_url: string | null
          end_year: number | null
          id: string
          role: string
          start_year: number | null
          worker_id: string
        }
        Insert: {
          company_name: string
          created_at?: string
          description?: string | null
          document_url?: string | null
          end_year?: number | null
          id?: string
          role: string
          start_year?: number | null
          worker_id: string
        }
        Update: {
          company_name?: string
          created_at?: string
          description?: string | null
          document_url?: string | null
          end_year?: number | null
          id?: string
          role?: string
          start_year?: number | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_experience_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_portfolio: {
        Row: {
          created_at: string
          description: string | null
          id: string
          media_type: string
          media_url: string
          title: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          media_type: string
          media_url: string
          title: string
          worker_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          media_type?: string
          media_url?: string
          title?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_portfolio_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          about: string | null
          category: Database["public"]["Enums"]["worker_category"]
          created_at: string
          hourly_rate: number | null
          id: string
          is_active: boolean
          is_verified: boolean
          occupation_id: string | null
          rating: number | null
          total_reviews: number | null
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          about?: string | null
          category: Database["public"]["Enums"]["worker_category"]
          created_at?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          is_verified?: boolean
          occupation_id?: string | null
          rating?: number | null
          total_reviews?: number | null
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          about?: string | null
          category?: Database["public"]["Enums"]["worker_category"]
          created_at?: string
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          is_verified?: boolean
          occupation_id?: string | null
          rating?: number | null
          total_reviews?: number | null
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      kyc_status: "pending" | "under_review" | "verified" | "rejected"
      payment_methodology:
        | "per_session"
        | "task_based"
        | "free_service"
        | "hybrid"
      payment_status:
        | "pending"
        | "authorized"
        | "completed"
        | "refunded"
        | "failed"
      request_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "in_progress"
        | "completed"
        | "cancelled"
      transaction_type: "credit" | "debit" | "refund" | "payout" | "top_up"
      user_role: "user" | "worker" | "admin"
      worker_category: "professional" | "skilled" | "freelancer" | "educator"
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
      kyc_status: ["pending", "under_review", "verified", "rejected"],
      payment_methodology: [
        "per_session",
        "task_based",
        "free_service",
        "hybrid",
      ],
      payment_status: [
        "pending",
        "authorized",
        "completed",
        "refunded",
        "failed",
      ],
      request_status: [
        "pending",
        "accepted",
        "rejected",
        "in_progress",
        "completed",
        "cancelled",
      ],
      transaction_type: ["credit", "debit", "refund", "payout", "top_up"],
      user_role: ["user", "worker", "admin"],
      worker_category: ["professional", "skilled", "freelancer", "educator"],
    },
  },
} as const
