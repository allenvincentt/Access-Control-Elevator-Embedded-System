import { AppError, toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isFloorKey, isStaffRoleKey, withMandatoryFloor } from '@/constants/floors';
import { FACE_MODEL_VERSION } from '@/services/face/constants';
import { removeStaffPhoto } from '@/services/storageService';
import type {
  AccessStatusKey,
  EnrollmentResult,
  FaceSamplePayload,
  FloorKey,
  StaffRoleKey,
  StaffRow,
} from '@/types/database';

const STAFF_COLUMNS =
  'id, full_name, email, company_id, role, authorized_floors, access_status, photo_path, face_enrolled_at, face_template_count, created_at, updated_at';

export const STAFF_PAGE_SIZE = 25;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMPANY_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

export type StaffListParams = {
  search?: string;
  status?: AccessStatusKey | 'all';
  page?: number;
  pageSize?: number;
};

export type StaffListResult = {
  rows: StaffRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type StaffCreateInput = {
  fullName: string;
  email: string;
  companyId: string;
  role: StaffRoleKey;
  authorizedFloors: FloorKey[];
  accessStatus: AccessStatusKey;
  photoPath?: string | null;
  faceSamples: FaceSamplePayload[];
};

export type StaffEditInput = {
  companyId: string;
  role: StaffRoleKey;
  authorizedFloors: FloorKey[];
  accessStatus: AccessStatusKey;
  photoPath?: string | null;
};

function normaliseName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function assertFloors(floors: FloorKey[]) {
  const unique = Array.from(new Set(withMandatoryFloor(floors)));
  if (unique.some((floor) => !isFloorKey(floor))) {
    throw new AppError('BAD_FLOOR', 'One of the selected floors is not recognised.');
  }
  return unique;
}

function assertRole(value: StaffRoleKey): StaffRoleKey {
  if (!isStaffRoleKey(value)) {
    throw new AppError('BAD_ROLE', 'Role must be Company Personnel or Guest.');
  }
  return value;
}

function assertCompanyId(value: string) {
  const normalised = value.trim().toUpperCase();
  if (!COMPANY_ID_PATTERN.test(normalised)) {
    throw new AppError(
      'BAD_COMPANY_ID',
      'Company ID must be 3-32 characters using A-Z, 0-9 and dashes.',
    );
  }
  return normalised;
}

function assertStatus(value: AccessStatusKey): AccessStatusKey {
  if (value !== 'Active' && value !== 'Suspended') {
    throw new AppError('BAD_STATUS', 'Access status must be Active or Suspended.');
  }
  return value;
}

function assertSamples(samples: FaceSamplePayload[]) {
  if (!Array.isArray(samples) || samples.length === 0) return [];
  if (samples.length > 5) {
    throw new AppError('TOO_MANY_SAMPLES', 'At most 5 face captures can be enrolled.');
  }
  samples.forEach((sample) => {
    if (
      !Array.isArray(sample.embedding) ||
      sample.embedding.some((value) => !Number.isFinite(value)) ||
      typeof sample.quality !== 'number' ||
      sample.quality < 0 ||
      sample.quality > 1
    ) {
      throw new AppError('BAD_SAMPLE', 'The face capture data was malformed. Capture again.');
    }
  });
  return samples;
}

export async function listStaff(params: StaffListParams = {}): Promise<StaffListResult> {
  const page = Math.max(0, params.page ?? 0);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? STAFF_PAGE_SIZE));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('staff')
    .select(STAFF_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  const status = params.status ?? 'all';
  if (status !== 'all') {
    query = query.eq('access_status', status);
  }

  const search = params.search?.trim().toLowerCase() ?? '';
  if (search.length > 0) {
    query = query.like('search_text', `%${search.replace(/[%_\\]/g, '')}%`);
  }

  const { data, error, count } = await query;
  if (error) throw toAppError(error, 'Staff could not be loaded.');

  const total = count ?? 0;
  return {
    rows: (data ?? []) as StaffRow[],
    total,
    page,
    pageSize,
    hasMore: from + (data?.length ?? 0) < total,
  };
}

export async function getStaff(id: string): Promise<StaffRow> {
  const { data, error } = await supabase
    .from('staff')
    .select(STAFF_COLUMNS)
    .eq('id', id)
    .single();

  if (error) throw toAppError(error, 'That staff record could not be loaded.');
  return data as StaffRow;
}

export async function createStaff(input: StaffCreateInput): Promise<StaffRow> {
  const fullName = normaliseName(input.fullName);
  if (fullName.length < 2 || fullName.length > 120) {
    throw new AppError('BAD_NAME', 'Enter a full name between 2 and 120 characters.');
  }

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new AppError('BAD_EMAIL', 'Enter a valid Gmail address.');
  }

  const { data, error } = await supabase.rpc('create_staff_with_face', {
    p_full_name: fullName,
    p_email: email,
    p_company_id: assertCompanyId(input.companyId),
    p_authorized_floors: assertFloors(input.authorizedFloors),
    p_access_status: assertStatus(input.accessStatus),
    p_photo_path: input.photoPath ?? null,
    p_samples: assertSamples(input.faceSamples),
    p_model_version: FACE_MODEL_VERSION,
    p_role: assertRole(input.role),
  });

  if (error) throw toAppError(error, 'The staff member could not be created.');
  return data as unknown as StaffRow;
}

export async function updateStaff(id: string, input: StaffEditInput): Promise<StaffRow> {
  const patch = {
    company_id: assertCompanyId(input.companyId),
    role: assertRole(input.role),
    authorized_floors: assertFloors(input.authorizedFloors),
    access_status: assertStatus(input.accessStatus),
    ...(input.photoPath !== undefined ? { photo_path: input.photoPath } : {}),
  };

  const { data, error } = await supabase
    .from('staff')
    .update(patch)
    .eq('id', id)
    .select(STAFF_COLUMNS)
    .single();

  if (error) throw toAppError(error, 'The staff member could not be updated.');
  return data as StaffRow;
}

export async function deleteStaff(id: string, photoPath?: string | null): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id);
  if (error) throw toAppError(error, 'The staff member could not be deleted.');
  if (photoPath) {
    await removeStaffPhoto(photoPath).catch(() => undefined);
  }
}

export async function enrollStaffFace(
  staffId: string,
  samples: FaceSamplePayload[],
): Promise<EnrollmentResult> {
  const validated = assertSamples(samples);
  if (validated.length === 0) {
    throw new AppError('NO_SAMPLES', 'At least one face capture is required.');
  }

  const { data, error } = await supabase.rpc('enroll_staff_face', {
    p_staff_id: staffId,
    p_samples: validated,
    p_model_version: FACE_MODEL_VERSION,
  });

  if (error) throw toAppError(error, 'The face could not be enrolled.');
  return data as unknown as EnrollmentResult;
}

export async function resetStaffFace(staffId: string): Promise<void> {
  const { error } = await supabase.rpc('reset_staff_face', { p_staff_id: staffId });
  if (error) throw toAppError(error, 'The face enrollment could not be cleared.');
}
