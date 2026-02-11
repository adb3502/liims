// ============================================================
// LIIMS TypeScript Types - Matching backend Pydantic schemas
// ============================================================

// --- Enums ---

export type UserRole =
  | 'super_admin'
  | 'lab_manager'
  | 'lab_technician'
  | 'field_coordinator'
  | 'data_entry'
  | 'collaborator'
  | 'pi_researcher'

export type AgeGroup = 1 | 2 | 3 | 4 | 5

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  1: '18-29',
  2: '30-44',
  3: '45-59',
  4: '60-74',
  5: '75+',
}

export type Sex = 'M' | 'F'

export type EnrollmentSource = 'odk' | 'manual' | 'bulk_import'

export type ConsentType = 'household' | 'individual' | 'dbs_storage' | 'proxy_interview'

export type SampleType =
  | 'plasma'
  | 'epigenetics'
  | 'extra_blood'
  | 'rbc_smear'
  | 'cheek_swab'
  | 'hair'
  | 'urine'
  | 'stool_kit'

export type SampleStatus =
  | 'registered'
  | 'collected'
  | 'transported'
  | 'received'
  | 'processing'
  | 'stored'
  | 'reserved'
  | 'in_analysis'
  | 'pending_discard'
  | 'depleted'
  | 'discarded'

export type FreezerType = 'minus_150' | 'minus_80' | 'plus_4' | 'room_temp'

export const FREEZER_TYPE_LABELS: Record<FreezerType, string> = {
  minus_150: '-150\u00B0C',
  minus_80: '-80\u00B0C',
  plus_4: '+4\u00B0C',
  room_temp: 'Room Temp',
}

export type BoxType = 'cryo_81' | 'cryo_100' | 'abdos_81' | 'custom'

export type NotificationSeverity = 'info' | 'warning' | 'critical'

export type NotificationType =
  | 'odk_sync_failure'
  | 'freezer_capacity_warning'
  | 'freezer_temp_event'
  | 'consent_withdrawal'
  | 'import_error'
  | 'backup_stale'
  | 'discard_request'
  | 'processing_timer_exceeded'
  | 'system_alert'

export type DiscardReason =
  | 'contamination'
  | 'depleted'
  | 'consent_withdrawal'
  | 'expired'
  | 'other'

// --- Base interfaces ---

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  meta: {
    page: number
    per_page: number
    total: number
  }
}

export interface SingleResponse<T> {
  success: true
  data: T
}

export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type ApiResponse<T> = SingleResponse<T> | ErrorResponse

// --- User ---

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  last_login: string | null
  created_at: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

export interface AuthMe {
  user: User
}

// --- Participant ---

export interface Participant {
  id: string
  participant_code: string
  group_code: string
  participant_number: number
  age_group: AgeGroup
  sex: Sex
  date_of_birth: string | null
  collection_site_id: string
  enrollment_date: string
  enrollment_source: EnrollmentSource
  odk_submission_id: string | null
  wave: number
  completion_pct: number
  is_deleted: boolean
  created_at: string
  updated_at: string
  created_by: string
  // Joined
  collection_site?: CollectionSite
}

export interface ParticipantCreate {
  participant_code: string
  group_code: string
  participant_number: number
  age_group: AgeGroup
  sex: Sex
  date_of_birth?: string
  collection_site_id: string
  enrollment_date: string
}

export interface ParticipantUpdate {
  age_group?: AgeGroup
  sex?: Sex
  date_of_birth?: string
  collection_site_id?: string
}

// --- Collection Site ---

export interface CollectionSite {
  id: string
  name: string
  code: string
  participant_range_start: number
  participant_range_end: number
  city: string
  address: string | null
  is_active: boolean
  created_at: string
}

// --- Consent ---

export interface Consent {
  id: string
  participant_id: string
  consent_type: ConsentType
  consent_given: boolean
  consent_date: string
  is_proxy: boolean
  witness_name: string | null
  form_version: string | null
  withdrawal_date: string | null
  withdrawal_reason: string | null
  created_at: string
}

export interface ConsentCreate {
  consent_type: ConsentType
  consent_given: boolean
  consent_date: string
  is_proxy?: boolean
  witness_name?: string
  form_version?: string
}

// --- Sample ---

