/** Shared API response types (kept in sync with the backend schemas). */

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  is_superuser: boolean;
  base_role_id: number | null;
}

export interface Me {
  user: User;
  effective_access: Record<string, string>;
  is_superuser: boolean;
}

export interface Role {
  id: number;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  default_access: Record<string, string>;
}

export interface UserDetail extends User {
  twofa_enabled: boolean;
  last_active_at: string | null;
  created_at: string;
  effective_access: Record<string, string>;
  access_overrides: Record<string, string>;
}

export interface InviteResult {
  user: User;
  invite_token: string;
}

export interface SpacePart {
  id: number;
  kind: string;
  m2: string;
  is_summable: boolean;
  price_factor: string;
}

export interface Unit {
  id: number;
  floor_id: number;
  type_id: number | null;
  number: string;
  rooms: number;
  status: string;
  view: string | null;
  decoration: string | null;
  price_per_m2: string;
  price_override: string | null;
  parts: SpacePart[];
  total_m2: string;
  billable_m2: string;
  price: string;
}

export interface Floor {
  id: number;
  block_id: number;
  number: number;
  units: Unit[];
}

export interface Block {
  id: number;
  complex_id: number;
  name: string;
  floors: Floor[];
}

export interface Complex {
  id: number;
  name: string;
  address: string | null;
  status: string;
}

export interface ComplexTree extends Complex {
  blocks: Block[];
}

export interface UnitType {
  id: number;
  name: string;
  default_rooms: number;
  total_m2: string;
  living_m2: string;
  kitchen_m2: string;
  image: string | null;
  description: string | null;
}

export interface Additional {
  id: number;
  complex_id: number;
  kind: string;
  number: string;
  m2: string;
  price: string;
  status: string;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  is_base: boolean;
  is_default: boolean;
  is_active: boolean;
  position: number;
  latest_rate: string | null;
  latest_day: string | null;
}

export interface CurrencyRate {
  id: number;
  currency_id: number;
  rate: string;
  day: string;
  created_at: string;
}

export interface PaymentPlan {
  id: number;
  name: string;
  deal_type: string;
  down_payment_percent: string;
  term_months: number;
  markup_percent: string;
  day_of_month: number;
  is_active: boolean;
}

export interface ScheduleLine {
  seq: number;
  due_date: string;
  amount: string;
  kind: string;
}

export interface SchedulePreview {
  unit_price: string;
  net_price: string;
  total: string;
  lines: ScheduleLine[];
}

export interface Client {
  id: number;
  full_name: string;
  phone: string | null;
  passport: string | null;
  manager_id: number | null;
  created_at: string;
}

export interface Lead {
  id: number;
  pipeline_id: number;
  stage_id: number;
  title: string;
  budget: string;
  source: string | null;
  status: string;
  contact_id: number | null;
  unit_id: number | null;
  deal_id: number | null;
  manager_id: number | null;
  tags: string[];
  custom: Record<string, string | number>;
  created_at: string;
}

export interface LeadEvent {
  id: number;
  lead_id: number;
  kind: string;
  text: string;
  author_id: number | null;
  due_at: string | null;
  done: boolean;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface LeadDetail extends Lead {
  contact_name: string | null;
  stage_name: string | null;
  unit_number: string | null;
  deal_state: string | null;
  deal_total: string | null;
  events: LeadEvent[];
}

export interface CrmField {
  id: number;
  key: string;
  label: string;
  field_type: "text" | "number" | "select" | "date";
  options: string[];
  required: boolean;
  position: number;
  active: boolean;
}

export interface Automation {
  id: number;
  pipeline_id: number;
  trigger_stage_id: number;
  action: "create_task" | "add_note";
  config: { text?: string; due_days?: number };
  active: boolean;
}

export interface Stage {
  id: number;
  pipeline_id: number;
  name: string;
  description?: string;
  position: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  leads: Lead[];
  count: number;
  total_budget: string;
}

export interface Pipeline {
  id: number;
  name: string;
  is_default: boolean;
  archived: boolean;
  position: number;
}

export interface LostReason {
  id: number;
  pipeline_id: number;
  text: string;
  position: number;
}

export interface CrmTag {
  id: number;
  text: string;
  color: string;
}

export interface TaskType {
  id: number;
  name: string;
  icon: string;
}

export interface Attachment {
  id: number;
  lead_id: number;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface Board {
  pipeline: Pipeline;
  stages: Stage[];
}

export interface AcctSummary {
  planned_total: string;
  collected_total: string;
  outstanding_total: string;
  overdue_total: string;
  overdue_count: number;
  planned_month: string;
  collected_month: string;
}

export interface PaymentRow {
  id: number;
  deal_id: number;
  client_name: string;
  unit_number: string;
  seq: number;
  kind: string;
  due_date: string;
  amount: string;
  paid_amount: string;
  remaining: string;
  status: string;
  overdue_days: number;
}

export interface DebtorRow {
  client_id: number;
  client_name: string;
  unit_number: string;
  overdue_amount: string;
  overdue_count: number;
  oldest_due: string;
  days_overdue: number;
}

export interface Contact {
  id: number;
  full_name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  source: string | null;
  passport: string | null;
  birthday: string | null;
  address: string | null;
  company: string | null;
  position: string | null;
  telegram: string | null;
  notes: string | null;
  photo: string | null;
  created_at: string;
}

export interface ContactAttachment {
  id: number;
  contact_id: number;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface PaymentMethod {
  id: number;
  key: string;
  name: string;
  is_active: boolean;
  fee_percent: string;
}

export interface DealPayment {
  id: number;
  seq: number;
  kind: string;
  due_date: string;
  amount: string;
  paid_amount: string;
  paid_at: string | null;
  method_id: number | null;
  status: string;
}

export interface DealDetail {
  id: number;
  unit_id: number;
  client_id: number;
  plan_id: number | null;
  manager_id: number | null;
  deal_type: string;
  price: string;
  total: string;
  discount_percent: string;
  discount_amount: string;
  down_payment_percent: string;
  term_months: number;
  markup_percent: string;
  day_of_month: number;
  booking_expires_at: string | null;
  contract_no: string | null;
  contract_date: string | null;
  note: string | null;
  state: string;
  created_at: string;
  signed_at: string | null;
  payments: DealPayment[];
  unit_number: string | null;
  client_name: string | null;
  client_phone: string | null;
  manager_name: string | null;
  complex_name: string | null;
}

export interface Receipt {
  id: number;
  deal_id: number;
  number: string;
  amount: string;
  method_id: number | null;
  method_name: string | null;
  covers: string | null;
  author_name: string | null;
  paid_at: string;
}

export interface DealEvent {
  id: number;
  deal_id: number;
  kind: string;
  text: string;
  author_id: number | null;
  author_name: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface DealRow {
  id: number;
  unit_number: string;
  client_name: string;
  manager_name: string | null;
  deal_type: string;
  state: string;
  total: string;
  paid: string;
  remaining: string;
  next_due: string | null;
  payments_paid: number;
  payments_total: number;
}
