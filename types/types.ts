// ============================================================================
// CareOps — Supabase TypeScript Types
// ============================================================================

// --------------------------------------------------------------------------
// Enums
// --------------------------------------------------------------------------

export enum UserRole {
  Owner = "owner",
  Staff = "staff",
}

export enum BookingStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Completed = "completed",
  Cancelled = "cancelled",
  NoShow = "no_show",
}

export enum MessageSource {
  Gmail = "gmail",
  Telegram = "telegram",
  Internal = "internal",
}

export enum SenderType {
  Contact = "contact",
  Staff = "staff",
  System = "system",
}

export enum AutomationTrigger {
  BookingCreated = "booking_created",
  BookingConfirmed = "booking_confirmed",
  BookingCompleted = "booking_completed",
  BookingCancelled = "booking_cancelled",
  MessageReceived = "message_received",
  FormSubmitted = "form_submitted",
  InventoryLow = "inventory_low",
}

export enum AutomationAction {
  SendEmail = "send_email",
  SendTelegram = "send_telegram",
  CreateCalendarEvent = "create_calendar_event",
  DistributeForm = "distribute_form",
  AdjustInventory = "adjust_inventory",
  NotifyOwner = "notify_owner",
}

export enum AutomationLogStatus {
  Success = "success",
  Failure = "failure",
  Skipped = "skipped",
}

// --------------------------------------------------------------------------
// Table Interfaces
// --------------------------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  workspace_id: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  duration_mins: number;
  price: number | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  workspace_id: string;
  name: string;
  sku: string | null;
  quantity: number;
  low_stock_threshold: number;
  unit: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  workspace_id: string;
  contact_id: string;
  service_id: string | null;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  gcal_event_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  subject: string | null;
  channel: MessageSource;
  external_thread_id: string | null;
  is_archived: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  workspace_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  source: MessageSource;
  body: string;
  attachments: Record<string, unknown>[];
  external_id: string | null;
  sent_at: string;
  created_at: string;
}

export interface Form {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  schema: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  workspace_id: string;
  contact_id: string | null;
  data: Record<string, unknown>;
  submitted_at: string;
  created_at: string;
}

export interface AutomationRule {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  trigger_config: Record<string, unknown>;
  action: AutomationAction;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  rule_id: string;
  workspace_id: string;
  status: AutomationLogStatus;
  trigger_payload: Record<string, unknown>;
  action_result: Record<string, unknown>;
  error_message: string | null;
  executed_at: string;
}

// --------------------------------------------------------------------------
// Supabase Database Type
// --------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace;
        Insert: Omit<Workspace, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Workspace, "id" | "created_at">>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at">>;
      };
      contacts: {
        Row: Contact;
        Insert: Omit<Contact, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Contact, "id" | "created_at">>;
      };
      services: {
        Row: Service;
        Insert: Omit<Service, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Service, "id" | "created_at">>;
      };
      inventory_items: {
        Row: InventoryItem;
        Insert: Omit<InventoryItem, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<InventoryItem, "id" | "created_at">>;
      };
      bookings: {
        Row: Booking;
        Insert: Omit<Booking, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Booking, "id" | "created_at">>;
      };
      conversations: {
        Row: Conversation;
        Insert: Omit<Conversation, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Conversation, "id" | "created_at">>;
      };
      messages: {
        Row: Message;
        Insert: Omit<Message, "id" | "created_at">;
        Update: Partial<Omit<Message, "id" | "created_at">>;
      };
      forms: {
        Row: Form;
        Insert: Omit<Form, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Form, "id" | "created_at">>;
      };
      form_submissions: {
        Row: FormSubmission;
        Insert: Omit<FormSubmission, "id" | "created_at">;
        Update: Partial<Omit<FormSubmission, "id" | "created_at">>;
      };
      automation_rules: {
        Row: AutomationRule;
        Insert: Omit<AutomationRule, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<AutomationRule, "id" | "created_at">>;
      };
      automation_logs: {
        Row: AutomationLog;
        Insert: Omit<AutomationLog, "id">;
        Update: Partial<Omit<AutomationLog, "id">>;
      };
    };
    Enums: {
      user_role: UserRole;
      booking_status: BookingStatus;
      message_source: MessageSource;
      automation_trigger: AutomationTrigger;
      automation_action: AutomationAction;
    };
  };
}
