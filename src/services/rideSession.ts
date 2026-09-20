import { getDeviceId } from '@/lib/deviceId';
import { errorMessage } from '@/lib/errors';
import {
  cancelElevatorSession,
  diagnoseLink,
  openDoorForStaff,
  readBoardingStatus,
  readElevatorStatus,
  type BoardingStatus,
} from '@/services/elevatorService';
import { cancelVerificationSession, commitFloorAccess } from '@/services/verificationService';
import type { FloorKey, StaffRoleKey } from '@/types/database';

export type Rider = {
  token: string;
  name: string;
  companyId: string;
  role: StaffRoleKey;
  floors: FloorKey[];
};

export type RideResult = 'arrived' | 'timeout' | 'cancelled';

export type RideOutcome = {
  result: RideResult;
  floor: FloorKey | null;
  riders: number;
};

export type RideState = {
  riders: Rider[];
  boarding: BoardingStatus | null;
  boardingError: string | null;
  boardingCheck: string | null;
  outcome: RideOutcome | null;
  error: string | null;
};

const STATUS_POLL_MS = 700;
const BOARDING_POLL_MS = 700;
const POLL_FAILURE_GRACE = 8;
const BOARDING_FAILURE_GRACE = 4;

const EMPTY: RideState = {
  riders: [],
  boarding: null,
  boardingError: null,
  boardingCheck: null,
  outcome: null,
  error: null,
};

let state: RideState = EMPTY;
const listeners = new Set<(next: RideState) => void>();

let statusTimer: ReturnType<typeof setInterval> | null = null;
let boardingTimer: ReturnType<typeof setInterval> | null = null;
let statusInFlight = false;
let boardingInFlight = false;
let pollFailures = 0;
let boardingFailures = 0;
let settling = false;

function emit(patch: Partial<RideState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener(state);
  }
}

export function getRideState(): RideState {
  return state;
}

export function subscribeRide(listener: (next: RideState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function stopWatchers() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  if (boardingTimer) {
    clearInterval(boardingTimer);
    boardingTimer = null;
  }
}

async function commitTrips(riders: Rider[], floor: FloorKey) {
  const deviceId = await getDeviceId();
  for (const rider of riders) {
    try {
      await commitFloorAccess(rider.token, floor, deviceId);
    } catch {
      continue;
    }
  }
}

async function releaseTokens(riders: Rider[]) {
  for (const rider of riders) {
    try {
      await cancelVerificationSession(rider.token);
    } catch {
      continue;
    }
  }
}

async function settle(result: RideResult, floor: FloorKey | null) {
  if (settling) return;
  settling = true;
  stopWatchers();

  const riders = state.riders;
  emit({ riders: [], outcome: { result, floor, riders: riders.length } });

  try {
    if (result === 'arrived' && floor) {
      await commitTrips(riders, floor);
    } else {
      await releaseTokens(riders);
    }
  } finally {
    settling = false;
  }
}

async function pollStatus() {
  if (statusInFlight || state.riders.length === 0) return;
  statusInFlight = true;
  try {
    const status = await readElevatorStatus();
    pollFailures = 0;

    if (status.sessionResult === 'arrived') {
      await settle('arrived', status.selectedFloor);
      return;
    }
    if (status.sessionResult === 'timeout') {
      await settle('timeout', null);
      return;
    }
    if (status.sessionResult === 'cancelled') {
      await settle('cancelled', null);
    }
  } catch (error) {
    pollFailures += 1;
    if (pollFailures >= POLL_FAILURE_GRACE) {
      emit({ error: errorMessage(error, 'The elevator controller stopped responding.') });
      await settle('cancelled', null);
    }
  } finally {
    statusInFlight = false;
  }
}

async function pollBoarding() {
  if (boardingInFlight) return;
  boardingInFlight = true;
  try {
    const boarding = await readBoardingStatus();
    boardingFailures = 0;
    emit({ boarding, boardingError: null, boardingCheck: null });
  } catch (error) {
    boardingFailures += 1;
    if (boardingFailures === BOARDING_FAILURE_GRACE) {
      const diagnosis = await diagnoseLink();
      emit({
        boardingError:
          diagnosis?.why ??
          errorMessage(error, 'The controller is not reporting boarding status over Bluetooth.'),
        boardingCheck: diagnosis?.check ?? null,
      });
    }
  } finally {
    boardingInFlight = false;
  }
}

function ensureWatchers() {
  if (!statusTimer) {
    statusTimer = setInterval(() => void pollStatus(), STATUS_POLL_MS);
  }
  if (!boardingTimer) {
    boardingTimer = setInterval(() => void pollBoarding(), BOARDING_POLL_MS);
  }
}

export async function joinRide(rider: Rider): Promise<void> {
  emit({ error: null, outcome: null });
  try {
    await openDoorForStaff(rider.token, rider.floors, rider.name);
  } catch (error) {
    emit({ error: errorMessage(error, 'The elevator controller refused this rider.') });
    throw error;
  }

  pollFailures = 0;
  emit({ riders: [...state.riders, rider] });
  ensureWatchers();
  void pollBoarding();
}

export async function abandonRide(): Promise<void> {
  const riders = state.riders;
  stopWatchers();
  emit({ riders: [], boarding: null, boardingError: null, boardingCheck: null, error: null });
  await cancelElevatorSession();
  await releaseTokens(riders);
}

export function clearRideOutcome() {
  emit({ outcome: null, error: null });
}

export async function refreshBoarding(): Promise<void> {
  boardingFailures = 0;
  emit({ boardingError: null, boardingCheck: null });
  await pollBoarding();
}

export function watchBoardingOnly(): () => void {
  if (!boardingTimer) {
    boardingTimer = setInterval(() => void pollBoarding(), BOARDING_POLL_MS);
  }
  void pollBoarding();
  return () => {
    if (state.riders.length > 0) return;
    stopWatchers();
  };
}
