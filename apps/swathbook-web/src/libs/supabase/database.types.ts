
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "booking_attachments": {
                  Row: {
                    "booking_id": string,"business_id": string,"caption": string | null,"content_type": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["attachment_kind"],"size_bytes": number | null,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"business_id": string,"caption"?: string | null,"content_type"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["attachment_kind"],"size_bytes"?: number | null,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "booking_id"?: string,"business_id"?: string,"caption"?: string | null,"content_type"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["attachment_kind"],"size_bytes"?: number | null,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_attachments_business_id_booking_id_fkey"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"booking_events": {
                  Row: {
                    "actor_id": string | null,"booking_id": string,"business_id": string,"created_at": string,"data": NonNullable<Json>,"event_type": string,"from_status": Database["public"]['Enums']["booking_status"] | null,"id": number,"to_status": Database["public"]['Enums']["booking_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"booking_id": string,"business_id": string,"created_at"?: string,"data"?: NonNullable<Json>,"event_type": string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: never,"to_status"?: Database["public"]['Enums']["booking_status"] | null
                  }
                  Update: {
                    "actor_id"?: string | null,"booking_id"?: string,"business_id"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"event_type"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: never,"to_status"?: Database["public"]['Enums']["booking_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_events_business_id_booking_id_fkey"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"booking_items": {
                  Row: {
                    "booking_id": string,"business_id": string,"created_at": string,"description": string | null,"duration_minutes": number | null,"id": string,"line_total_cents": number | null,"name": string,"quantity": number,"service_id": string | null,"sort_order": number,"unit_price_cents": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"business_id": string,"created_at"?: string,"description"?: string | null,"duration_minutes"?: number | null,"id"?: string,"line_total_cents"?: never,"name": string,"quantity"?: number,"service_id"?: string | null,"sort_order"?: number,"unit_price_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "booking_id"?: string,"business_id"?: string,"created_at"?: string,"description"?: string | null,"duration_minutes"?: number | null,"id"?: string,"line_total_cents"?: never,"name"?: string,"quantity"?: number,"service_id"?: string | null,"sort_order"?: number,"unit_price_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_items_business_id_booking_id_fkey"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "booking_items_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "address_id": string | null,"amount_paid_cents": number,"amount_refunded_cents": number,"assigned_member_id": string | null,"balance_due_cents": number | null,"business_id": string,"cancel_request_reason": string | null,"cancel_requested_at": string | null,"cancellation_reason": string | null,"cancelled_at": string | null,"completed_at": string | null,"confirmed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"customer_id": string,"customer_notes": string | null,"customer_reschedule_count": number,"deposit_due_cents": number,"deposit_paid_cents": number,"discount_cents": number,"hold_expires_at": string | null,"id": string,"internal_notes": string | null,"public_token": string,"recurring_series_id": string | null,"reference": string,"scheduled_end": string,"scheduled_range": unknown,"scheduled_start": string,"source": Database["public"]['Enums']["booking_source"],"started_at": string | null,"status": Database["public"]['Enums']["booking_status"],"subtotal_cents": number,"tax_cents": number,"tip_cents": number,"total_cents": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_id"?: string | null,"amount_paid_cents"?: number,"amount_refunded_cents"?: number,"assigned_member_id"?: string | null,"balance_due_cents"?: never,"business_id": string,"cancel_request_reason"?: string | null,"cancel_requested_at"?: string | null,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"completed_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_id": string,"customer_notes"?: string | null,"customer_reschedule_count"?: number,"deposit_due_cents"?: number,"deposit_paid_cents"?: number,"discount_cents"?: number,"hold_expires_at"?: string | null,"id"?: string,"internal_notes"?: string | null,"public_token"?: string,"recurring_series_id"?: string | null,"reference"?: string,"scheduled_end": string,"scheduled_range"?: never,"scheduled_start": string,"source"?: Database["public"]['Enums']["booking_source"],"started_at"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"subtotal_cents"?: number,"tax_cents"?: number,"tip_cents"?: number,"total_cents"?: never,"updated_at"?: string
                  }
                  Update: {
                    "address_id"?: string | null,"amount_paid_cents"?: number,"amount_refunded_cents"?: number,"assigned_member_id"?: string | null,"balance_due_cents"?: never,"business_id"?: string,"cancel_request_reason"?: string | null,"cancel_requested_at"?: string | null,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"completed_at"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"customer_id"?: string,"customer_notes"?: string | null,"customer_reschedule_count"?: number,"deposit_due_cents"?: number,"deposit_paid_cents"?: number,"discount_cents"?: number,"hold_expires_at"?: string | null,"id"?: string,"internal_notes"?: string | null,"public_token"?: string,"recurring_series_id"?: string | null,"reference"?: string,"scheduled_end"?: string,"scheduled_range"?: never,"scheduled_start"?: string,"source"?: Database["public"]['Enums']["booking_source"],"started_at"?: string | null,"status"?: Database["public"]['Enums']["booking_status"],"subtotal_cents"?: number,"tax_cents"?: number,"tip_cents"?: number,"total_cents"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_business_id_address_id_fkey"
      columns: ["business_id","address_id"]
isOneToOne: false
      referencedRelation: "customer_addresses"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_business_id_assigned_member_id_fkey"
      columns: ["business_id","assigned_member_id"]
isOneToOne: false
      referencedRelation: "business_members"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_business_id_recurring_series_id_fkey"
      columns: ["business_id","recurring_series_id"]
isOneToOne: false
      referencedRelation: "recurring_series"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"business_hours": {
                  Row: {
                    "business_id": string,"closes_at": string,"opens_at": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"closes_at": string,"opens_at": string,"weekday": number
                  }
                  Update: {
                    "business_id"?: string,"closes_at"?: string,"opens_at"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_hours_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"business_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"business_id": string,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["member_role"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"business_id": string,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"business_id"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_invitations_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"business_members": {
                  Row: {
                    "business_id": string,"calendar_color": string | null,"created_at": string,"display_name": string | null,"id": string,"is_bookable": boolean,"role": Database["public"]['Enums']["member_role"],"status": Database["public"]['Enums']["member_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"calendar_color"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_bookable"?: boolean,"role"?: Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"calendar_color"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_bookable"?: boolean,"role"?: Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"business_photos": {
                  Row: {
                    "business_id": string,"caption": string | null,"created_at": string,"id": string,"sort_order": number,"storage_path": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"caption"?: string | null,"created_at"?: string,"id"?: string,"sort_order"?: number,"storage_path": string,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"caption"?: string | null,"created_at"?: string,"id"?: string,"sort_order"?: number,"storage_path"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_photos_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "allow_customer_reschedule": boolean,"arrival_window_minutes": number,"auto_confirm": boolean,"base_address": string | null,"base_lat": number | null,"base_lng": number | null,"booking_lead_time_minutes": number,"booking_window_days": number,"brand_color": string | null,"buffer_minutes": number,"cancellation_window_hours": number,"cover_path": string | null,"created_at": string,"currency": string,"deposit_refund_policy": Database["public"]['Enums']["refund_policy"],"description": string | null,"email": string | null,"email_reminders_enabled": boolean,"id": string,"is_published": boolean,"logo_path": string | null,"name": string,"next_invoice_number": number,"onboarding_completed_at": string | null,"owner_id": string,"phone": string | null,"reminder_hours_before": number,"service_radius_miles": number | null,"slot_interval_minutes": number,"slug": string,"sms_reminders_enabled": boolean,"stripe_customer_id": string | null,"timezone": string,"trade": string,"trial_ends_at": string | null,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_customer_reschedule"?: boolean,"arrival_window_minutes"?: number,"auto_confirm"?: boolean,"base_address"?: string | null,"base_lat"?: number | null,"base_lng"?: number | null,"booking_lead_time_minutes"?: number,"booking_window_days"?: number,"brand_color"?: string | null,"buffer_minutes"?: number,"cancellation_window_hours"?: number,"cover_path"?: string | null,"created_at"?: string,"currency"?: string,"deposit_refund_policy"?: Database["public"]['Enums']["refund_policy"],"description"?: string | null,"email"?: string | null,"email_reminders_enabled"?: boolean,"id"?: string,"is_published"?: boolean,"logo_path"?: string | null,"name": string,"next_invoice_number"?: number,"onboarding_completed_at"?: string | null,"owner_id": string,"phone"?: string | null,"reminder_hours_before"?: number,"service_radius_miles"?: number | null,"slot_interval_minutes"?: number,"slug": string,"sms_reminders_enabled"?: boolean,"stripe_customer_id"?: string | null,"timezone"?: string,"trade": string,"trial_ends_at"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "allow_customer_reschedule"?: boolean,"arrival_window_minutes"?: number,"auto_confirm"?: boolean,"base_address"?: string | null,"base_lat"?: number | null,"base_lng"?: number | null,"booking_lead_time_minutes"?: number,"booking_window_days"?: number,"brand_color"?: string | null,"buffer_minutes"?: number,"cancellation_window_hours"?: number,"cover_path"?: string | null,"created_at"?: string,"currency"?: string,"deposit_refund_policy"?: Database["public"]['Enums']["refund_policy"],"description"?: string | null,"email"?: string | null,"email_reminders_enabled"?: boolean,"id"?: string,"is_published"?: boolean,"logo_path"?: string | null,"name"?: string,"next_invoice_number"?: number,"onboarding_completed_at"?: string | null,"owner_id"?: string,"phone"?: string | null,"reminder_hours_before"?: number,"service_radius_miles"?: number | null,"slot_interval_minutes"?: number,"slug"?: string,"sms_reminders_enabled"?: boolean,"stripe_customer_id"?: string | null,"timezone"?: string,"trade"?: string,"trial_ends_at"?: string | null,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"customer_addresses": {
                  Row: {
                    "access_notes": string | null,"business_id": string,"city": string | null,"country": string,"created_at": string,"customer_id": string,"formatted_address": string | null,"google_place_id": string | null,"id": string,"is_primary": boolean,"label": string | null,"lat": number | null,"line1": string,"line2": string | null,"lng": number | null,"postal_code": string | null,"region": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_notes"?: string | null,"business_id": string,"city"?: string | null,"country"?: string,"created_at"?: string,"customer_id": string,"formatted_address"?: string | null,"google_place_id"?: string | null,"id"?: string,"is_primary"?: boolean,"label"?: string | null,"lat"?: number | null,"line1": string,"line2"?: string | null,"lng"?: number | null,"postal_code"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "access_notes"?: string | null,"business_id"?: string,"city"?: string | null,"country"?: string,"created_at"?: string,"customer_id"?: string,"formatted_address"?: string | null,"google_place_id"?: string | null,"id"?: string,"is_primary"?: boolean,"label"?: string | null,"lat"?: number | null,"line1"?: string,"line2"?: string | null,"lng"?: number | null,"postal_code"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_addresses_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "business_id": string,"created_at": string,"email": string | null,"email_opt_in": boolean,"full_name": string,"id": string,"notes": string | null,"phone": string | null,"search_text": string | null,"sms_opt_in": boolean,"stripe_customer_id": string | null,"tags": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"email"?: string | null,"email_opt_in"?: boolean,"full_name": string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"search_text"?: never,"sms_opt_in"?: boolean,"stripe_customer_id"?: string | null,"tags"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"email"?: string | null,"email_opt_in"?: boolean,"full_name"?: string,"id"?: string,"notes"?: string | null,"phone"?: string | null,"search_text"?: never,"sms_opt_in"?: boolean,"stripe_customer_id"?: string | null,"tags"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "booking_id": string,"business_id": string,"created_at": string,"customer_id": string,"due_date": string | null,"id": string,"issued_at": string | null,"memo": string | null,"number": number,"paid_at": string | null,"public_token": string,"status": Database["public"]['Enums']["invoice_status"],"updated_at": string,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"business_id": string,"created_at"?: string,"customer_id": string,"due_date"?: string | null,"id"?: string,"issued_at"?: string | null,"memo"?: string | null,"number": number,"paid_at"?: string | null,"public_token"?: string,"status"?: Database["public"]['Enums']["invoice_status"],"updated_at"?: string,"voided_at"?: string | null
                  }
                  Update: {
                    "booking_id"?: string,"business_id"?: string,"created_at"?: string,"customer_id"?: string,"due_date"?: string | null,"id"?: string,"issued_at"?: string | null,"memo"?: string | null,"number"?: number,"paid_at"?: string | null,"public_token"?: string,"status"?: Database["public"]['Enums']["invoice_status"],"updated_at"?: string,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_business_id_booking_id_fkey"
      columns: ["business_id","booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "invoices_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "invoices_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "attempts": number,"booking_id": string | null,"business_id": string,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"customer_id": string | null,"error": string | null,"id": string,"payload": NonNullable<Json>,"provider": string | null,"provider_message_id": string | null,"scheduled_for": string,"sent_at": string | null,"status": Database["public"]['Enums']["notification_status"],"template": string,"to_address": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"booking_id"?: string | null,"business_id": string,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"customer_id"?: string | null,"error"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"provider"?: string | null,"provider_message_id"?: string | null,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template": string,"to_address": string,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"booking_id"?: string | null,"business_id"?: string,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"customer_id"?: string | null,"error"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"provider"?: string | null,"provider_message_id"?: string | null,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["notification_status"],"template"?: string,"to_address"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_business_id_booking_id_fkey"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "notifications_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "notifications_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"amount_refunded_cents": number,"application_fee_cents": number,"booking_id": string,"business_id": string,"card_brand": string | null,"card_last4": string | null,"created_at": string,"currency": string,"customer_id": string,"failure_code": string | null,"failure_message": string | null,"id": string,"kind": Database["public"]['Enums']["payment_kind"],"net_cents": number | null,"payment_method_type": string | null,"status": Database["public"]['Enums']["payment_status"],"stripe_account_id": string,"stripe_charge_id": string | null,"stripe_checkout_session_id": string | null,"stripe_fee_cents": number | null,"stripe_payment_intent_id": string | null,"succeeded_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"amount_refunded_cents"?: number,"application_fee_cents"?: number,"booking_id": string,"business_id": string,"card_brand"?: string | null,"card_last4"?: string | null,"created_at"?: string,"currency"?: string,"customer_id": string,"failure_code"?: string | null,"failure_message"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["payment_kind"],"net_cents"?: number | null,"payment_method_type"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"stripe_account_id": string,"stripe_charge_id"?: string | null,"stripe_checkout_session_id"?: string | null,"stripe_fee_cents"?: number | null,"stripe_payment_intent_id"?: string | null,"succeeded_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"amount_refunded_cents"?: number,"application_fee_cents"?: number,"booking_id"?: string,"business_id"?: string,"card_brand"?: string | null,"card_last4"?: string | null,"created_at"?: string,"currency"?: string,"customer_id"?: string,"failure_code"?: string | null,"failure_message"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["payment_kind"],"net_cents"?: number | null,"payment_method_type"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"stripe_account_id"?: string,"stripe_charge_id"?: string | null,"stripe_checkout_session_id"?: string | null,"stripe_fee_cents"?: number | null,"stripe_payment_intent_id"?: string | null,"succeeded_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_business_id_booking_id_fkey"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "payments_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "payments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"full_name": string | null,"id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"full_name"?: string | null,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recurring_series": {
                  Row: {
                    "address_id": string | null,"assigned_member_id": string | null,"business_id": string,"created_at": string,"customer_id": string,"duration_minutes": number,"ends_on": string | null,"frequency": Database["public"]['Enums']["recurrence_frequency"],"generated_through": string | null,"id": string,"is_active": boolean,"price_cents": number,"service_id": string | null,"start_time": string,"starts_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_id"?: string | null,"assigned_member_id"?: string | null,"business_id": string,"created_at"?: string,"customer_id": string,"duration_minutes": number,"ends_on"?: string | null,"frequency": Database["public"]['Enums']["recurrence_frequency"],"generated_through"?: string | null,"id"?: string,"is_active"?: boolean,"price_cents": number,"service_id"?: string | null,"start_time": string,"starts_on": string,"updated_at"?: string
                  }
                  Update: {
                    "address_id"?: string | null,"assigned_member_id"?: string | null,"business_id"?: string,"created_at"?: string,"customer_id"?: string,"duration_minutes"?: number,"ends_on"?: string | null,"frequency"?: Database["public"]['Enums']["recurrence_frequency"],"generated_through"?: string | null,"id"?: string,"is_active"?: boolean,"price_cents"?: number,"service_id"?: string | null,"start_time"?: string,"starts_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_series_business_id_address_id_fkey"
      columns: ["business_id","address_id"]
isOneToOne: false
      referencedRelation: "customer_addresses"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "recurring_series_business_id_assigned_member_id_fkey"
      columns: ["business_id","assigned_member_id"]
isOneToOne: false
      referencedRelation: "business_members"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "recurring_series_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "recurring_series_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_series_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "amount_cents": number,"business_id": string,"created_at": string,"created_by": string | null,"id": string,"note": string | null,"payment_id": string,"reason": string,"status": Database["public"]['Enums']["refund_status"],"stripe_refund_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"business_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"payment_id": string,"reason"?: string,"status"?: Database["public"]['Enums']["refund_status"],"stripe_refund_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"payment_id"?: string,"reason"?: string,"status"?: Database["public"]['Enums']["refund_status"],"stripe_refund_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_business_id_payment_id_fkey"
      columns: ["business_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"route_stops": {
                  Row: {
                    "arrived_at": string | null,"booking_id": string,"business_id": string,"completed_at": string | null,"created_at": string,"id": string,"planned_arrival": string | null,"planned_departure": string | null,"route_id": string,"sequence": number,"status": Database["public"]['Enums']["stop_status"],"travel_distance_meters": number | null,"travel_duration_seconds": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "arrived_at"?: string | null,"booking_id": string,"business_id": string,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"planned_arrival"?: string | null,"planned_departure"?: string | null,"route_id": string,"sequence": number,"status"?: Database["public"]['Enums']["stop_status"],"travel_distance_meters"?: number | null,"travel_duration_seconds"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "arrived_at"?: string | null,"booking_id"?: string,"business_id"?: string,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"planned_arrival"?: string | null,"planned_departure"?: string | null,"route_id"?: string,"sequence"?: number,"status"?: Database["public"]['Enums']["stop_status"],"travel_distance_meters"?: number | null,"travel_duration_seconds"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "route_stops_business_id_booking_id_fkey"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "route_stops_business_id_route_id_fkey"
      columns: ["business_id","route_id"]
isOneToOne: false
      referencedRelation: "routes"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"routes": {
                  Row: {
                    "baseline_distance_meters": number | null,"baseline_duration_seconds": number | null,"business_id": string,"completed_at": string | null,"created_at": string,"end_lat": number | null,"end_lng": number | null,"id": string,"member_id": string | null,"optimization_meta": NonNullable<Json>,"optimization_provider": string | null,"optimized_at": string | null,"route_date": string,"start_address": string | null,"start_lat": number | null,"start_lng": number | null,"started_at": string | null,"status": Database["public"]['Enums']["route_status"],"total_distance_meters": number | null,"total_duration_seconds": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "baseline_distance_meters"?: number | null,"baseline_duration_seconds"?: number | null,"business_id": string,"completed_at"?: string | null,"created_at"?: string,"end_lat"?: number | null,"end_lng"?: number | null,"id"?: string,"member_id"?: string | null,"optimization_meta"?: NonNullable<Json>,"optimization_provider"?: string | null,"optimized_at"?: string | null,"route_date": string,"start_address"?: string | null,"start_lat"?: number | null,"start_lng"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["route_status"],"total_distance_meters"?: number | null,"total_duration_seconds"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "baseline_distance_meters"?: number | null,"baseline_duration_seconds"?: number | null,"business_id"?: string,"completed_at"?: string | null,"created_at"?: string,"end_lat"?: number | null,"end_lng"?: number | null,"id"?: string,"member_id"?: string | null,"optimization_meta"?: NonNullable<Json>,"optimization_provider"?: string | null,"optimized_at"?: string | null,"route_date"?: string,"start_address"?: string | null,"start_lat"?: number | null,"start_lng"?: number | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["route_status"],"total_distance_meters"?: number | null,"total_duration_seconds"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routes_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "routes_business_id_member_id_fkey"
      columns: ["business_id","member_id"]
isOneToOne: false
      referencedRelation: "business_members"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"services": {
                  Row: {
                    "business_id": string,"created_at": string,"deposit_amount_cents": number,"deposit_percent": number,"deposit_type": Database["public"]['Enums']["deposit_type"],"description": string | null,"duration_minutes": number,"id": string,"is_active": boolean,"is_public": boolean,"name": string,"price_cents": number,"price_type": Database["public"]['Enums']["price_type"],"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"deposit_amount_cents"?: number,"deposit_percent"?: number,"deposit_type"?: Database["public"]['Enums']["deposit_type"],"description"?: string | null,"duration_minutes": number,"id"?: string,"is_active"?: boolean,"is_public"?: boolean,"name": string,"price_cents": number,"price_type"?: Database["public"]['Enums']["price_type"],"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"deposit_amount_cents"?: number,"deposit_percent"?: number,"deposit_type"?: Database["public"]['Enums']["deposit_type"],"description"?: string | null,"duration_minutes"?: number,"id"?: string,"is_active"?: boolean,"is_public"?: boolean,"name"?: string,"price_cents"?: number,"price_type"?: Database["public"]['Enums']["price_type"],"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_connect_accounts": {
                  Row: {
                    "account_type": string,"business_id": string,"charges_enabled": boolean,"country": string | null,"created_at": string,"default_currency": string | null,"details_submitted": boolean,"disabled_reason": string | null,"payouts_enabled": boolean,"requirements_due": (string)[],"stripe_account_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type"?: string,"business_id": string,"charges_enabled"?: boolean,"country"?: string | null,"created_at"?: string,"default_currency"?: string | null,"details_submitted"?: boolean,"disabled_reason"?: string | null,"payouts_enabled"?: boolean,"requirements_due"?: (string)[],"stripe_account_id": string,"updated_at"?: string
                  }
                  Update: {
                    "account_type"?: string,"business_id"?: string,"charges_enabled"?: boolean,"country"?: string | null,"created_at"?: string,"default_currency"?: string | null,"details_submitted"?: boolean,"disabled_reason"?: string | null,"payouts_enabled"?: boolean,"requirements_due"?: (string)[],"stripe_account_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stripe_connect_accounts_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_webhook_events": {
                  Row: {
                    "api_version": string | null,"attempts": number,"id": string,"last_error": string | null,"livemode": boolean,"payload": NonNullable<Json>,"processed_at": string | null,"received_at": string,"stripe_account_id": string | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "api_version"?: string | null,"attempts"?: number,"id": string,"last_error"?: string | null,"livemode"?: boolean,"payload": NonNullable<Json>,"processed_at"?: string | null,"received_at"?: string,"stripe_account_id"?: string | null,"type": string
                  }
                  Update: {
                    "api_version"?: string | null,"attempts"?: number,"id"?: string,"last_error"?: string | null,"livemode"?: boolean,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"received_at"?: string,"stripe_account_id"?: string | null,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "business_id": string,"cancel_at_period_end": boolean,"canceled_at": string | null,"created_at": string,"current_period_end": string | null,"current_period_start": string | null,"ended_at": string | null,"id": string,"plan": Database["public"]['Enums']["subscription_plan"],"seats": number,"status": Database["public"]['Enums']["subscription_status"],"stripe_customer_id": string,"stripe_price_id": string | null,"stripe_subscription_id": string,"trial_end": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"ended_at"?: string | null,"id"?: string,"plan": Database["public"]['Enums']["subscription_plan"],"seats"?: number,"status": Database["public"]['Enums']["subscription_status"],"stripe_customer_id": string,"stripe_price_id"?: string | null,"stripe_subscription_id": string,"trial_end"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"cancel_at_period_end"?: boolean,"canceled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"ended_at"?: string | null,"id"?: string,"plan"?: Database["public"]['Enums']["subscription_plan"],"seats"?: number,"status"?: Database["public"]['Enums']["subscription_status"],"stripe_customer_id"?: string,"stripe_price_id"?: string | null,"stripe_subscription_id"?: string,"trial_end"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"time_off": {
                  Row: {
                    "business_id": string,"created_at": string,"ends_at": string,"id": string,"member_id": string | null,"reason": string | null,"starts_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"ends_at": string,"id"?: string,"member_id"?: string | null,"reason"?: string | null,"starts_at": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"ends_at"?: string,"id"?: string,"member_id"?: string | null,"reason"?: string | null,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_off_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_off_business_id_member_id_fkey"
      columns: ["business_id","member_id"]
isOneToOne: false
      referencedRelation: "business_members"
      referencedColumns: ["business_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_business_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"accept_invitation":
{ Args: { "p_invitation_id": string }; Returns: string
                           },
"booking_counts":
{ Args: { "p_business_id": string }; Returns: Json
                           },
"booking_list":
{ Args: { "p_business_id": string,"p_cancel_requests"?: boolean,"p_from"?: string,"p_limit"?: number,"p_member_id"?: string,"p_newest_first"?: boolean,"p_offset"?: number,"p_search"?: string,"p_statuses"?: (Database["public"]['Enums']["booking_status"])[],"p_to"?: string,"p_unassigned"?: boolean }; Returns: {
              "assigned_member_id": string,"balance_due_cents": number,"cancel_request_reason": string,"cancel_requested_at": string,"currency": string,"customer_email": string,"customer_id": string,"customer_name": string,"customer_phone": string,"deposit_due_cents": number,"deposit_paid_cents": number,"hold_expires_at": string,"id": string,"reference": string,"scheduled_end": string,"scheduled_start": string,"services": string,"source": Database["public"]['Enums']["booking_source"],"status": Database["public"]['Enums']["booking_status"],"total_cents": number,"total_count": number
            }[]
                           },
"business_overview":
{ Args: { "p_business_id": string }; Returns: Json
                           },
"claim_notifications":
{ Args: { "p_booking_id"?: string,"p_limit"?: number }; Returns: {
              "attempts": number,
"booking_id": string | null,
"business_id": string,
"channel": Database["public"]['Enums']["notification_channel"],
"created_at": string,
"customer_id": string | null,
"error": string | null,
"id": string,
"payload": NonNullable<Json>,
"provider": string | null,
"provider_message_id": string | null,
"scheduled_for": string,
"sent_at": string | null,
"status": Database["public"]['Enums']["notification_status"],
"template": string,
"to_address": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "notifications"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_booking":
{ Args: { "p_address": Json,"p_business_id": string,"p_customer": Json,"p_customer_notes"?: string,"p_service_ids": (string)[],"p_source"?: Database["public"]['Enums']["booking_source"],"p_start": string }; Returns: {
              "booking_id": string,"customer_id": string,"deposit_due_cents": number,"hold_expires_at": string,"public_token": string,"reference": string,"status": Database["public"]['Enums']["booking_status"],"stripe_account_id": string,"total_cents": number
            }[]
                           },
"create_business_invitation":
{ Args: { "p_business_id": string,"p_email": string,"p_role"?: Database["public"]['Enums']["member_role"] }; Returns: string
                           },
"customer_booking_options":
{ Args: { "p_token": string }; Returns: Json
                           },
"customer_cancel_booking":
{ Args: { "p_reason"?: string,"p_token": string }; Returns: string
                           },
"customer_list":
{ Args: { "p_business_id": string,"p_limit"?: number,"p_offset"?: number,"p_search"?: string }; Returns: {
              "booking_count": number,"created_at": string,"email": string,"full_name": string,"id": string,"last_booking_at": string,"lifetime_paid_cents": number,"next_booking_at": string,"phone": string,"tags": (string)[],"total_count": number
            }[]
                           },
"customer_reschedule_booking":
{ Args: { "p_start": string,"p_token": string }; Returns: string
                           },
"delete_account":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"get_available_slots":
{ Args: { "p_days"?: number,"p_from"?: string,"p_service_ids": (string)[],"p_slug": string }; Returns: {
              "slot_end": string,"slot_start": string
            }[]
                           },
"get_booking_page":
{ Args: { "p_slug": string }; Returns: Json
                           },
"get_reschedule_slots":
{ Args: { "p_days"?: number,"p_from"?: string,"p_token": string }; Returns: {
              "slot_end": string,"slot_start": string
            }[]
                           },
"invitation_preview":
{ Args: { "p_token": string }; Returns: {
              "business_name": string,"email": string,"expired": boolean,"role": Database["public"]['Enums']["member_role"]
            }[]
                           },
"is_slug_available":
{ Args: { "p_business_id"?: string,"p_slug": string }; Returns: boolean
                           },
"my_pending_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "business_name": string,"invitation_id": string,"invited_by_name": string,"role": Database["public"]['Enums']["member_role"]
            }[]
                           },
"release_expired_holds":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"resolve_cancel_request":
{ Args: { "p_approve": boolean,"p_booking_id": string,"p_note"?: string }; Returns: undefined
                           },
"team_members":
{ Args: { "p_business_id": string }; Returns: {
              "calendar_color": string,"email": string,"full_name": string,"joined_at": string,"member_id": string,"role": Database["public"]['Enums']["member_role"],"status": Database["public"]['Enums']["member_status"],"user_id": string
            }[]
                           },
"team_seats":
{ Args: { "p_business_id": string }; Returns: {
              "seat_limit": number,"used": number
            }[]
                           },
"update_job_status":
{ Args: { "p_booking_id": string,"p_reason"?: string,"p_status": Database["public"]['Enums']["booking_status"] }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"update_route_stop_status":
{ Args: { "p_status": Database["public"]['Enums']["stop_status"],"p_stop_id": string }; Returns: Database["public"]['Enums']["stop_status"]
                           }
          }
          Enums: {
            "attachment_kind": "photo"|"document","booking_source": "booking_page"|"manual"|"recurring"|"import","booking_status": "pending_payment"|"requested"|"confirmed"|"in_progress"|"completed"|"cancelled"|"no_show","deposit_type": "none"|"percent"|"fixed","invoice_status": "draft"|"open"|"paid"|"void"|"uncollectible","member_role": "owner"|"admin"|"crew","member_status": "active"|"suspended","notification_channel": "email"|"sms","notification_status": "queued"|"sent"|"delivered"|"failed"|"canceled","payment_kind": "deposit"|"balance"|"full"|"tip","payment_status": "requires_payment"|"processing"|"succeeded"|"failed"|"canceled"|"refunded"|"partially_refunded","price_type": "fixed"|"starting_at"|"quote","recurrence_frequency": "weekly"|"biweekly"|"every_4_weeks"|"monthly","refund_policy": "refundable"|"refundable_before_window"|"non_refundable","refund_status": "pending"|"succeeded"|"failed"|"canceled","route_status": "draft"|"optimized"|"in_progress"|"completed","stop_status": "pending"|"en_route"|"arrived"|"completed"|"skipped","subscription_plan": "solo"|"crew"|"fleet","subscription_status": "trialing"|"active"|"past_due"|"canceled"|"incomplete"|"incomplete_expired"|"unpaid"|"paused"
          }
          CompositeTypes: {
            [_ in never]: never
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
  "public": {
          Enums: {
            "attachment_kind": ["photo", "document"],"booking_source": ["booking_page", "manual", "recurring", "import"],"booking_status": ["pending_payment", "requested", "confirmed", "in_progress", "completed", "cancelled", "no_show"],"deposit_type": ["none", "percent", "fixed"],"invoice_status": ["draft", "open", "paid", "void", "uncollectible"],"member_role": ["owner", "admin", "crew"],"member_status": ["active", "suspended"],"notification_channel": ["email", "sms"],"notification_status": ["queued", "sent", "delivered", "failed", "canceled"],"payment_kind": ["deposit", "balance", "full", "tip"],"payment_status": ["requires_payment", "processing", "succeeded", "failed", "canceled", "refunded", "partially_refunded"],"price_type": ["fixed", "starting_at", "quote"],"recurrence_frequency": ["weekly", "biweekly", "every_4_weeks", "monthly"],"refund_policy": ["refundable", "refundable_before_window", "non_refundable"],"refund_status": ["pending", "succeeded", "failed", "canceled"],"route_status": ["draft", "optimized", "in_progress", "completed"],"stop_status": ["pending", "en_route", "arrived", "completed", "skipped"],"subscription_plan": ["solo", "crew", "fleet"],"subscription_status": ["trialing", "active", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"]
          }
        }
} as const
