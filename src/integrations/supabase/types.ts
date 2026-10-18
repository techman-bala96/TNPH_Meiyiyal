
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_audit": {
                  Row: {
                    "action": string,"actor": string,"created_at": string,"data": Json | null,"id": number,"note": string | null,"target": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor": string,"created_at"?: string,"data"?: Json | null,"id"?: number,"note"?: string | null,"target"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor"?: string,"created_at"?: string,"data"?: Json | null,"id"?: number,"note"?: string | null,"target"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"app_settings": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"certificates": {
                  Row: {
                    "certificate_number": string,"created_at": string,"id": string,"issued_at": string,"request_id": string,"user_id": string,"verification_code": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "certificate_number": string,"created_at"?: string,"id"?: string,"issued_at"?: string,"request_id": string,"user_id": string,"verification_code": string,"worker_id": string
                  }
                  Update: {
                    "certificate_number"?: string,"created_at"?: string,"id"?: string,"issued_at"?: string,"request_id"?: string,"user_id"?: string,"verification_code"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificates_request_id_fkey"
      columns: ["request_id"]
isOneToOne: true
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificates_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "created_at": string,"id": string,"is_read": boolean,"media_url": string | null,"message": string,"message_type": string,"request_id": string,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_read"?: boolean,"media_url"?: string | null,"message": string,"message_type"?: string,"request_id": string,"sender_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_read"?: boolean,"media_url"?: string | null,"message"?: string,"message_type"?: string,"request_id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_rules": {
                  Row: {
                    "node_slug": string,"pct": number
                  }
                  ComputedFields: never
                  Insert: {
                    "node_slug": string,"pct": number
                  }
                  Update: {
                    "node_slug"?: string,"pct"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_rules_node_slug_fkey"
      columns: ["node_slug"]
isOneToOne: true
      referencedRelation: "taxonomy_nodes"
      referencedColumns: ["slug"]
    }
                  ]
                },"consult_feedback": {
                  Row: {
                    "comment": string | null,"complaint_reason": string | null,"created_at": string,"id": string,"is_complaint": boolean,"is_good": boolean,"is_negative": boolean,"rating": number,"session_id": string,"tags": (string)[],"user_id": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment"?: string | null,"complaint_reason"?: string | null,"created_at"?: string,"id"?: string,"is_complaint"?: boolean,"is_good": boolean,"is_negative": boolean,"rating": number,"session_id": string,"tags"?: (string)[],"user_id": string,"worker_id": string
                  }
                  Update: {
                    "comment"?: string | null,"complaint_reason"?: string | null,"created_at"?: string,"id"?: string,"is_complaint"?: boolean,"is_good"?: boolean,"is_negative"?: boolean,"rating"?: number,"session_id"?: string,"tags"?: (string)[],"user_id"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consult_feedback_session_id_fkey"
      columns: ["session_id"]
isOneToOne: true
      referencedRelation: "consult_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consult_feedback_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"consult_messages": {
                  Row: {
                    "body": string | null,"created_at": string,"file_name": string | null,"file_path": string | null,"id": string,"kind": string,"mime": string | null,"sender": string,"session_id": string,"size_bytes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"file_name"?: string | null,"file_path"?: string | null,"id"?: string,"kind"?: string,"mime"?: string | null,"sender"?: string,"session_id": string,"size_bytes"?: number | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"file_name"?: string | null,"file_path"?: string | null,"id"?: string,"kind"?: string,"mime"?: string | null,"sender"?: string,"session_id"?: string,"size_bytes"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consult_messages_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "consult_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"consult_requests": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"min_minutes": number,"mode": string,"node_slug": string,"rate": number,"responded_at": string | null,"session_id": string | null,"status": string,"user_id": string,"user_name": string | null,"worker_id": string,"worker_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"id"?: string,"min_minutes": number,"mode": string,"node_slug": string,"rate": number,"responded_at"?: string | null,"session_id"?: string | null,"status"?: string,"user_id": string,"user_name"?: string | null,"worker_id": string,"worker_user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"min_minutes"?: number,"mode"?: string,"node_slug"?: string,"rate"?: number,"responded_at"?: string | null,"session_id"?: string | null,"status"?: string,"user_id"?: string,"user_name"?: string | null,"worker_id"?: string,"worker_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consult_requests_node_slug_fkey"
      columns: ["node_slug"]
isOneToOne: false
      referencedRelation: "taxonomy_nodes"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "consult_requests_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"consult_sessions": {
                  Row: {
                    "commission_pct": number,"credits_used": number,"current_mode": string,"end_reason": string | null,"ended_at": string | null,"id": string,"node_slug": string,"request_id": string | null,"started_at": string,"status": string,"user_id": string,"worker_id": string,"worker_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "commission_pct"?: number,"credits_used"?: number,"current_mode"?: string,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"node_slug": string,"request_id"?: string | null,"started_at"?: string,"status"?: string,"user_id": string,"worker_id": string,"worker_user_id": string
                  }
                  Update: {
                    "commission_pct"?: number,"credits_used"?: number,"current_mode"?: string,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"node_slug"?: string,"request_id"?: string | null,"started_at"?: string,"status"?: string,"user_id"?: string,"worker_id"?: string,"worker_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consult_sessions_request_id_fkey"
      columns: ["request_id"]
isOneToOne: true
      referencedRelation: "consult_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consult_sessions_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_packs": {
                  Row: {
                    "active": boolean,"bonus": number,"credits": number,"id": string,"name_i18n": NonNullable<Json>,"popular": boolean,"price_inr": number,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"bonus"?: number,"credits": number,"id": string,"name_i18n": NonNullable<Json>,"popular"?: boolean,"price_inr": number,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"bonus"?: number,"credits"?: number,"id"?: string,"name_i18n"?: NonNullable<Json>,"popular"?: boolean,"price_inr"?: number,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"kyc_otp_sessions": {
                  Row: {
                    "aadhaar_hash": string,"attempts": number,"created_at": string,"expires_at": string,"last4": string,"provider_ref": string | null,"sends": number,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aadhaar_hash": string,"attempts"?: number,"created_at"?: string,"expires_at": string,"last4": string,"provider_ref"?: string | null,"sends"?: number,"worker_id": string
                  }
                  Update: {
                    "aadhaar_hash"?: string,"attempts"?: number,"created_at"?: string,"expires_at"?: string,"last4"?: string,"provider_ref"?: string | null,"sends"?: number,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kyc_otp_sessions_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: true
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"kyc_verification": {
                  Row: {
                    "aadhaar_last4": string | null,"aadhaar_number_hash": string | null,"aadhaar_verified": boolean,"created_at": string,"id": string,"pan_name": string | null,"pan_number": string | null,"pan_verified": boolean,"provider": string | null,"rejection_reason": string | null,"status": Database["public"]['Enums']["kyc_status"],"updated_at": string,"verified_at": string | null,"video_verification_url": string | null,"video_verified": boolean,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aadhaar_last4"?: string | null,"aadhaar_number_hash"?: string | null,"aadhaar_verified"?: boolean,"created_at"?: string,"id"?: string,"pan_name"?: string | null,"pan_number"?: string | null,"pan_verified"?: boolean,"provider"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["kyc_status"],"updated_at"?: string,"verified_at"?: string | null,"video_verification_url"?: string | null,"video_verified"?: boolean,"worker_id": string
                  }
                  Update: {
                    "aadhaar_last4"?: string | null,"aadhaar_number_hash"?: string | null,"aadhaar_verified"?: boolean,"created_at"?: string,"id"?: string,"pan_name"?: string | null,"pan_number"?: string | null,"pan_verified"?: boolean,"provider"?: string | null,"rejection_reason"?: string | null,"status"?: Database["public"]['Enums']["kyc_status"],"updated_at"?: string,"verified_at"?: string | null,"video_verification_url"?: string | null,"video_verified"?: boolean,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "kyc_verification_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: true
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"node_requirements": {
                  Row: {
                    "doc_types": (string)[],"node_slug": string,"schema": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "doc_types"?: (string)[],"node_slug": string,"schema"?: NonNullable<Json>
                  }
                  Update: {
                    "doc_types"?: (string)[],"node_slug"?: string,"schema"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "node_requirements_node_slug_fkey"
      columns: ["node_slug"]
isOneToOne: true
      referencedRelation: "taxonomy_nodes"
      referencedColumns: ["slug"]
    }
                  ]
                },"occupation_services": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"occupation_id": string,"price_max": number,"price_min": number,"price_unit_en": string,"price_unit_ta": string,"service_name_en": string,"service_name_ta": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"occupation_id": string,"price_max"?: number,"price_min"?: number,"price_unit_en"?: string,"price_unit_ta"?: string,"service_name_en": string,"service_name_ta": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"occupation_id"?: string,"price_max"?: number,"price_min"?: number,"price_unit_en"?: string,"price_unit_ta"?: string,"service_name_en"?: string,"service_name_ta"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "occupation_services_occupation_id_fkey"
      columns: ["occupation_id"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["id"]
    }
                  ]
                },"occupations": {
                  Row: {
                    "category": Database["public"]['Enums']["worker_category"],"created_at": string,"description": string | null,"description_ta": string | null,"icon": string | null,"id": string,"name": string,"name_ta": string | null,"payment_methodology": Database["public"]['Enums']["payment_methodology"]
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["worker_category"],"created_at"?: string,"description"?: string | null,"description_ta"?: string | null,"icon"?: string | null,"id"?: string,"name": string,"name_ta"?: string | null,"payment_methodology": Database["public"]['Enums']["payment_methodology"]
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["worker_category"],"created_at"?: string,"description"?: string | null,"description_ta"?: string | null,"icon"?: string | null,"id"?: string,"name"?: string,"name_ta"?: string | null,"payment_methodology"?: Database["public"]['Enums']["payment_methodology"]
                  }
                  Relationships: [
                    
                  ]
                },"payment_events": {
                  Row: {
                    "event_id": string,"order_id": string | null,"outcome": string | null,"payload": Json | null,"provider": string,"received_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"order_id"?: string | null,"outcome"?: string | null,"payload"?: Json | null,"provider": string,"received_at"?: string,"type": string
                  }
                  Update: {
                    "event_id"?: string,"order_id"?: string | null,"outcome"?: string | null,"payload"?: Json | null,"provider"?: string,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "payment_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_orders": {
                  Row: {
                    "amount_paise": number,"bonus": number,"created_at": string,"credited_at": string | null,"credits": number,"currency": string,"failure_reason": string | null,"gst_paise": number,"id": string,"pack_id": string,"provider": string,"provider_order_id": string | null,"provider_payment_id": string | null,"refund_note": string | null,"refunded_at": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paise": number,"bonus"?: number,"created_at"?: string,"credited_at"?: string | null,"credits": number,"currency"?: string,"failure_reason"?: string | null,"gst_paise"?: number,"id"?: string,"pack_id": string,"provider": string,"provider_order_id"?: string | null,"provider_payment_id"?: string | null,"refund_note"?: string | null,"refunded_at"?: string | null,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "amount_paise"?: number,"bonus"?: number,"created_at"?: string,"credited_at"?: string | null,"credits"?: number,"currency"?: string,"failure_reason"?: string | null,"gst_paise"?: number,"id"?: string,"pack_id"?: string,"provider"?: string,"provider_order_id"?: string | null,"provider_payment_id"?: string | null,"refund_note"?: string | null,"refunded_at"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_orders_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "credit_packs"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_requests": {
                  Row: {
                    "admin_note": string | null,"amount": number,"decided_at": string | null,"decided_by": string | null,"id": string,"method": string,"reference": string | null,"requested_at": string,"status": string,"worker_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string | null,"amount": number,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"method"?: string,"reference"?: string | null,"requested_at"?: string,"status"?: string,"worker_user_id": string
                  }
                  Update: {
                    "admin_note"?: string | null,"amount"?: number,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"method"?: string,"reference"?: string | null,"requested_at"?: string,"status"?: string,"worker_user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"dob": string | null,"email": string | null,"first_name": string,"full_name": string | null,"id": string,"last_name": string,"location_address": string | null,"location_lat": number | null,"location_lng": number | null,"phone_number": string | null,"prefs": NonNullable<Json>,"role": Database["public"]['Enums']["user_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"dob"?: string | null,"email"?: string | null,"first_name"?: string,"full_name"?: string | null,"id"?: string,"last_name"?: string,"location_address"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"phone_number"?: string | null,"prefs"?: NonNullable<Json>,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"dob"?: string | null,"email"?: string | null,"first_name"?: string,"full_name"?: string | null,"id"?: string,"last_name"?: string,"location_address"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"phone_number"?: string | null,"prefs"?: NonNullable<Json>,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_cards": {
                  Row: {
                    "band_max": number | null,"band_min": number | null,"credits_per_min": number,"min_minutes": number,"mode": string,"node_slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "band_max"?: number | null,"band_min"?: number | null,"credits_per_min": number,"min_minutes"?: number,"mode": string,"node_slug": string,"updated_at"?: string
                  }
                  Update: {
                    "band_max"?: number | null,"band_min"?: number | null,"credits_per_min"?: number,"min_minutes"?: number,"mode"?: string,"node_slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_cards_node_slug_fkey"
      columns: ["node_slug"]
isOneToOne: false
      referencedRelation: "taxonomy_nodes"
      referencedColumns: ["slug"]
    }
                  ]
                },"reward_milestones": {
                  Row: {
                    "active": boolean,"color": string,"desc_i18n": NonNullable<Json>,"icon": string,"kind": string,"min_reviews": number,"slug": string,"sort": number,"threshold": number,"title_i18n": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"color"?: string,"desc_i18n": NonNullable<Json>,"icon"?: string,"kind": string,"min_reviews"?: number,"slug": string,"sort"?: number,"threshold": number,"title_i18n": NonNullable<Json>
                  }
                  Update: {
                    "active"?: boolean,"color"?: string,"desc_i18n"?: NonNullable<Json>,"icon"?: string,"kind"?: string,"min_reviews"?: number,"slug"?: string,"sort"?: number,"threshold"?: number,"title_i18n"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"service_requests": {
                  Row: {
                    "cancellation_reason": string | null,"cancelled_at": string | null,"completed_at": string | null,"created_at": string,"description": string | null,"final_price": number | null,"id": string,"occupation_id": string | null,"payment_status": Database["public"]['Enums']["payment_status"],"proposed_price": number | null,"scheduled_at": string | null,"started_at": string | null,"status": Database["public"]['Enums']["request_status"],"title": string,"updated_at": string,"user_id": string,"user_rating": number | null,"user_review": string | null,"worker_id": string,"worker_rating": number | null,"worker_review": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cancellation_reason"?: string | null,"cancelled_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"final_price"?: number | null,"id"?: string,"occupation_id"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"proposed_price"?: number | null,"scheduled_at"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"title": string,"updated_at"?: string,"user_id": string,"user_rating"?: number | null,"user_review"?: string | null,"worker_id": string,"worker_rating"?: number | null,"worker_review"?: string | null
                  }
                  Update: {
                    "cancellation_reason"?: string | null,"cancelled_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"final_price"?: number | null,"id"?: string,"occupation_id"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"proposed_price"?: number | null,"scheduled_at"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"title"?: string,"updated_at"?: string,"user_id"?: string,"user_rating"?: number | null,"user_review"?: string | null,"worker_id"?: string,"worker_rating"?: number | null,"worker_review"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_requests_occupation_id_fkey"
      columns: ["occupation_id"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_requests_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"session_calls": {
                  Row: {
                    "answered_at": string | null,"caller": string,"created_at": string,"ended_at": string | null,"id": string,"mode": string,"session_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string | null,"caller": string,"created_at"?: string,"ended_at"?: string | null,"id"?: string,"mode": string,"session_id": string,"status"?: string
                  }
                  Update: {
                    "answered_at"?: string | null,"caller"?: string,"created_at"?: string,"ended_at"?: string | null,"id"?: string,"mode"?: string,"session_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_calls_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "consult_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"session_segments": {
                  Row: {
                    "credits": number,"ended_at": string | null,"id": number,"minutes_billed": number,"mode": string,"rate": number,"session_id": string,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "credits"?: number,"ended_at"?: string | null,"id"?: number,"minutes_billed"?: number,"mode": string,"rate": number,"session_id": string,"started_at"?: string
                  }
                  Update: {
                    "credits"?: number,"ended_at"?: string | null,"id"?: number,"minutes_billed"?: number,"mode"?: string,"rate"?: number,"session_id"?: string,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_segments_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "consult_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"spatial_ref_sys": {
                  Row: {
                    "auth_name": string | null,"auth_srid": number | null,"proj4text": string | null,"srid": number,"srtext": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_name"?: string | null,"auth_srid"?: number | null,"proj4text"?: string | null,"srid": number,"srtext"?: string | null
                  }
                  Update: {
                    "auth_name"?: string | null,"auth_srid"?: number | null,"proj4text"?: string | null,"srid"?: number,"srtext"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"support_tickets": {
                  Row: {
                    "attachments": (string)[] | null,"category": string,"created_at": string,"description": string,"id": string,"priority": string,"resolved_at": string | null,"status": string,"subject": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachments"?: (string)[] | null,"category": string,"created_at"?: string,"description": string,"id"?: string,"priority"?: string,"resolved_at"?: string | null,"status"?: string,"subject": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attachments"?: (string)[] | null,"category"?: string,"created_at"?: string,"description"?: string,"id"?: string,"priority"?: string,"resolved_at"?: string | null,"status"?: string,"subject"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"taxonomy_nodes": {
                  Row: {
                    "allows_ratings": boolean,"compliance_mode": string,"created_at": string,"icon": string | null,"id": string,"is_active": boolean,"kind": string,"name_i18n": NonNullable<Json>,"parent_slug": string | null,"slug": string,"sort": number,"synonyms": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allows_ratings"?: boolean,"compliance_mode"?: string,"created_at"?: string,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"kind": string,"name_i18n": NonNullable<Json>,"parent_slug"?: string | null,"slug": string,"sort"?: number,"synonyms"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "allows_ratings"?: boolean,"compliance_mode"?: string,"created_at"?: string,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: string,"name_i18n"?: NonNullable<Json>,"parent_slug"?: string | null,"slug"?: string,"sort"?: number,"synonyms"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "taxonomy_nodes_parent_slug_fkey"
      columns: ["parent_slug"]
isOneToOne: false
      referencedRelation: "taxonomy_nodes"
      referencedColumns: ["slug"]
    }
                  ]
                },"tn_areas": {
                  Row: {
                    "center": unknown,"district_slug": string,"id": number,"lat": number | null,"lng": number | null,"name": string,"name_ta": string | null,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "center"?: unknown,"district_slug": string,"id"?: number,"lat"?: never,"lng"?: never,"name": string,"name_ta"?: string | null,"sort"?: number
                  }
                  Update: {
                    "center"?: unknown,"district_slug"?: string,"id"?: number,"lat"?: never,"lng"?: never,"name"?: string,"name_ta"?: string | null,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tn_areas_district_slug_fkey"
      columns: ["district_slug"]
isOneToOne: false
      referencedRelation: "tn_districts"
      referencedColumns: ["slug"]
    }
                  ]
                },"tn_districts": {
                  Row: {
                    "center": unknown,"name_i18n": NonNullable<Json>,"slug": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "center": unknown,"name_i18n": NonNullable<Json>,"slug": string,"sort"?: number
                  }
                  Update: {
                    "center"?: unknown,"name_i18n"?: NonNullable<Json>,"slug"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"user_locations": {
                  Row: {
                    "address": string | null,"area_id": number | null,"created_at": string,"district_slug": string | null,"geog": unknown,"id": string,"is_current": boolean,"label": string | null,"source": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"area_id"?: number | null,"created_at"?: string,"district_slug"?: string | null,"geog": unknown,"id"?: string,"is_current"?: boolean,"label"?: string | null,"source": string,"user_id": string
                  }
                  Update: {
                    "address"?: string | null,"area_id"?: number | null,"created_at"?: string,"district_slug"?: string | null,"geog"?: unknown,"id"?: string,"is_current"?: boolean,"label"?: string | null,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_locations_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "tn_areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_locations_district_slug_fkey"
      columns: ["district_slug"]
isOneToOne: false
      referencedRelation: "tn_districts"
      referencedColumns: ["slug"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["user_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role": Database["public"]['Enums']["user_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["user_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wallet_transactions": {
                  Row: {
                    "amount": number,"created_at": string,"description": string | null,"id": string,"reference_id": string | null,"request_id": string | null,"status": Database["public"]['Enums']["payment_status"],"type": Database["public"]['Enums']["transaction_type"],"wallet_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"description"?: string | null,"id"?: string,"reference_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"type": Database["public"]['Enums']["transaction_type"],"wallet_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"description"?: string | null,"id"?: string,"reference_id"?: string | null,"request_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"type"?: Database["public"]['Enums']["transaction_type"],"wallet_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wallet_transactions_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "service_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wallet_transactions_wallet_id_fkey"
      columns: ["wallet_id"]
isOneToOne: false
      referencedRelation: "wallets"
      referencedColumns: ["id"]
    }
                  ]
                },"wallets": {
                  Row: {
                    "balance": number,"created_at": string,"id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance"?: number,"created_at"?: string,"id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "balance"?: number,"created_at"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"worker_documents": {
                  Row: {
                    "created_at": string,"doc_type": string,"id": string,"mime": string | null,"path": string,"size_bytes": number | null,"status": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"doc_type": string,"id"?: string,"mime"?: string | null,"path": string,"size_bytes"?: number | null,"status"?: string,"worker_id": string
                  }
                  Update: {
                    "created_at"?: string,"doc_type"?: string,"id"?: string,"mime"?: string | null,"path"?: string,"size_bytes"?: number | null,"status"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_documents_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_earnings": {
                  Row: {
                    "available_at": string,"commission": number,"commission_pct": number,"created_at": string,"gross": number,"id": number,"minutes": number | null,"mode": string | null,"net": number,"payout_id": string | null,"session_id": string | null,"worker_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "available_at": string,"commission": number,"commission_pct": number,"created_at"?: string,"gross": number,"id"?: number,"minutes"?: number | null,"mode"?: string | null,"net": number,"payout_id"?: string | null,"session_id"?: string | null,"worker_user_id": string
                  }
                  Update: {
                    "available_at"?: string,"commission"?: number,"commission_pct"?: number,"created_at"?: string,"gross"?: number,"id"?: number,"minutes"?: number | null,"mode"?: string | null,"net"?: number,"payout_id"?: string | null,"session_id"?: string | null,"worker_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_earnings_payout_id_fkey"
      columns: ["payout_id"]
isOneToOne: false
      referencedRelation: "payout_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "worker_earnings_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "consult_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_education": {
                  Row: {
                    "created_at": string,"degree_name": string,"document_url": string | null,"id": string,"institution": string,"worker_id": string,"year_completed": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"degree_name": string,"document_url"?: string | null,"id"?: string,"institution": string,"worker_id": string,"year_completed"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"degree_name"?: string,"document_url"?: string | null,"id"?: string,"institution"?: string,"worker_id"?: string,"year_completed"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_education_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_experience": {
                  Row: {
                    "company_name": string,"created_at": string,"description": string | null,"document_url": string | null,"end_year": number | null,"id": string,"role": string,"start_year": number | null,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_name": string,"created_at"?: string,"description"?: string | null,"document_url"?: string | null,"end_year"?: number | null,"id"?: string,"role": string,"start_year"?: number | null,"worker_id": string
                  }
                  Update: {
                    "company_name"?: string,"created_at"?: string,"description"?: string | null,"document_url"?: string | null,"end_year"?: number | null,"id"?: string,"role"?: string,"start_year"?: number | null,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_experience_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_nodes": {
                  Row: {
                    "is_primary": boolean,"node_slug": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_primary"?: boolean,"node_slug": string,"worker_id": string
                  }
                  Update: {
                    "is_primary"?: boolean,"node_slug"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_nodes_node_slug_fkey"
      columns: ["node_slug"]
isOneToOne: false
      referencedRelation: "taxonomy_nodes"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "worker_nodes_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_portfolio": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"media_type": string,"media_url": string,"title": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"media_type": string,"media_url": string,"title": string,"worker_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"media_type"?: string,"media_url"?: string,"title"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_portfolio_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_rewards": {
                  Row: {
                    "awarded_at": string,"cert_no": string,"id": string,"metric": number | null,"milestone": string,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "awarded_at"?: string,"cert_no"?: string,"id"?: string,"metric"?: number | null,"milestone": string,"worker_id": string
                  }
                  Update: {
                    "awarded_at"?: string,"cert_no"?: string,"id"?: string,"metric"?: number | null,"milestone"?: string,"worker_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "worker_rewards_milestone_fkey"
      columns: ["milestone"]
isOneToOne: false
      referencedRelation: "reward_milestones"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "worker_rewards_worker_id_fkey"
      columns: ["worker_id"]
isOneToOne: false
      referencedRelation: "workers"
      referencedColumns: ["id"]
    }
                  ]
                },"workers": {
                  Row: {
                    "about": string | null,"base_geog": unknown,"block_reason": string | null,"blocked_until": string | null,"category": Database["public"]['Enums']["worker_category"],"created_at": string,"decided_at": string | null,"display_name": string | null,"district_slug": string | null,"flag_active": boolean,"flag_good_needed": number,"flag_reason": string | null,"flagged_at": string | null,"hourly_rate": number | null,"id": string,"is_active": boolean,"is_online": boolean,"is_verified": boolean,"last_seen_at": string | null,"locked_category": string | null,"occupation_id": string | null,"photo_url": string | null,"primary_node": string | null,"rating": number | null,"reg_data": NonNullable<Json>,"review_note": string | null,"rewards_count": number,"status": string,"strikes_reset_at": string,"submitted_at": string | null,"total_reviews": number | null,"updated_at": string,"user_id": string,"years_experience": number | null,"worker_is_blocked": boolean | null
                  }
                  ComputedFields: "worker_is_blocked"
                  Insert: {
                    "about"?: string | null,"base_geog"?: unknown,"block_reason"?: string | null,"blocked_until"?: string | null,"category"?: Database["public"]['Enums']["worker_category"],"created_at"?: string,"decided_at"?: string | null,"display_name"?: string | null,"district_slug"?: string | null,"flag_active"?: boolean,"flag_good_needed"?: number,"flag_reason"?: string | null,"flagged_at"?: string | null,"hourly_rate"?: number | null,"id"?: string,"is_active"?: boolean,"is_online"?: boolean,"is_verified"?: boolean,"last_seen_at"?: string | null,"locked_category"?: string | null,"occupation_id"?: string | null,"photo_url"?: string | null,"primary_node"?: string | null,"rating"?: number | null,"reg_data"?: NonNullable<Json>,"review_note"?: string | null,"rewards_count"?: number,"status"?: string,"strikes_reset_at"?: string,"submitted_at"?: string | null,"total_reviews"?: number | null,"updated_at"?: string,"user_id": string,"years_experience"?: number | null
                  }
                  Update: {
                    "about"?: string | null,"base_geog"?: unknown,"block_reason"?: string | null,"blocked_until"?: string | null,"category"?: Database["public"]['Enums']["worker_category"],"created_at"?: string,"decided_at"?: string | null,"display_name"?: string | null,"district_slug"?: string | null,"flag_active"?: boolean,"flag_good_needed"?: number,"flag_reason"?: string | null,"flagged_at"?: string | null,"hourly_rate"?: number | null,"id"?: string,"is_active"?: boolean,"is_online"?: boolean,"is_verified"?: boolean,"last_seen_at"?: string | null,"locked_category"?: string | null,"occupation_id"?: string | null,"photo_url"?: string | null,"primary_node"?: string | null,"rating"?: number | null,"reg_data"?: NonNullable<Json>,"review_note"?: string | null,"rewards_count"?: number,"status"?: string,"strikes_reset_at"?: string,"submitted_at"?: string | null,"total_reviews"?: number | null,"updated_at"?: string,"user_id"?: string,"years_experience"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "workers_district_slug_fkey"
      columns: ["district_slug"]
isOneToOne: false
      referencedRelation: "tn_districts"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "workers_occupation_id_fkey"
      columns: ["occupation_id"]
isOneToOne: false
      referencedRelation: "occupations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workers_primary_node_fkey"
      columns: ["primary_node"]
isOneToOne: false
      referencedRelation: "taxonomy_nodes"
      referencedColumns: ["slug"]
    }
                  ]
                }
          }
          Views: {
            "geography_columns": {
                  Row: {
                    "coord_dimension": number | null,"f_geography_column": unknown,"f_table_catalog": unknown,"f_table_name": unknown,"f_table_schema": unknown,"srid": number | null,"type": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"geometry_columns": {
                  Row: {
                    "coord_dimension": number | null,"f_geometry_column": unknown,"f_table_catalog": string | null,"f_table_name": unknown,"f_table_schema": unknown,"srid": number | null,"type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "coord_dimension"?: number | null,"f_geometry_column"?: unknown,"f_table_catalog"?: string | null,"f_table_name"?: unknown,"f_table_schema"?: unknown,"srid"?: number | null,"type"?: string | null
                         }
                        Update: {
                           "coord_dimension"?: number | null,"f_geometry_column"?: unknown,"f_table_catalog"?: string | null,"f_table_name"?: unknown,"f_table_schema"?: unknown,"srid"?: number | null,"type"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_postgis_deprecate":
{ Args: { "newname": string,"oldname": string,"version": string }; Returns: undefined
                           },
"_postgis_index_extent":
{ Args: { "col": string,"tbl": unknown }; Returns: unknown
                           },
"_postgis_pgsql_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_postgis_scripts_pgsql_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_postgis_selectivity":
{ Args: { "att_name": string,"geom": unknown,"mode"?: string,"tbl": unknown }; Returns: number
                           },
"_postgis_stats":
{ Args: { ""?: string,"att_name": string,"tbl": unknown }; Returns: string
                           },
"_st_3dintersects":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_contains":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_containsproperly":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_coveredby":
{ Args: { "geog1": unknown,"geog2": unknown }; Returns: boolean
                           } |
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_covers":
{ Args: { "geog1": unknown,"geog2": unknown }; Returns: boolean
                           } |
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_crosses":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_dwithin":
{ Args: { "geog1": unknown,"geog2": unknown,"tolerance": number,"use_spheroid"?: boolean }; Returns: boolean
                           },
"_st_equals":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_intersects":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_linecrossingdirection":
{ Args: { "line1": unknown,"line2": unknown }; Returns: number
                           },
"_st_longestline":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"_st_maxdistance":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"_st_orderingequals":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_overlaps":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_sortablehash":
{ Args: { "geom": unknown }; Returns: number
                           },
"_st_touches":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"_st_voronoi":
{ Args: { "clip"?: unknown,"g1": unknown,"return_polygons"?: boolean,"tolerance"?: number }; Returns: unknown
                           },
"_st_within":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"aadhaar_send_otp":
{ Args: { "_aadhaar": string }; Returns: Json
                           },
"aadhaar_verify_otp":
{ Args: { "_otp": string }; Returns: Json
                           },
"addauth":
{ Args: { "": string }; Returns: boolean
                           },
"addgeometrycolumn":
{ Args: { "catalog_name": string,"column_name": string,"new_dim": number,"new_srid_in": number,"new_type": string,"schema_name": string,"table_name": string,"use_typmod"?: boolean }; Returns: string
                           } |
{ Args: { "column_name": string,"new_dim": number,"new_srid": number,"new_type": string,"schema_name": string,"table_name": string,"use_typmod"?: boolean }; Returns: string
                           } |
{ Args: { "column_name": string,"new_dim": number,"new_srid": number,"new_type": string,"table_name": string,"use_typmod"?: boolean }; Returns: string
                           },
"admin_audit_log":
{ Args: { "_limit"?: number }; Returns: {
              "action": string,"actor_name": string,"created_at": string,"data": Json,"id": number,"note": string,"target": string,"target_name": string
            }[]
                           },
"admin_decide_worker":
{ Args: { "_decision": string,"_note"?: string,"_worker": string }; Returns: string
                           },
"admin_delete_rate":
{ Args: { "_mode": string,"_node": string }; Returns: undefined
                           },
"admin_moderate":
{ Args: { "_action": string,"_days"?: number,"_note": string,"_worker": string }; Returns: Json
                           },
"admin_moderation":
{ Args: Record<PropertyKey, never>; Returns: {
              "block_reason": string,"blocked": boolean,"blocked_until": string,"display_name": string,"flag_active": boolean,"flag_good_needed": number,"flag_reason": string,"id": string,"negatives": number,"node_name": Json,"photo_url": string,"primary_node": string,"rating": number,"recent": Json,"reviews": number
            }[]
                           },
"admin_payments":
{ Args: { "_limit"?: number }; Returns: {
              "amount_paise": number,"bonus": number,"created_at": string,"credits": number,"events": number,"failure_reason": string,"id": string,"pack_id": string,"provider": string,"provider_order_id": string,"provider_payment_id": string,"refund_note": string,"status": string,"user_name": string
            }[]
                           },
"admin_payout_accounts":
{ Args: Record<PropertyKey, never>; Returns: {
              "account_mask": string,"cooling_until": string,"duplicate": boolean,"failure_reason": string,"flag_active": boolean,"ifsc": string,"kind": string,"payout_hold": boolean,"registered_name": string,"status": string,"worker_name": string,"worker_user_id": string
            }[]
                           },
"admin_payout_approve":
{ Args: { "_id": string }; Returns: string
                           },
"admin_payout_decide":
{ Args: { "_id": string,"_note": string,"_paid": boolean,"_reference": string }; Returns: string
                           },
"admin_payout_hold":
{ Args: { "_hold": boolean,"_user": string }; Returns: boolean
                           },
"admin_payout_pause":
{ Args: { "_paused": boolean }; Returns: boolean
                           },
"admin_payout_release_cooling":
{ Args: { "_user": string }; Returns: string
                           },
"admin_payout_run":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_payouts":
{ Args: { "_status"?: string }; Returns: {
              "account_mask": string,"account_status": string,"admin_note": string,"amount": number,"attempt_count": number,"decided_at": string,"failure_reason": string,"flag_active": boolean,"id": string,"items": number,"payout_hold": boolean,"provider": string,"reference": string,"requested_at": string,"review_reason": string,"status": string,"worker_name": string,"worker_user_id": string
            }[]
                           },
"admin_rate_cards":
{ Args: Record<PropertyKey, never>; Returns: {
              "band_max": number,"band_min": number,"credits_per_min": number,"depth": number,"min_minutes": number,"mode": string,"node_name": Json,"node_slug": string,"updated_at": string
            }[]
                           },
"admin_refund":
{ Args: { "_id": string,"_note": string }; Returns: Json
                           },
"admin_set_rate":
{ Args: { "_min": number,"_mode": string,"_node": string,"_rate": number }; Returns: undefined
                           },
"admin_upsert_pack":
{ Args: { "_active": boolean,"_bonus": number,"_credits": number,"_id": string,"_name": Json,"_popular": boolean,"_price": number,"_sort": number }; Returns: undefined
                           },
"admin_worker_queue":
{ Args: { "_status"?: string }; Returns: {
              "aadhaar_masked": string,"aadhaar_verified": boolean,"about": string,"display_name": string,"district_slug": string,"docs": Json,"email": string,"id": string,"node_name": Json,"phone": string,"photo_url": string,"primary_node": string,"reg_data": Json,"status": string,"submitted_at": string,"years_experience": number
            }[]
                           },
"call_answer":
{ Args: { "_accept": boolean,"_call": string }; Returns: string
                           },
"call_end":
{ Args: { "_call": string }; Returns: string
                           },
"call_start":
{ Args: { "_mode": string,"_sid": string }; Returns: string
                           },
"commission_for":
{ Args: { "_node": string,"_worker": string }; Returns: number
                           },
"dev_grant_test_credits":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"disablelongtransactions":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dropgeometrycolumn":
{ Args: { "catalog_name": string,"column_name": string,"schema_name": string,"table_name": string }; Returns: string
                           } |
{ Args: { "column_name": string,"schema_name": string,"table_name": string }; Returns: string
                           } |
{ Args: { "column_name": string,"table_name": string }; Returns: string
                           },
"dropgeometrytable":
{ Args: { "catalog_name": string,"schema_name": string,"table_name": string }; Returns: string
                           } |
{ Args: { "schema_name": string,"table_name": string }; Returns: string
                           } |
{ Args: { "table_name": string }; Returns: string
                           },
"enablelongtransactions":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"equals":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"feedback_config":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"feedback_submit":
{ Args: { "_comment"?: string,"_complaint"?: boolean,"_complaint_reason"?: string,"_rating": number,"_sid": string,"_tags"?: (string)[] }; Returns: Json
                           },
"geometry":
{ Args: { "": string }; Returns: unknown
                           },
"geometry_above":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_below":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_cmp":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"geometry_contained_3d":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_contains":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_contains_3d":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_distance_box":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"geometry_distance_centroid":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"geometry_eq":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_ge":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_gt":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_le":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_left":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_lt":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_overabove":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_overbelow":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_overlaps":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_overlaps_3d":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_overleft":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_overright":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_right":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_same":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_same_3d":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geometry_within":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"geomfromewkt":
{ Args: { "": string }; Returns: unknown
                           },
"gettransactionid":
{ Args: Record<PropertyKey, never>; Returns: unknown
                           },
"has_role":
{ Args: { "_role": Database["public"]['Enums']["user_role"],"_uid": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_session_party":
{ Args: { "_sid": string }; Returns: boolean
                           },
"kyc_mode":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"longtransactionsenabled":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_active_session":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_current_location":
{ Args: Record<PropertyKey, never>; Returns: {
              "area_id": number,"area_name": string,"area_name_ta": string,"district_name": Json,"district_slug": string,"id": string,"lat": number,"lng": number,"source": string
            }[]
                           },
"my_earnings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_feedback":
{ Args: { "_sid": string }; Returns: Json
                           },
"my_history":
{ Args: Record<PropertyKey, never>; Returns: {
              "category_name": Json,"credits": number,"duration_sec": number,"earned": number,"end_reason": string,"ended_at": string,"id": string,"messages": number,"modes": (string)[],"node_name": Json,"node_slug": string,"other_name": string,"other_photo": string,"role": string,"started_at": string,"status": string
            }[]
                           },
"my_kyc":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_locations":
{ Args: Record<PropertyKey, never>; Returns: {
              "address": string,"area_id": number,"area_name": string,"area_name_ta": string,"created_at": string,"district_name": Json,"district_slug": string,"id": string,"is_current": boolean,"lat": number,"lng": number
            }[]
                           },
"my_wallet":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_wallet_ledger":
{ Args: { "_limit"?: number }; Returns: {
              "amount": number,"created_at": string,"description": string,"id": string,"reference_id": string,"type": string
            }[]
                           },
"my_worker":
{ Args: Record<PropertyKey, never>; Returns: {
              "about": string | null,
"base_geog": unknown,
"block_reason": string | null,
"blocked_until": string | null,
"category": Database["public"]['Enums']["worker_category"],
"created_at": string,
"decided_at": string | null,
"display_name": string | null,
"district_slug": string | null,
"flag_active": boolean,
"flag_good_needed": number,
"flag_reason": string | null,
"flagged_at": string | null,
"hourly_rate": number | null,
"id": string,
"is_active": boolean,
"is_online": boolean,
"is_verified": boolean,
"last_seen_at": string | null,
"locked_category": string | null,
"occupation_id": string | null,
"photo_url": string | null,
"primary_node": string | null,
"rating": number | null,
"reg_data": NonNullable<Json>,
"review_note": string | null,
"rewards_count": number,
"status": string,
"strikes_reset_at": string,
"submitted_at": string | null,
"total_reviews": number | null,
"updated_at": string,
"user_id": string,
"years_experience": number | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "workers"
        isOneToOne: false
        isSetofReturn: true
      } },
"my_worker_standing":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"nearest_location":
{ Args: { "_lat": number,"_lng": number }; Returns: {
              "area_id": number,"area_name": string,"area_name_ta": string,"distance_km": number,"district_name": Json,"district_slug": string
            }[]
                           },
"node_category":
{ Args: { "_slug": string }; Returns: string
                           },
"node_requirements_for":
{ Args: { "_slug": string }; Returns: Json
                           },
"payment_event_once":
{ Args: { "_event_id": string,"_payload": Json,"_provider": string,"_provider_order_id": string,"_type": string }; Returns: boolean
                           },
"payment_event_outcome":
{ Args: { "_event_id": string,"_outcome": string }; Returns: undefined
                           },
"payment_mark_failed":
{ Args: { "_provider_order_id": string,"_reason": string }; Returns: string
                           },
"payment_mark_paid":
{ Args: { "_payment_id": string,"_provider_order_id": string,"_source": string }; Returns: Json
                           },
"payment_order_attach":
{ Args: { "_id": string,"_provider_order_id": string }; Returns: undefined
                           },
"payment_order_cancel":
{ Args: { "_id": string }; Returns: string
                           },
"payment_order_new":
{ Args: { "_pack": string,"_provider": string }; Returns: Json
                           },
"payments_config":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"payments_mock_enabled":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"payout_request":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"populate_geometry_columns":
{ Args: { "tbl_oid": unknown,"use_typmod"?: boolean }; Returns: number
                           } |
{ Args: { "use_typmod"?: boolean }; Returns: string
                           },
"postgis_constraint_dims":
{ Args: { "geomcolumn": string,"geomschema": string,"geomtable": string }; Returns: number
                           },
"postgis_constraint_srid":
{ Args: { "geomcolumn": string,"geomschema": string,"geomtable": string }; Returns: number
                           },
"postgis_constraint_type":
{ Args: { "geomcolumn": string,"geomschema": string,"geomtable": string }; Returns: string
                           },
"postgis_extensions_upgrade":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_full_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_geos_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_lib_build_date":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_lib_revision":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_lib_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_libjson_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_liblwgeom_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_libprotobuf_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_libxml_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_proj_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_scripts_build_date":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_scripts_installed":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_scripts_released":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_svn_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_type_name":
{ Args: { "coord_dimension": number,"geomname": string,"use_new_name"?: boolean }; Returns: string
                           },
"postgis_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"postgis_wagyu_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"presence_window":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"rate_for":
{ Args: { "_mode": string,"_node": string }; Returns: {
              "credits_per_min": number,"min_minutes": number,"node_slug": string
            }[]
                           },
"rates_for":
{ Args: { "_node": string }; Returns: Json
                           },
"request_cancel":
{ Args: { "_id": string }; Returns: undefined
                           },
"request_create":
{ Args: { "_mode": string,"_node"?: string,"_worker": string }; Returns: string
                           },
"request_expire_due":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"request_respond":
{ Args: { "_accept": boolean,"_id": string }; Returns: string
                           },
"search_workers":
{ Args: { "_all"?: boolean,"_lat": number,"_limit"?: number,"_lng": number,"_node": string,"_radius_km"?: number }; Returns: {
              "badges": Json,"display_name": string,"distance_km": number,"district_name": Json,"district_slug": string,"feedback_count": number,"id": string,"is_busy": boolean,"is_online": boolean,"photo_url": string,"primary_node": string,"rates": Json,"rating": number,"rewards_count": number,"specialty": Json,"years_experience": number
            }[]
                           },
"session_bill_internal":
{ Args: { "_close": boolean,"_sid": string }; Returns: Json
                           },
"session_end":
{ Args: { "_reason"?: string,"_sid": string }; Returns: Json
                           },
"session_info":
{ Args: { "_sid": string }; Returns: Json
                           },
"session_switch_mode":
{ Args: { "_mode": string,"_sid": string }; Returns: undefined
                           },
"session_tick":
{ Args: { "_sid": string }; Returns: Json
                           },
"set_current_location":
{ Args: { "_address"?: string,"_area"?: number,"_district"?: string,"_lat": number,"_lng": number,"_source": string }; Returns: string
                           },
"setting":
{ Args: { "_k": string }; Returns: Json
                           },
"setting_num":
{ Args: { "_d": number,"_k": string }; Returns: number
                           },
"st_3dclosestpoint":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_3ddistance":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_3dintersects":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_3dlongestline":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_3dmakebox":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_3dmaxdistance":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_3dshortestline":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_addpoint":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_angle":
{ Args: { "line1": unknown,"line2": unknown }; Returns: number
                           } |
{ Args: { "pt1": unknown,"pt2": unknown,"pt3": unknown,"pt4"?: unknown }; Returns: number
                           },
"st_area":
{ Args: { "geog": unknown,"use_spheroid"?: boolean }; Returns: number
                           } |
{ Args: { "": string }; Returns: number
                           },
"st_asencodedpolyline":
{ Args: { "geom": unknown,"nprecision"?: number }; Returns: string
                           },
"st_asewkt":
{ Args: { "": string }; Returns: string
                           },
"st_asgeojson":
{ Args: { "geog": unknown,"maxdecimaldigits"?: number,"options"?: number }; Returns: string
                           } |
{ Args: { "geom": unknown,"maxdecimaldigits"?: number,"options"?: number }; Returns: string
                           } |
{ Args: { "geom_column"?: string,"maxdecimaldigits"?: number,"pretty_bool"?: boolean,"r": Record<string, unknown> }; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           },
"st_asgml":
{ Args: { "geog": unknown,"id"?: string,"maxdecimaldigits"?: number,"nprefix"?: string,"options"?: number }; Returns: string
                           } |
{ Args: { "geom": unknown,"maxdecimaldigits"?: number,"options"?: number }; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           } |
{ Args: { "geog": unknown,"id"?: string,"maxdecimaldigits"?: number,"nprefix"?: string,"options"?: number,"version": number }; Returns: string
                           } |
{ Args: { "geom": unknown,"id"?: string,"maxdecimaldigits"?: number,"nprefix"?: string,"options"?: number,"version": number }; Returns: string
                           },
"st_askml":
{ Args: { "geog": unknown,"maxdecimaldigits"?: number,"nprefix"?: string }; Returns: string
                           } |
{ Args: { "geom": unknown,"maxdecimaldigits"?: number,"nprefix"?: string }; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           },
"st_aslatlontext":
{ Args: { "geom": unknown,"tmpl"?: string }; Returns: string
                           },
"st_asmarc21":
{ Args: { "format"?: string,"geom": unknown }; Returns: string
                           },
"st_asmvtgeom":
{ Args: { "bounds": unknown,"buffer"?: number,"clip_geom"?: boolean,"extent"?: number,"geom": unknown }; Returns: unknown
                           },
"st_assvg":
{ Args: { "geog": unknown,"maxdecimaldigits"?: number,"rel"?: number }; Returns: string
                           } |
{ Args: { "geom": unknown,"maxdecimaldigits"?: number,"rel"?: number }; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           },
"st_astext":
{ Args: { "": string }; Returns: string
                           },
"st_astwkb":
{ Args: { "geom": unknown,"prec"?: number,"prec_m"?: number,"prec_z"?: number,"with_boxes"?: boolean,"with_sizes"?: boolean }; Returns: string
                           } |
{ Args: { "geom": (unknown)[],"ids": (number)[],"prec"?: number,"prec_m"?: number,"prec_z"?: number,"with_boxes"?: boolean,"with_sizes"?: boolean }; Returns: string
                           },
"st_asx3d":
{ Args: { "geom": unknown,"maxdecimaldigits"?: number,"options"?: number }; Returns: string
                           },
"st_azimuth":
{ Args: { "geog1": unknown,"geog2": unknown }; Returns: number
                           } |
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_boundingdiagonal":
{ Args: { "fits"?: boolean,"geom": unknown }; Returns: unknown
                           },
"st_buffer":
{ Args: { "geom": unknown,"options"?: string,"radius": number }; Returns: unknown
                           } |
{ Args: { "geom": unknown,"quadsegs": number,"radius": number }; Returns: unknown
                           },
"st_centroid":
{ Args: { "": string }; Returns: unknown
                           },
"st_clipbybox2d":
{ Args: { "box": unknown,"geom": unknown }; Returns: unknown
                           },
"st_closestpoint":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_collect":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_concavehull":
{ Args: { "param_allow_holes"?: boolean,"param_geom": unknown,"param_pctconvex": number }; Returns: unknown
                           },
"st_contains":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_containsproperly":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_coorddim":
{ Args: { "geometry": unknown }; Returns: number
                           },
"st_coveredby":
{ Args: { "geog1": unknown,"geog2": unknown }; Returns: boolean
                           } |
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_covers":
{ Args: { "geog1": unknown,"geog2": unknown }; Returns: boolean
                           } |
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_crosses":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_curvetoline":
{ Args: { "flags"?: number,"geom": unknown,"tol"?: number,"toltype"?: number }; Returns: unknown
                           },
"st_delaunaytriangles":
{ Args: { "flags"?: number,"g1": unknown,"tolerance"?: number }; Returns: unknown
                           },
"st_difference":
{ Args: { "geom1": unknown,"geom2": unknown,"gridsize"?: number }; Returns: unknown
                           },
"st_disjoint":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_distance":
{ Args: { "geog1": unknown,"geog2": unknown,"use_spheroid"?: boolean }; Returns: number
                           } |
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_distancesphere":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           } |
{ Args: { "geom1": unknown,"geom2": unknown,"radius": number }; Returns: number
                           },
"st_distancespheroid":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_dwithin":
{ Args: { "geog1": unknown,"geog2": unknown,"tolerance": number,"use_spheroid"?: boolean }; Returns: boolean
                           },
"st_equals":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_expand":
{ Args: { "box": unknown,"dx": number,"dy": number }; Returns: unknown
                           } |
{ Args: { "box": unknown,"dx": number,"dy": number,"dz"?: number }; Returns: unknown
                           } |
{ Args: { "dm"?: number,"dx": number,"dy": number,"dz"?: number,"geom": unknown }; Returns: unknown
                           },
"st_force3d":
{ Args: { "geom": unknown,"zvalue"?: number }; Returns: unknown
                           },
"st_force3dm":
{ Args: { "geom": unknown,"mvalue"?: number }; Returns: unknown
                           },
"st_force3dz":
{ Args: { "geom": unknown,"zvalue"?: number }; Returns: unknown
                           },
"st_force4d":
{ Args: { "geom": unknown,"mvalue"?: number,"zvalue"?: number }; Returns: unknown
                           },
"st_generatepoints":
{ Args: { "area": unknown,"npoints": number }; Returns: unknown
                           } |
{ Args: { "area": unknown,"npoints": number,"seed": number }; Returns: unknown
                           },
"st_geogfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_geographyfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_geohash":
{ Args: { "geog": unknown,"maxchars"?: number }; Returns: string
                           } |
{ Args: { "geom": unknown,"maxchars"?: number }; Returns: string
                           },
"st_geomcollfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_geometricmedian":
{ Args: { "fail_if_not_converged"?: boolean,"g": unknown,"max_iter"?: number,"tolerance"?: number }; Returns: unknown
                           },
"st_geometryfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_geomfromewkt":
{ Args: { "": string }; Returns: unknown
                           },
"st_geomfromgeojson":
{ Args: { "": Json }; Returns: unknown
                           } |
{ Args: { "": Json }; Returns: unknown
                           } |
{ Args: { "": string }; Returns: unknown
                           },
"st_geomfromgml":
{ Args: { "": string }; Returns: unknown
                           },
"st_geomfromkml":
{ Args: { "": string }; Returns: unknown
                           },
"st_geomfrommarc21":
{ Args: { "marc21xml": string }; Returns: unknown
                           },
"st_geomfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_gmltosql":
{ Args: { "": string }; Returns: unknown
                           },
"st_hasarc":
{ Args: { "geometry": unknown }; Returns: boolean
                           },
"st_hausdorffdistance":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_hexagon":
{ Args: { "cell_i": number,"cell_j": number,"origin"?: unknown,"size": number }; Returns: unknown
                           },
"st_hexagongrid":
{ Args: { "bounds": unknown,"size": number }; Returns: Record<string, unknown>[]
                           },
"st_interpolatepoint":
{ Args: { "line": unknown,"point": unknown }; Returns: number
                           },
"st_intersection":
{ Args: { "geom1": unknown,"geom2": unknown,"gridsize"?: number }; Returns: unknown
                           },
"st_intersects":
{ Args: { "geog1": unknown,"geog2": unknown }; Returns: boolean
                           } |
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_isvaliddetail":
{ Args: { "flags"?: number,"geom": unknown }; Returns: Database["public"]['CompositeTypes']["valid_detail"]
                          SetofOptions: {
        from: "*"
        to: "valid_detail"
        isOneToOne: true
        isSetofReturn: false
      } },
"st_length":
{ Args: { "geog": unknown,"use_spheroid"?: boolean }; Returns: number
                           } |
{ Args: { "": string }; Returns: number
                           },
"st_letters":
{ Args: { "font"?: Json,"letters": string }; Returns: unknown
                           },
"st_linecrossingdirection":
{ Args: { "line1": unknown,"line2": unknown }; Returns: number
                           },
"st_linefromencodedpolyline":
{ Args: { "nprecision"?: number,"txtin": string }; Returns: unknown
                           },
"st_linefromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_linelocatepoint":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_linetocurve":
{ Args: { "geometry": unknown }; Returns: unknown
                           },
"st_locatealong":
{ Args: { "geometry": unknown,"leftrightoffset"?: number,"measure": number }; Returns: unknown
                           },
"st_locatebetween":
{ Args: { "frommeasure": number,"geometry": unknown,"leftrightoffset"?: number,"tomeasure": number }; Returns: unknown
                           },
"st_locatebetweenelevations":
{ Args: { "fromelevation": number,"geometry": unknown,"toelevation": number }; Returns: unknown
                           },
"st_longestline":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_makebox2d":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_makeline":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_makevalid":
{ Args: { "geom": unknown,"params": string }; Returns: unknown
                           },
"st_maxdistance":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: number
                           },
"st_minimumboundingcircle":
{ Args: { "inputgeom": unknown,"segs_per_quarter"?: number }; Returns: unknown
                           },
"st_mlinefromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_mpointfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_mpolyfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_multilinestringfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_multipointfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_multipolygonfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_node":
{ Args: { "g": unknown }; Returns: unknown
                           },
"st_normalize":
{ Args: { "geom": unknown }; Returns: unknown
                           },
"st_offsetcurve":
{ Args: { "distance": number,"line": unknown,"params"?: string }; Returns: unknown
                           },
"st_orderingequals":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_overlaps":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_perimeter":
{ Args: { "geog": unknown,"use_spheroid"?: boolean }; Returns: number
                           },
"st_pointfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_pointm":
{ Args: { "mcoordinate": number,"srid"?: number,"xcoordinate": number,"ycoordinate": number }; Returns: unknown
                           },
"st_pointz":
{ Args: { "srid"?: number,"xcoordinate": number,"ycoordinate": number,"zcoordinate": number }; Returns: unknown
                           },
"st_pointzm":
{ Args: { "mcoordinate": number,"srid"?: number,"xcoordinate": number,"ycoordinate": number,"zcoordinate": number }; Returns: unknown
                           },
"st_polyfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_polygonfromtext":
{ Args: { "": string }; Returns: unknown
                           },
"st_project":
{ Args: { "azimuth": number,"distance": number,"geog": unknown }; Returns: unknown
                           },
"st_quantizecoordinates":
{ Args: { "g": unknown,"prec_m"?: number,"prec_x": number,"prec_y"?: number,"prec_z"?: number }; Returns: unknown
                           },
"st_reduceprecision":
{ Args: { "geom": unknown,"gridsize": number }; Returns: unknown
                           },
"st_relate":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: string
                           },
"st_removerepeatedpoints":
{ Args: { "geom": unknown,"tolerance"?: number }; Returns: unknown
                           },
"st_segmentize":
{ Args: { "geog": unknown,"max_segment_length": number }; Returns: unknown
                           },
"st_setsrid":
{ Args: { "geog": unknown,"srid": number }; Returns: unknown
                           } |
{ Args: { "geom": unknown,"srid": number }; Returns: unknown
                           },
"st_sharedpaths":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_shortestline":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_simplifypolygonhull":
{ Args: { "geom": unknown,"is_outer"?: boolean,"vertex_fraction": number }; Returns: unknown
                           },
"st_split":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_square":
{ Args: { "cell_i": number,"cell_j": number,"origin"?: unknown,"size": number }; Returns: unknown
                           },
"st_squaregrid":
{ Args: { "bounds": unknown,"size": number }; Returns: Record<string, unknown>[]
                           },
"st_srid":
{ Args: { "geog": unknown }; Returns: number
                           } |
{ Args: { "geom": unknown }; Returns: number
                           },
"st_subdivide":
{ Args: { "geom": unknown,"gridsize"?: number,"maxvertices"?: number }; Returns: unknown[]
                           },
"st_swapordinates":
{ Args: { "geom": unknown,"ords": unknown }; Returns: unknown
                           },
"st_symdifference":
{ Args: { "geom1": unknown,"geom2": unknown,"gridsize"?: number }; Returns: unknown
                           },
"st_symmetricdifference":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           },
"st_tileenvelope":
{ Args: { "bounds"?: unknown,"margin"?: number,"x": number,"y": number,"zoom": number }; Returns: unknown
                           },
"st_touches":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_transform":
{ Args: { "from_proj": string,"geom": unknown,"to_proj": string }; Returns: unknown
                           } |
{ Args: { "from_proj": string,"geom": unknown,"to_srid": number }; Returns: unknown
                           } |
{ Args: { "geom": unknown,"to_proj": string }; Returns: unknown
                           },
"st_triangulatepolygon":
{ Args: { "g1": unknown }; Returns: unknown
                           },
"st_union":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: unknown
                           } |
{ Args: { "geom1": unknown,"geom2": unknown,"gridsize": number }; Returns: unknown
                           },
"st_voronoilines":
{ Args: { "extend_to"?: unknown,"g1": unknown,"tolerance"?: number }; Returns: unknown
                           },
"st_voronoipolygons":
{ Args: { "extend_to"?: unknown,"g1": unknown,"tolerance"?: number }; Returns: unknown
                           },
"st_within":
{ Args: { "geom1": unknown,"geom2": unknown }; Returns: boolean
                           },
"st_wkbtosql":
{ Args: { "wkb": string }; Returns: unknown
                           },
"st_wkttosql":
{ Args: { "": string }; Returns: unknown
                           },
"st_wrapx":
{ Args: { "geom": unknown,"move": number,"wrap": number }; Returns: unknown
                           },
"trusted":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"unlockrows":
{ Args: { "": string }; Returns: number
                           },
"updategeometrysrid":
{ Args: { "catalogn_name": string,"column_name": string,"new_srid_in": number,"schema_name": string,"table_name": string }; Returns: string
                           },
"use_saved_location":
{ Args: { "_id": string }; Returns: undefined
                           },
"wallet_id_for":
{ Args: { "_uid": string }; Returns: string
                           },
"worker_heartbeat":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"worker_is_blocked":
{ Args: { "_w": Omit<Database["public"]['Tables']["workers"]['Row'], Database["public"]['Tables']["workers"]['ComputedFields']> }; Returns: boolean
                           },
"worker_public":
{ Args: { "_id": string }; Returns: Json
                           },
"worker_refresh":
{ Args: { "_wid": string }; Returns: (string)[]
                           },
"worker_register":
{ Args: { "_about": string,"_display_name": string,"_extra_nodes": (string)[],"_node": string,"_reg": Json,"_years": number }; Returns: string
                           },
"worker_register_guard":
{ Args: { "_node": string }; Returns: undefined
                           },
"worker_set_online":
{ Args: { "_online": boolean }; Returns: boolean
                           },
"worker_stats":
{ Args: { "_wid": string }; Returns: {
              "avg_rating": number,"five_stars": number,"reviews": number,"sessions_served": number,"streak": number,"users_served": number
            }[]
                           },
"worker_submit":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"verification_liveness_challenge":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"verification_stage_qr":
{ Args: { "_path": string }; Returns: string
                           },
"verification_stage_selfie":
{ Args: { "_raw_path": string; "_public_url": string; "_consent": boolean; "_did_challenge": boolean }; Returns: string
                           },
"my_verification":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"verification_appeal":
{ Args: { "_note": string }; Returns: string
                           }
          }
          Enums: {
            "kyc_status": "pending"|"under_review"|"verified"|"rejected","payment_methodology": "per_session"|"task_based"|"free_service"|"hybrid","payment_status": "pending"|"authorized"|"completed"|"refunded"|"failed","request_status": "pending"|"accepted"|"rejected"|"in_progress"|"completed"|"cancelled","transaction_type": "credit"|"debit"|"refund"|"payout"|"top_up","user_role": "user"|"worker"|"admin","worker_category": "professional"|"skilled"|"freelancer"|"educator"
          }
          CompositeTypes: {
            "geometry_dump": {
                        "path": (number)[] | null,"geom": unknown
                      },"valid_detail": {
                        "valid": boolean | null,"reason": string | null,"location": unknown
                      }
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "kyc_status": ["pending", "under_review", "verified", "rejected"],"payment_methodology": ["per_session", "task_based", "free_service", "hybrid"],"payment_status": ["pending", "authorized", "completed", "refunded", "failed"],"request_status": ["pending", "accepted", "rejected", "in_progress", "completed", "cancelled"],"transaction_type": ["credit", "debit", "refund", "payout", "top_up"],"user_role": ["user", "worker", "admin"],"worker_category": ["professional", "skilled", "freelancer", "educator"]
          }
        }
} as const
