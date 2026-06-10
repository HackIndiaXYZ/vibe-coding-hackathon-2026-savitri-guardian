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
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          incident_id: string | null
          metadata: Json | null
          session_id: string | null
          tenant_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          incident_id?: string | null
          metadata?: Json | null
          session_id?: string | null
          tenant_id?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          incident_id?: string | null
          metadata?: Json | null
          session_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "emergency_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notify_token: string
          patient_id: string
          phone: string | null
          relation: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notify_token?: string
          patient_id: string
          phone?: string | null
          relation?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notify_token?: string
          patient_id?: string
          phone?: string | null
          relation?: string | null
        }
        Relationships: []
      }
      emergency_sessions: {
        Row: {
          ai_summary: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_emt_id: string | null
          closed_at: string | null
          demo_mode: boolean
          gps_accuracy: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          location_source: string
          opened_at: string
          patient_id: string
          recording_status: string | null
          scanner_phone: string | null
          scanner_type: string | null
          scanner_user_id: string | null
          scanner_verification_method: string | null
          silent: boolean
          started_by_emt_id: string | null
          status: Database["public"]["Enums"]["session_status"]
          tenant_id: string
          triggered_via: string
          voice_note_path: string | null
        }
        Insert: {
          ai_summary?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_emt_id?: string | null
          closed_at?: string | null
          demo_mode?: boolean
          gps_accuracy?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          location_source?: string
          opened_at?: string
          patient_id: string
          recording_status?: string | null
          scanner_phone?: string | null
          scanner_type?: string | null
          scanner_user_id?: string | null
          scanner_verification_method?: string | null
          silent?: boolean
          started_by_emt_id?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          tenant_id?: string
          triggered_via?: string
          voice_note_path?: string | null
        }
        Update: {
          ai_summary?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_emt_id?: string | null
          closed_at?: string | null
          demo_mode?: boolean
          gps_accuracy?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          location_source?: string
          opened_at?: string
          patient_id?: string
          recording_status?: string | null
          scanner_phone?: string | null
          scanner_type?: string | null
          scanner_user_id?: string | null
          scanner_verification_method?: string | null
          silent?: boolean
          started_by_emt_id?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          tenant_id?: string
          triggered_via?: string
          voice_note_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_tokens: {
        Row: {
          active: boolean
          created_at: string
          id: string
          patient_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          patient_id: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          patient_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: []
      }
      emts: {
        Row: {
          agency: string | null
          badge_no: string | null
          created_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          agency?: string | null
          badge_no?: string | null
          created_at?: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          agency?: string | null
          badge_no?: string | null
          created_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_staff: {
        Row: {
          created_at: string
          hospital_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hospital_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hospital_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_staff_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          tenant_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          tenant_id?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          accepted_at: string | null
          ai_summary: Json | null
          arrived_at: string | null
          completed_at: string | null
          created_at: string
          emt_id: string
          hospital_id: string | null
          id: string
          incident_type: string | null
          observations: string | null
          patient_id: string
          priority: Database["public"]["Enums"]["incident_priority"] | null
          recommended_department: string | null
          registration_number: string | null
          session_id: string
          status: Database["public"]["Enums"]["incident_status"]
          submitted_at: string | null
          tenant_id: string
          transcript: string | null
          voice_note_url: string | null
        }
        Insert: {
          accepted_at?: string | null
          ai_summary?: Json | null
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          emt_id: string
          hospital_id?: string | null
          id?: string
          incident_type?: string | null
          observations?: string | null
          patient_id: string
          priority?: Database["public"]["Enums"]["incident_priority"] | null
          recommended_department?: string | null
          registration_number?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["incident_status"]
          submitted_at?: string | null
          tenant_id?: string
          transcript?: string | null
          voice_note_url?: string | null
        }
        Update: {
          accepted_at?: string | null
          ai_summary?: Json | null
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          emt_id?: string
          hospital_id?: string | null
          id?: string
          incident_type?: string | null
          observations?: string | null
          patient_id?: string
          priority?: Database["public"]["Enums"]["incident_priority"] | null
          recommended_department?: string | null
          registration_number?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["incident_status"]
          submitted_at?: string | null
          tenant_id?: string
          transcript?: string | null
          voice_note_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "emergency_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: Database["public"]["Enums"]["notification_audience"]
          body: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          incident_id: string | null
          payload: Json | null
          read_at: string | null
          recipient_contact_id: string | null
          recipient_user_id: string | null
          session_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          audience: Database["public"]["Enums"]["notification_audience"]
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          incident_id?: string | null
          payload?: Json | null
          read_at?: string | null
          recipient_contact_id?: string | null
          recipient_user_id?: string | null
          session_id?: string | null
          tenant_id?: string
          title: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["notification_audience"]
          body?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          incident_id?: string | null
          payload?: Json | null
          read_at?: string | null
          recipient_contact_id?: string | null
          recipient_user_id?: string | null
          session_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_contact_id_fkey"
            columns: ["recipient_contact_id"]
            isOneToOne: false
            referencedRelation: "emergency_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "emergency_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_profiles: {
        Row: {
          allergies: string[]
          blood_group: string | null
          conditions: string[]
          created_at: string
          date_of_birth: string | null
          insurance_policy_no: string | null
          insurance_provider: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string[]
          blood_group?: string | null
          conditions?: string[]
          created_at?: string
          date_of_birth?: string | null
          insurance_policy_no?: string | null
          insurance_provider?: string | null
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string[]
          blood_group?: string | null
          conditions?: string[]
          created_at?: string
          date_of_birth?: string | null
          insurance_policy_no?: string | null
          insurance_provider?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "patient"
        | "emt"
        | "hospital"
        | "super_admin"
        | "ops_admin"
        | "tech_admin"
        | "provider"
        | "emergency_contact"
      audit_action:
        | "PROFILE_CREATED"
        | "PROFILE_UPDATED"
        | "QR_GENERATED"
        | "QR_SCANNED"
        | "PATIENT_NOTIFIED"
        | "CONTACT_NOTIFIED"
        | "EMERGENCY_SESSION_CREATED"
        | "REPORT_SUBMITTED"
        | "HOSPITAL_ALERTED"
        | "HOSPITAL_ACCEPTED"
        | "PATIENT_ARRIVED"
        | "SOS_TRIGGERED"
        | "LOCATION_CAPTURED"
        | "VOICE_RECORDING_STARTED"
        | "VOICE_RECORDING_UPLOADED"
        | "SOS_NOTIFICATION_SENT"
        | "LOCATION_CAPTURE_FAILED"
        | "PUBLIC_EMERGENCY_REPORTED"
        | "PATIENT_USER_EMERGENCY_REPORTED"
        | "EMT_ACCESS_GRANTED"
        | "HOSPITAL_ACCESS_GRANTED"
        | "MEDICAL_INFO_DISCLOSED"
        | "EMERGENCY_CALL_INITIATED"
        | "EMERGENCY_CALL_SIMULATED"
        | "HOSPITAL_CONVERTED_TO_INCIDENT"
        | "HOSPITAL_DISMISSED_REPORT"
        | "EMT_ASSIGNED"
        | "SCANNER_CALL_INITIATED"
        | "PATIENT_CALL_INITIATED"
        | "EMERGENCY_CONTACT_CALL_INITIATED"
        | "SCANNER_CALL_SIMULATED"
        | "PATIENT_CALL_SIMULATED"
        | "EMERGENCY_CONTACT_CALL_SIMULATED"
        | "TRANSCRIPT_VALIDATION_FAILED"
        | "AI_SUMMARY_VALIDATION_FAILED"
        | "MANUAL_INCIDENT_ASSESSMENT"
      incident_priority: "low" | "medium" | "high" | "critical"
      incident_status:
        | "pending"
        | "accepted"
        | "arrived"
        | "completed"
        | "rejected"
      notification_audience:
        | "patient"
        | "emergency_contact"
        | "hospital"
        | "emt"
      notification_channel: "in_app" | "sms" | "email"
      session_status: "open" | "closed"
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
      app_role: [
        "patient",
        "emt",
        "hospital",
        "super_admin",
        "ops_admin",
        "tech_admin",
        "provider",
        "emergency_contact",
      ],
      audit_action: [
        "PROFILE_CREATED",
        "PROFILE_UPDATED",
        "QR_GENERATED",
        "QR_SCANNED",
        "PATIENT_NOTIFIED",
        "CONTACT_NOTIFIED",
        "EMERGENCY_SESSION_CREATED",
        "REPORT_SUBMITTED",
        "HOSPITAL_ALERTED",
        "HOSPITAL_ACCEPTED",
        "PATIENT_ARRIVED",
        "SOS_TRIGGERED",
        "LOCATION_CAPTURED",
        "VOICE_RECORDING_STARTED",
        "VOICE_RECORDING_UPLOADED",
        "SOS_NOTIFICATION_SENT",
        "LOCATION_CAPTURE_FAILED",
        "PUBLIC_EMERGENCY_REPORTED",
        "PATIENT_USER_EMERGENCY_REPORTED",
        "EMT_ACCESS_GRANTED",
        "HOSPITAL_ACCESS_GRANTED",
        "MEDICAL_INFO_DISCLOSED",
        "EMERGENCY_CALL_INITIATED",
        "EMERGENCY_CALL_SIMULATED",
        "HOSPITAL_CONVERTED_TO_INCIDENT",
        "HOSPITAL_DISMISSED_REPORT",
        "EMT_ASSIGNED",
        "SCANNER_CALL_INITIATED",
        "PATIENT_CALL_INITIATED",
        "EMERGENCY_CONTACT_CALL_INITIATED",
        "SCANNER_CALL_SIMULATED",
        "PATIENT_CALL_SIMULATED",
        "EMERGENCY_CONTACT_CALL_SIMULATED",
        "TRANSCRIPT_VALIDATION_FAILED",
        "AI_SUMMARY_VALIDATION_FAILED",
        "MANUAL_INCIDENT_ASSESSMENT",
      ],
      incident_priority: ["low", "medium", "high", "critical"],
      incident_status: [
        "pending",
        "accepted",
        "arrived",
        "completed",
        "rejected",
      ],
      notification_audience: [
        "patient",
        "emergency_contact",
        "hospital",
        "emt",
      ],
      notification_channel: ["in_app", "sms", "email"],
      session_status: ["open", "closed"],
    },
  },
} as const
