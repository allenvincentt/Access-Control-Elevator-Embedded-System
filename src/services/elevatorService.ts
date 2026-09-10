import { isFloorKey } from '@/constants/floors';
import { ELEVATOR_BASE_URL, ELEVATOR_DEVICE_KEY, IS_ELEVATOR_CONFIGURED } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { FloorKey } from '@/types/database';

const REQUEST_TIMEOUT_MS = 6000;

export type ElevatorState = 'idle' | 'door_open' | 'traveling';
export type ElevatorSessionResult = 'none' | 'arrived' | 'timeout' | 'cancelled';

export type ElevatorStatus = {
  state: ElevatorState;
  doorOpen: boolean;
  currentFloor: FloorKey | null;
  selectedFloor: FloorKey | null;
  sessionResult: ElevatorSessionResult;
  remainingMs: number;
};

const STATUS_FAILURES: Record<number, string> = {
  400: 'The elevator controller rejected the unlock: no authorized floors were sent.',
  401: 'The elevator controller rejected this terminal. Check EXPO_PUBLIC_ELEVATOR_KEY.',
  409: 'The elevator is still finishing another trip. Wait for the door to close and retry.',
};

function readState(value: unknown): ElevatorState {
  return value === 'door_open' || value === 'traveling' ? value : 'idle';
}

function readSessionResult(value: unknown): ElevatorSessionResult {
  return value === 'arrived' || value === 'timeout' || value === 'cancelled' ? value : 'none';
}

function readFloor(value: unknown): FloorKey | null {
  return typeof value === 'string' && isFloorKey(value) ? value : null;
}

function parseStatus(payload: unknown): ElevatorStatus {
  if (typeof payload !== 'object' || payload === null) {
    throw new AppError('ELEVATOR_BAD_RESPONSE', 'The elevator controller sent an unreadable reply.');
  }

  const raw = payload as Record<string, unknown>;
  const remaining = Number(raw.remaining_ms);

  return {
    state: readState(raw.state),
    doorOpen: raw.door_open === true,
    currentFloor: readFloor(raw.current_floor),
    selectedFloor: readFloor(raw.selected_floor),
    sessionResult: readSessionResult(raw.session_result),
    remainingMs: Number.isFinite(remaining) ? Math.max(0, remaining) : 0,
  };
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  if (!IS_ELEVATOR_CONFIGURED) {
    throw new AppError(
      'ELEVATOR_NOT_CONFIGURED',
      'This terminal has no elevator controller address configured.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${ELEVATOR_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Elevator-Key': ELEVATOR_DEVICE_KEY,
        ...(init?.headers ?? {}),
      },
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new AppError(
        `ELEVATOR_${response.status}`,
        STATUS_FAILURES[response.status] ??
          `The elevator controller refused the request (${response.status}).`,
      );
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError(
        'ELEVATOR_TIMEOUT',
        'The elevator controller did not answer. Check that this phone is connected to the ElevatorTerminal Wi-Fi.',
      );
    }
    throw new AppError(
      'ELEVATOR_UNREACHABLE',
      'The elevator controller could not be reached. Check that this phone is connected to the ElevatorTerminal Wi-Fi.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function openDoorForStaff(
  sessionToken: string,
  floors: FloorKey[],
  staffName: string,
): Promise<ElevatorStatus> {
  if (floors.length === 0) {
    throw new AppError(
      'ELEVATOR_NO_FLOORS',
      'This staff member is not authorized for any floor, so the door stays closed.',
    );
  }

  const payload = await request('/grant', {
    method: 'POST',
    body: JSON.stringify({ token: sessionToken, floors, staff: staffName }),
  });

  return parseStatus(payload);
}

export async function readElevatorStatus(): Promise<ElevatorStatus> {
  return parseStatus(await request('/status'));
}

export async function cancelElevatorSession(): Promise<void> {
  try {
    await request('/reset', { method: 'POST' });
  } catch {
    return;
  }
}
