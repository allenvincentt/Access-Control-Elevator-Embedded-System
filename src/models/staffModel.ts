import type { AccessStatusKey, FloorKey, StaffRow } from '@/types/database';

export type StaffModel = {
  id: string;
  fullName: string;
  email: string;
  companyId: string;
  authorizedFloors: FloorKey[];
  accessStatus: AccessStatusKey;
  photoPath: string | null;
  faceEnrolledAt: string | null;
  faceTemplateCount: number;
  createdAt: string;
  updatedAt: string;
};

export function toStaffModel(row: StaffRow): StaffModel {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    companyId: row.company_id,
    authorizedFloors: row.authorized_floors,
    accessStatus: row.access_status,
    photoPath: row.photo_path,
    faceEnrolledAt: row.face_enrolled_at,
    faceTemplateCount: row.face_template_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
