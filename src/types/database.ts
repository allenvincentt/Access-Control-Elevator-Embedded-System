import type { AccessStatus, AuthorizedFloor } from '@/enums/staffEnum';
import type { UserRole } from '@/enums/userRoleEnum';

export type FloorKey = keyof typeof AuthorizedFloor;
export type AccessStatusKey = keyof typeof AccessStatus;
export type UserRoleKey = keyof typeof UserRole;

export type AccessStage = 'Barcode' | 'Face';
export type AccessDecision = 'Granted' | 'Denied';

export type DenialReason =
  | 'UnknownCompanyId'
  | 'Suspended'
  | 'FloorNotAuthorized'
  | 'NoFaceEnrolled'
  | 'FaceMismatch'
  | 'LowQuality'
  | 'SessionExpired'
  | 'TooManyAttempts'
  | 'RateLimited'
  | 'TerminalNotConfigured'
  | 'NotAuthorized'
  | 'InvalidInput';

export type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  user_role: UserRoleKey;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  company_id: string;
  authorized_floors: FloorKey[];
  access_status: AccessStatusKey;
  photo_path: string | null;
  face_enrolled_at: string | null;
  face_template_count: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  search_text?: string;
};

export type StaffInsert = {
  full_name: string;
  email: string;
  company_id: string;
  authorized_floors: FloorKey[];
  access_status: AccessStatusKey;
  photo_path?: string | null;
};

export type StaffUpdate = {
  company_id?: string;
  authorized_floors?: FloorKey[];
  access_status?: AccessStatusKey;
  photo_path?: string | null;
};

export type AccessLogRow = {
  id: number;
  occurred_at: string;
  stage: AccessStage;
  decision: AccessDecision;
  reason: DenialReason | null;
  staff_id: string | null;
  scanned_company_id: string;
  staff_name_snapshot: string | null;
  floor: FloorKey | null;
  device_id: string | null;
  match_score: number | null;
  session_id: string | null;
};

export type AppConfigRow = {
  id: boolean;
  face_match_threshold: number;
  face_impostor_margin: number;
  face_duplicate_threshold: number;
  face_min_quality: number;
  enrollment_consistency_min: number;
  face_max_attempts: number;
  barcode_session_ttl_seconds: number;
  terminal_denial_window_seconds: number;
  terminal_denial_limit: number;
  staff_lockout_window_minutes: number;
  staff_lockout_limit: number;
  embedding_dimensions: number;
  updated_at: string;
  updated_by: string | null;
};

export type FaceSamplePayload = {
  embedding: number[];
  quality: number;
};

export type BarcodeVerificationResult =
  | {
      ok: true;
      session_token: string;
      expires_at: string;
      staff: { full_name: string; company_id: string };
    }
  | {
      ok: false;
      reason: DenialReason;
      retry_after_seconds?: number;
      staff?: { full_name: string; company_id: string };
    };

export type FaceVerificationResult =
  | {
      ok: true;
      authorized_floors: FloorKey[];
      score?: number;
      staff: { full_name: string; company_id: string };
    }
  | {
      ok: false;
      reason: DenialReason;
      attempts_left?: number;
    };

export type FloorAccessResult =
  | {
      ok: true;
      floor: FloorKey;
      staff: { full_name: string; company_id: string };
    }
  | {
      ok: false;
      reason: DenialReason;
    };

export type EnrollmentResult = {
  ok: true;
  staff_id: string;
  template_count: number;
  model_version: string;
  min_pairwise_similarity: number;
};

export type DashboardStats = {
  staff_total: number;
  staff_active: number;
  staff_suspended: number;
  faces_enrolled: number;
  faces_missing: number;
  granted_24h: number;
  denied_24h: number;
  attempts_24h: number;
};

export type HomeOverviewDay = {
  /** ISO date (YYYY-MM-DD) in the requested timezone. */
  day: string;
  /** Short weekday label, e.g. "Mon". */
  weekday: string;
  attempts: number;
  granted: number;
  denied: number;
};

export type DenialReasonCount = {
  reason: DenialReason;
  count: number;
};

export type FloorTraffic = {
  floor: FloorKey;
  count: number;
};

export type ActivityEntry = Pick<
  AccessLogRow,
  | 'id'
  | 'occurred_at'
  | 'stage'
  | 'decision'
  | 'reason'
  | 'staff_name_snapshot'
  | 'scanned_company_id'
  | 'floor'
>;

export type HomeOverview = {
  generated_at: string;
  timezone: string;

  staff_total: number;
  staff_active: number;
  staff_suspended: number;
  faces_enrolled: number;
  faces_missing: number;

  attempts_today: number;
  granted_today: number;
  denied_today: number;
  needs_review_today: number;
  attempts_yesterday: number;

  attempts_7d: number;
  granted_7d: number;
  denied_7d: number;

  days: HomeOverviewDay[];
  denial_reasons: DenialReasonCount[];
  busiest_floors: FloorTraffic[];
  recent: ActivityEntry[];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileRow;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      staff: {
        Row: StaffRow;
        Insert: StaffInsert;
        Update: StaffUpdate;
        Relationships: [];
      };
      access_logs: {
        Row: AccessLogRow;
        Insert: AccessLogRow;
        Update: Partial<AccessLogRow>;
        Relationships: [];
      };
      app_config: {
        Row: AppConfigRow;
        Insert: AppConfigRow;
        Update: Partial<AppConfigRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      verify_company_barcode: {
        Args: { p_company_id: string; p_device_id: string };
        Returns: BarcodeVerificationResult;
      };
      verify_staff_face: {
        Args: {
          p_session_token: string;
          p_embedding: number[];
          p_quality: number;
          p_device_id: string;
        };
        Returns: FaceVerificationResult;
      };
      commit_floor_access: {
        Args: { p_session_token: string; p_floor: FloorKey; p_device_id: string };
        Returns: FloorAccessResult;
      };
      cancel_verification_session: {
        Args: { p_session_token: string };
        Returns: undefined;
      };
      enroll_staff_face: {
        Args: { p_staff_id: string; p_samples: FaceSamplePayload[]; p_model_version?: string };
        Returns: EnrollmentResult;
      };
      reset_staff_face: {
        Args: { p_staff_id: string };
        Returns: { ok: true; staff_id: string };
      };
      create_staff_with_face: {
        Args: {
          p_full_name: string;
          p_email: string;
          p_company_id: string;
          p_authorized_floors: FloorKey[];
          p_access_status: AccessStatusKey;
          p_photo_path: string | null;
          p_samples: FaceSamplePayload[];
          p_model_version?: string;
        };
        Returns: StaffRow;
      };
      admin_dashboard_stats: {
        Args: Record<PropertyKey, never>;
        Returns: DashboardStats;
      };
      admin_home_overview: {
        Args: { p_timezone?: string };
        Returns: HomeOverview;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRoleKey;
      authorized_floor: FloorKey;
      active_status: AccessStatusKey;
      access_stage: AccessStage;
      access_decision: AccessDecision;
      denial_reason: DenialReason;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