export interface Sample {
  id: string
  sample_code: string
  participant_id: string
  sample_type: SampleType
  sample_subtype: string | null
  parent_sample_id: string | null
  status: SampleStatus
  initial_volume_ul: number | null
  remaining_volume_ul: number | null
  collection_datetime: string | null
  collected_by: string | null
  collection_site_id: string | null
  processing_started_at: string | null
  storage_location_id: string | null
  storage_datetime: string | null
  has_deviation: boolean
  deviation_notes: string | null
  qr_code_url: string | null
  notes: string | null
  wave: number
  is_deleted: boolean
  created_at: string
  updated_at: string
  // Joined
  participant?: Participant
}

export interface SampleDetail extends Sample {
  status_history: SampleStatusHistory[]
  aliquots: Sample[]
  processing_elapsed_seconds: number | null
}

export interface SampleStatusHistory {
  id: string
  sample_id: string
  previous_status: SampleStatus | null
  new_status: SampleStatus
  changed_at: string
  changed_by: string
  notes: string | null
  location_context: string | null
  storage_rule_override_reason: string | null
}

export interface SampleCreate {
  participant_id: string
  sample_type: SampleType
  sample_subtype?: string
  parent_sample_id?: string
  initial_volume_ul?: number
  collection_site_id?: string
  wave?: number
  notes?: string
}

export interface SampleStatusUpdate {
  status: SampleStatus
  notes?: string
  location_context?: string
  storage_rule_override_reason?: string
}

export interface VolumeWithdrawRequest {
  volume_ul: number
  reason?: string
}

export type DiscardRequestStatus = 'pending' | 'approved' | 'rejected'

export interface DiscardRequest {
  id: string
  sample_id: string
  requested_by: string
  requested_at: string
  reason: DiscardReason
  reason_notes: string | null
  approved_by: string | null
  approved_at: string | null
  status: DiscardRequestStatus
  rejection_reason: string | null
}

export interface DiscardRequestCreate {
  reason: DiscardReason
  reason_notes?: string
}

export interface DiscardApproval {
  approved: boolean
  rejection_reason?: string
}

export const SAMPLE_TYPE_LABELS: Record<SampleType, string> = {
  plasma: 'Plasma',
  epigenetics: 'Epigenetics',
  extra_blood: 'Extra Blood',
  rbc_smear: 'RBC Smear',
  cheek_swab: 'Cheek Swab',
  hair: 'Hair',
  urine: 'Urine',
  stool_kit: 'Stool Kit',
}

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  registered: 'Registered',
  collected: 'Collected',
  transported: 'Transported',
  received: 'Received',
  processing: 'Processing',
  stored: 'Stored',
  reserved: 'Reserved',
  in_analysis: 'In Analysis',
  pending_discard: 'Pending Discard',
  depleted: 'Depleted',
  discarded: 'Discarded',
}

export const DISCARD_REASON_LABELS: Record<DiscardReason, string> = {
  contamination: 'Contamination',
  depleted: 'Depleted',
  consent_withdrawal: 'Consent Withdrawal',
  expired: 'Expired',
  other: 'Other',
}

// --- Storage ---

export interface Freezer {
  id: string
  name: string
  freezer_type: FreezerType
  location: string | null
  total_capacity: number | null
  rack_count: number | null
  slots_per_rack: number | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface StorageBox {
  id: string
  rack_id: string
  box_name: string
  box_label: string | null
  rows: number
  columns: number
  box_type: BoxType
  position_in_rack: number | null
  group_code: string | null
  created_at: string
}

export interface StoragePosition {
  id: string
  box_id: string
  row: number
  column: number
  sample_id: string | null
  occupied_at: string | null
  locked_by: string | null
  locked_at: string | null
}

// --- Notification ---

export interface Notification {
  id: string
  recipient_id: string | null
  recipient_role: UserRole | null
  notification_type: NotificationType
  title: string
  message: string
  severity: NotificationSeverity
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

// --- Settings ---

export interface SystemSetting {
  id: string
  category: string
  key: string
  value: string
  value_type: 'string' | 'integer' | 'boolean' | 'json'
  description: string | null
  updated_at: string
}

// --- Audit ---

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  timestamp: string
}

// --- Query params ---

export interface ListParams {
  page?: number
  per_page?: number
  sort?: string
  order?: 'asc' | 'desc'
  search?: string
}

export interface ParticipantListParams extends ListParams {
  age_group?: AgeGroup
  sex?: Sex
  collection_site_id?: string
  wave?: number
}

export interface SampleListParams extends ListParams {
  sample_type?: SampleType
  status?: SampleStatus
  participant_id?: string
  wave?: number
}
