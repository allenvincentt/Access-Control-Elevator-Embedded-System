import { AppError } from '@/lib/errors';
import type { FloorKey } from '@/types/database';

export type ElevatorState = 'idle' | 'door_open' | 'traveling';
export type ElevatorSessionResult = 'none' | 'arrived' | 'timeout' | 'cancelled';
export type RidePhase = 'idle' | 'boarding' | 'counting' | 'cleared';
export type RideFault =
  | 'none'
  | 'mismatch'
  | 'offline'
  | 'cancelled'
  | 'no_floor'
  | 'hold_expired';

export type BoardingStatus = {
  phase: RidePhase;
  expected: number;
  observed: number;
  attempt: number;
  maxAttempts: number;
  deadlineMs: number;
  doorOpen: boolean;
  emergency: boolean;
  fault: RideFault;
  faultSeq: number;
};

export type ElevatorStatus = {
  state: ElevatorState;
  doorOpen: boolean;
  currentFloor: FloorKey | null;
  selectedFloor: FloorKey | null;
  sessionResult: ElevatorSessionResult;
  remainingMs: number;
  /** Floor whose button was last pressed while not authorized on the active grant. */
  deniedFloor: FloorKey | null;
  /** Increments each time `deniedFloor` fires, so pollers can detect a new denial. */
  deniedSeq: number;
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

export async function reportOccupancy(_count: number): Promise<void> {
  unsupported();
}

export async function readBoardingStatus(): Promise<BoardingStatus> {
  unsupported();
}

export function watchBoarding(
  _listener: (status: BoardingStatus) => void,
  _onError?: (error: AppError) => void,
): () => void {
  return () => undefined;
}
