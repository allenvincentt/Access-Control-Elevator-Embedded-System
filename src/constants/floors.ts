import type { SelectOption } from '@/components/ui/Select';
import { AccessStatus, AuthorizedFloor } from '@/enums/staffEnum';
import type { AccessStatusKey, FloorKey } from '@/types/database';

export const FLOOR_KEYS: FloorKey[] = ['MainLobby', 'SecondFloor', 'ThirdFloor'];

const FLOOR_SHORT: Record<FloorKey, string> = {
  MainLobby: 'Main Lobby',
  SecondFloor: '2nd Floor',
  ThirdFloor: '3rd Floor',
};

export function floorLabel(key: string): string {
  return AuthorizedFloor[key as FloorKey] ?? key;
}

export function floorShortLabel(key: string): string {
  return FLOOR_SHORT[key as FloorKey] ?? key;
}

export const FLOOR_OPTIONS: SelectOption[] = FLOOR_KEYS.map((key) => ({
  value: key,
  label: FLOOR_SHORT[key],
  description: AuthorizedFloor[key],
}));

export const ACCESS_STATUS_KEYS: AccessStatusKey[] = ['Active', 'Suspended'];

export function accessStatusLabel(key: string): string {
  return AccessStatus[key as AccessStatusKey] ?? key;
}

export function isFloorKey(value: string): value is FloorKey {
  return (FLOOR_KEYS as string[]).includes(value);
}
