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

export type BoxMaterial = 'cardboard_cryo' | 'abdos_plastic' | 'slide_box'

export type FreezerEventType = 'excursion' | 'failure' | 'maintenance' | 'recovery'

export const FREEZER_EVENT_TYPE_LABELS: Record<FreezerEventType, string> = {
  excursion: 'Temperature Excursion',
  failure: 'Freezer Failure',
  maintenance: 'Maintenance',
  recovery: 'Recovery',
}

export const BOX_TYPE_LABELS: Record<BoxType, string> = {
  cryo_81: 'Cryo 81',
  cryo_100: 'Cryo 100',
  abdos_81: 'Abdos 81',
  custom: 'Custom',
}

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
  created_by: string | null
  created_at: string
  updated_at: string
  used_positions: number
  total_positions: number
  utilization_pct: number
}

export interface FreezerCreate {
  name: string
  freezer_type: FreezerType
  location?: string
  rack_count?: number
  slots_per_rack?: number
  notes?: string
}

export interface StorageRack {
  id: string
  freezer_id: string
  rack_name: string
  position_in_freezer: number | null
  capacity: number | null
  created_at: string
  updated_at: string
}

export interface RackCreate {
  rack_name: string
  position_in_freezer?: number
  capacity?: number
}

export interface StorageBox {
  id: string
  rack_id: string
  box_name: string
  box_label: string | null
  rows: number
  columns: number
  box_type: BoxType
  box_material: BoxMaterial | null
  position_in_rack: number | null
  group_code: string | null
  collection_site_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  occupied_count: number
  total_slots: number
}

export interface BoxCreate {
  rack_id: string
  box_name: string
  box_label?: string
  rows?: number
  columns?: number
  box_type?: BoxType
  box_material?: BoxMaterial
  position_in_rack?: number
  group_code?: string
  collection_site_id?: string
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
  sample_code: string | null
}

export interface BoxDetail extends StorageBox {
  positions: StoragePosition[]
}

export interface TempEvent {
  id: string
  freezer_id: string
  event_type: FreezerEventType
  event_start: string
  event_end: string | null
  observed_temp_c: number | null
  reported_by: string
  samples_affected_count: number | null
  resolution_notes: string | null
  requires_sample_review: boolean
  created_at: string
}

export interface StorageSearchResult {
  sample_id: string
  sample_code: string
  position_id: string
  row: number
  column: number
  box_id: string
  box_name: string
  rack_id: string
  rack_name: string
  freezer_id: string
  freezer_name: string
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

// --- Field Operations ---

export type FieldEventType = 'rural_mass' | 'urban_scheduled'

export type FieldEventStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export type PartnerName = 'healthians' | '1mg' | 'lalpath' | 'decodeage'

export type SyncStatus = 'pending' | 'synced' | 'conflict'

export const FIELD_EVENT_TYPE_LABELS: Record<FieldEventType, string> = {
  rural_mass: 'Rural Mass',
  urban_scheduled: 'Urban Scheduled',
}

export const FIELD_EVENT_STATUS_LABELS: Record<FieldEventStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const PARTNER_LABELS: Record<PartnerName, string> = {
  healthians: 'Healthians',
  '1mg': '1mg',
  lalpath: 'Lal Path Labs',
  decodeage: 'DecodeAge',
}

export interface FieldEvent {
  id: string
  event_name: string
  event_date: string
  collection_site_id: string
  event_type: FieldEventType
  expected_participants: number | null
  actual_participants: number | null
  status: FieldEventStatus | null
  coordinator_id: string | null
  partner_lab: PartnerName | null
  notes: string | null
  wave: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FieldEventCreate {
  event_name: string
  event_date: string
  collection_site_id: string
  event_type: FieldEventType
  expected_participants?: number
  coordinator_id?: string
  partner_lab?: PartnerName
  notes?: string
  wave?: number
}

export interface FieldEventParticipant {
  id: string
  event_id: string
  participant_id: string
  check_in_time: string | null
  wrist_tag_issued: boolean
  consent_verified: boolean
  samples_collected: Record<string, boolean> | null
  partner_samples: Record<string, unknown> | null
  stool_kit_issued: boolean
  urine_collected: boolean
  notes: string | null
  recorded_by: string | null
  recorded_at: string | null
  sync_status: SyncStatus
  participant_code?: string
}

export interface FieldEventDetail extends FieldEvent {
  event_participants: FieldEventParticipant[]
}

export interface FieldEventListParams extends ListParams {
  status?: FieldEventStatus
  collection_site_id?: string
  date_from?: string
  date_to?: string
}

// --- Partner / ODK ---

export type OdkSyncStatus = 'running' | 'completed' | 'failed'
export type OdkProcessingStatus = 'pending' | 'processed' | 'failed' | 'duplicate'
export type MatchStatus = 'auto_matched' | 'manual_matched' | 'unmatched'
export type StoolKitStatus = 'issued' | 'pickup_scheduled' | 'collected_by_decodeage' | 'processing' | 'results_received'

export const STOOL_KIT_STATUS_LABELS: Record<StoolKitStatus, string> = {
  issued: 'Issued',
  pickup_scheduled: 'Pickup Scheduled',
  collected_by_decodeage: 'Collected by DecodeAge',
  processing: 'Processing',
  results_received: 'Results Received',
}

export interface OdkFormConfig {
  id: string
  form_id: string
  form_name: string
  form_version: string
  field_mapping: Record<string, string>
  is_active: boolean
  created_at: string
  updated_by: string | null
}

export interface OdkSyncLog {
  id: string
  sync_started_at: string
  sync_completed_at: string | null
  status: OdkSyncStatus
  submissions_found: number | null
  submissions_processed: number | null
  submissions_failed: number | null
  error_message: string | null
  created_by: string | null
}

export interface CanonicalTest {
  id: string
  canonical_name: string
  display_name: string | null
  category: string | null
  standard_unit: string | null
  reference_range_low: number | null
  reference_range_high: number | null
  is_active: boolean
  created_at: string
  aliases_count?: number
}

export interface TestNameAlias {
  id: string
  canonical_test_id: string
  partner_name: PartnerName
  alias_name: string
  alias_unit: string | null
  unit_conversion_factor: number
  created_at: string
}

export interface PartnerLabImport {
  id: string
  partner_name: PartnerName
  import_date: string
  source_file_name: string | null
  records_total: number | null
  records_matched: number | null
  records_failed: number | null
  imported_by: string
  notes: string | null
  created_at: string
}

export interface PartnerLabResult {
  id: string
  import_id: string
  participant_id: string | null
  participant_code_raw: string | null
  test_date: string | null
  test_name_raw: string | null
  canonical_test_id: string | null
  test_value: string | null
  test_unit: string | null
  reference_range: string | null
  is_abnormal: boolean | null
  match_status: MatchStatus | null
  created_at: string
  canonical_test_name?: string
}

export interface StoolKit {
  id: string
  participant_id: string
  field_event_id: string | null
  kit_code: string | null
  issued_at: string
  issued_by: string | null
  status: StoolKitStatus
  decodeage_pickup_date: string | null
  results_received_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
