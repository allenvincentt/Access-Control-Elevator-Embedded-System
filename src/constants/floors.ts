import type { SelectOption } from '@/components/ui/Select';
import { AccessStatus, AuthorizedFloor, StaffRole } from '@/enums/staffEnum';
import type { AccessStatusKey, FloorKey, StaffRoleKey } from '@/types/database';

export const FLOOR_KEYS: FloorKey[] = ['FirstFloor', 'SecondFloor', 'ThirdFloor'];

export const MANDATORY_FLOOR: FloorKey = 'FirstFloor';

export const SELECTABLE_FLOOR_KEYS: FloorKey[] = FLOOR_KEYS.filter(
  (key) => key !== MANDATORY_FLOOR,
);

const FLOOR_SHORT: Record<FloorKey, string> = {
  FirstFloor: 'Main Lobby',
  SecondFloor: '2nd Floor',
  ThirdFloor: '3rd Floor',
};

export function floorLabel(key: string): string {
  return AuthorizedFloor[key as FloorKey] ?? key;
}

export function floorShortLabel(key: string): string {
  return FLOOR_SHORT[key as FloorKey] ?? key;
}

export const FLOOR_OPTIONS: SelectOption[] = SELECTABLE_FLOOR_KEYS.map((key) => ({
  value: key,
  label: FLOOR_SHORT[key],
  description: AuthorizedFloor[key],
}));

export function selectableFloors(floors: FloorKey[]): FloorKey[] {
  return floors.filter((floor) => floor !== MANDATORY_FLOOR);
}

export function withMandatoryFloor(floors: FloorKey[]): FloorKey[] {
  return [MANDATORY_FLOOR, ...selectableFloors(floors)];
}

export const ACCESS_STATUS_KEYS: AccessStatusKey[] = ['Active', 'Suspended'];

export function accessStatusLabel(key: string): string {
  return AccessStatus[key as AccessStatusKey] ?? key;
}

export function isFloorKey(value: string): value is FloorKey {
  return (FLOOR_KEYS as string[]).includes(value);
}

export const STAFF_ROLE_KEYS: StaffRoleKey[] = ['CompanyPersonnel', 'Guest'];

export function staffRoleLabel(key: string): string {
  return StaffRole[key as StaffRoleKey] ?? key;
}

const STAFF_ROLE_DESCRIPTIONS: Record<StaffRoleKey, string> = {
  CompanyPersonnel: 'Two-factor access: badge scan, then face verification.',
  Guest: 'Badge scan only — the face is captured but not matched.',
};

export const STAFF_ROLE_OPTIONS: SelectOption[] = STAFF_ROLE_KEYS.map((key) => ({
  value: key,
  label: StaffRole[key],
  description: STAFF_ROLE_DESCRIPTIONS[key],
}));

export function isStaffRoleKey(value: string): value is StaffRoleKey {
  return (STAFF_ROLE_KEYS as string[]).includes(value);
}
