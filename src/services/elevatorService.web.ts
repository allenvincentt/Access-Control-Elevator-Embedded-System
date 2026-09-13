import { AppError } from '@/lib/errors';
import type { FloorKey } from '@/types/database';

export type ElevatorState = 'idle' | 'door_open' | 'traveling';
export type ElevatorSessionResult = 'none' | 'arrived' | 'timeout' | 'cancelled';

export type ElevatorStatus = {
  state: ElevatorState;
  doorOpen: boolean;
  currentFloor: FloorKey | null;
  selectedFloor: FloorKey | null;
  sessionResult: ElevatorSessionResult;
  remainingMs: number;
  /** BLE clients the controller currently has connected, this device included. */
  connectedClients: number;
};

/** Browsers get no Bluetooth link, so scanner presence cannot be read here. */
export const SCANNER_LINK_SUPPORTED = false;

function unsupported(): never {
  throw new AppError(
    'ELEVATOR_UNSUPPORTED_PLATFORM',
    'Bluetooth elevator control is only available in the mobile app, not the web browser.',
  );
}

export async function openDoorForStaff(
  _sessionToken: string,
  _floors: FloorKey[],
  _staffName: string,
): Promise<ElevatorStatus> {
  unsupported();
}

export async function readElevatorStatus(): Promise<ElevatorStatus> {
  unsupported();
}

export async function readConnectedScannerCount(): Promise<number> {
  unsupported();
}

export async function cancelElevatorSession(): Promise<void> {
  unsupported();
}
