import { decode as base64ToBuffer, encode as bufferToBase64 } from 'base64-arraybuffer';
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Device } from '@sfourdrinier/react-native-ble-plx';

import { isFloorKey } from '@/constants/floors';
import { ELEVATOR_DEVICE_KEY, ELEVATOR_DEVICE_NAME, IS_ELEVATOR_CONFIGURED } from '@/lib/env';
import { AppError } from '@/lib/errors';
import type { FloorKey } from '@/types/database';

const SERVICE_UUID = '6e6c0001-b5a3-f393-e0a9-e50e24dcca9e';
const STATUS_CHAR_UUID = '6e6c0002-b5a3-f393-e0a9-e50e24dcca9e';
const COMMAND_CHAR_UUID = '6e6c0003-b5a3-f393-e0a9-e50e24dcca9e';
const BOARDING_CHAR_UUID = '6e6c0004-b5a3-f393-e0a9-e50e24dcca9e';

const SCAN_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 8000;
const ACK_ATTEMPTS = 20;
const ACK_INTERVAL_MS = 70;
const STAFF_NAME_MAX = 24;
const HEARTBEAT_SAMPLE_MS = 400;
const BOARDING_WATCH_MS = 700;

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
  /** Build marker reported by the controller, so a stale flash is visible. */
  firmware: string | null;
};

/** Bluetooth is a native-only capability; the web build reports false. */
export const SCANNER_LINK_SUPPORTED = true;

const ACK_FAILURES: Record<string, string> = {
  unauthorized: 'The elevator controller rejected this terminal. Check EXPO_PUBLIC_ELEVATOR_KEY.',
  busy: 'The elevator is still finishing another trip. Wait for the door to close and retry.',
  no_authorized_floors:
    'The elevator controller rejected the unlock: no authorized floors were sent.',
  unknown_action: 'The elevator controller did not understand the request.',
  no_shared_floor:
    'This badge shares no authorized floor with the group already boarding. Ride separately.',
  car_full: 'The elevator controller will not accept any more riders on this trip.',
  not_counting: 'The elevator controller is not waiting for an occupancy count right now.',
  bad_count: 'The elevator controller rejected that occupancy count.',
  too_long:
    'The command was too large for the elevator controller to accept. Shorten the staff name, or reflash the controller.',
};

let cmdSeq = Math.floor(Math.random() * 1679616);

function nextCommandId(): string {
  cmdSeq = (cmdSeq + 1) % 1679616;
  return cmdSeq.toString(36).padStart(4, '0');
}

let manager: BleManager | null = null;
let link: Device | null = null;
let connecting: Promise<Device> | null = null;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getManager(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

function encodePayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return bufferToBase64(bytes.buffer as ArrayBuffer);
}

function decodePayload(value: string): Record<string, unknown> {
  const text = new TextDecoder().decode(base64ToBuffer(value));
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new AppError('ELEVATOR_BAD_RESPONSE', 'The elevator controller sent an unreadable reply.');
  }
  return parsed as Record<string, unknown>;
}

function bleDetail(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const source = error as Record<string, unknown>;
  const parts: string[] = [];
  const reason = typeof source.reason === 'string' ? source.reason : null;
  const message = typeof source.message === 'string' ? source.message : null;
  if (reason) parts.push(reason);
  else if (message) parts.push(message);
  if (typeof source.errorCode === 'number') parts.push(`ble ${source.errorCode}`);
  if (typeof source.attErrorCode === 'number') parts.push(`att ${source.attErrorCode}`);
  if (typeof source.androidErrorCode === 'number') parts.push(`android ${source.androidErrorCode}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function unreachable(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const detail = bleDetail(error);
  return new AppError(
    'ELEVATOR_UNREACHABLE',
    detail
      ? `Bluetooth refused the request: ${detail}`
      : 'The elevator controller could not be reached over Bluetooth. Check that it is powered on and this phone is paired.',
  );
}

const CHARACTERISTIC_NAMES: Record<string, string> = {
  [STATUS_CHAR_UUID]: 'status',
  [COMMAND_CHAR_UUID]: 'command',
};

export type LinkDiagnosis = {
  why: string;
  check: string;
};

async function probeStatus(): Promise<{
  answered: boolean;
  build: string | null;
  hasRide: boolean;
}> {
  try {
    const payload = await readStatusPayload();
    const ride = payload.ride;
    return {
      answered: true,
      build: typeof payload.fw === 'string' && payload.fw ? payload.fw : null,
      hasRide: typeof ride === 'object' && ride !== null,
    };
  } catch {
    return { answered: false, build: null, hasRide: false };
  }
}

export async function diagnoseLink(): Promise<LinkDiagnosis | null> {
  try {
    const device = await getLink();
    const found = await device.characteristicsForService(SERVICE_UUID);
    const seen = found.map((entry) => entry.uuid.toLowerCase());
    const missing = Object.keys(CHARACTERISTIC_NAMES).filter(
      (uuid) => !seen.includes(uuid.toLowerCase()),
    );

    if (missing.length > 0) {
      const names = missing.map((uuid) => CHARACTERISTIC_NAMES[uuid]).join(', ');
      return {
        why: `This phone did not discover the ${names} characteristic on the controller, so it cannot talk to it at all.`,
        check: `Clear the Bluetooth cache in Settings, or forget "${ELEVATOR_DEVICE_NAME}" and restart the phone, then flash the current firmware/elevator-system sketch if it still fails.`,
      };
    }

    const status = await probeStatus();
    if (!status.answered) return null;

    if (!status.hasRide) {
      return {
        why: status.build
          ? `The controller is running firmware ${status.build}, which does not report ride state in its status payload.`
          : 'The controller answers over Bluetooth but reports no firmware build, so it is running a flash from before ride state existed.',
        check:
          'Flash the current firmware/elevator-system sketch to the ESP32. The door release works because it only needs the status and command characteristics, but the human detector needs the ride block the new sketch adds.',
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function ensurePermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const sdk = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  const wanted =
    sdk >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const held = await Promise.all(wanted.map((name) => PermissionsAndroid.check(name)));
  if (held.every(Boolean)) return;

  const granted = await PermissionsAndroid.requestMultiple(wanted);
  const missing = wanted.filter((name) => granted[name] !== PermissionsAndroid.RESULTS.GRANTED);
  if (missing.length > 0) {
    throw new AppError(
      'ELEVATOR_NO_PERMISSION',
      'Bluetooth permission is required to reach the elevator controller. Enable it in Settings.',
    );
  }
}

async function ensurePoweredOn(): Promise<void> {
  const current = await getManager().state();
  if (current === State.PoweredOn) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove();
      reject(
        new AppError('ELEVATOR_BT_OFF', 'Turn on Bluetooth to reach the elevator controller.'),
      );
    }, 4000);

    const subscription = getManager().onStateChange((next) => {
      if (next === State.PoweredOn) {
        clearTimeout(timer);
        subscription.remove();
        resolve();
      }
    }, true);
  });
}

async function scanForController(): Promise<Device> {
  const ble = getManager();
  return new Promise<Device>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        ble.stopDeviceScan();
      } catch {}
      outcome();
    };

    timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new AppError(
              'ELEVATOR_NOT_FOUND',
              'The elevator controller was not found nearby. Check that it is powered on.',
            ),
          ),
        ),
      SCAN_TIMEOUT_MS,
    );

    ble.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        settle(() => reject(unreachable(error)));
        return;
      }
      if (device && (device.name === ELEVATOR_DEVICE_NAME || device.localName === ELEVATOR_DEVICE_NAME || !device.name)) {
        settle(() => resolve(device));
      }
    });
  });
}

async function connect(): Promise<Device> {
  await ensurePermissions();
  await ensurePoweredOn();

  const found = await scanForController();
  const connected = await found.connect({ requestMTU: 247, timeout: CONNECT_TIMEOUT_MS });
  await connected.discoverAllServicesAndCharacteristics();

  connected.onDisconnected(() => {
    if (link?.id === connected.id) {
      link = null;
    }
  });

  link = connected;
  return connected;
}

async function getLink(): Promise<Device> {
  if (link && (await link.isConnected())) {
    return link;
  }
  link = null;
  if (!connecting) {
    connecting = connect().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

async function readStatusPayload(): Promise<Record<string, unknown>> {
  try {
    const device = await getLink();
    const characteristic = await device.readCharacteristicForService(
      SERVICE_UUID,
      STATUS_CHAR_UUID,
    );
    if (!characteristic.value) {
      throw new AppError('ELEVATOR_BAD_RESPONSE', 'The elevator controller sent an empty reply.');
    }
    return decodePayload(characteristic.value);
  } catch (error) {
    throw unreachable(error);
  }
}

type ResolvedAck = { ok: boolean; error: string };

function settled(ok: boolean, error: string): boolean {
  return ok || error !== 'none';
}

function findAck(status: Record<string, unknown>, cmdId: string): ResolvedAck | null {
  const table = Array.isArray(status.acks) ? status.acks : [];
  for (const row of table) {
    if (typeof row !== 'object' || row === null) continue;
    const entry = row as Record<string, unknown>;
    if (entry.id !== cmdId) continue;
    const ok = entry.ok === true;
    const error = typeof entry.err === 'string' ? entry.err : 'none';
    if (settled(ok, error)) return { ok, error };
  }

  if (status.ack_id !== cmdId) return null;
  const ok = status.ack_ok === true;
  const error = typeof status.ack_error === 'string' ? status.ack_error : 'none';
  return settled(ok, error) ? { ok, error } : null;
}

function ackFailure(error: string): AppError {
  return new AppError(
    `ELEVATOR_${error.toUpperCase()}`,
    ACK_FAILURES[error] ?? `The elevator controller refused the request (${error}).`,
  );
}

async function writeCommand(command: Record<string, unknown>, cmdId: string): Promise<void> {
  try {
    const device = await getLink();
    await device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      COMMAND_CHAR_UUID,
      encodePayload({ key: ELEVATOR_DEVICE_KEY, cmd_id: cmdId, ...command }),
    );
  } catch (error) {
    throw unreachable(error);
  }
}

function counterOf(payload: Record<string, unknown>, key: string): number | null {
  const parsed = Number(payload[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function unacknowledged(cmdId: string): Promise<AppError> {
  try {
    const first = await readStatusPayload();
    await delay(HEARTBEAT_SAMPLE_MS);
    const second = await readStatusPayload();

    const build = typeof first.fw === 'string' && first.fw ? first.fw : 'unknown';
    if (build === 'unknown') {
      return new AppError(
        'ELEVATOR_STALE_FIRMWARE',
        'The controller is answering but reports no firmware build, so it is running an old flash. Upload the current firmware/elevator-system sketch.',
      );
    }

    const ticksBefore = counterOf(first, 'lp');
    const ticksAfter = counterOf(second, 'lp');
    if (ticksBefore !== null && ticksAfter !== null && ticksAfter === ticksBefore) {
      return new AppError(
        'ELEVATOR_STALLED',
        `The controller answers over Bluetooth but its main loop is stopped (firmware ${build}), so it can never act on a command. Power-cycle the ESP32 and watch the serial monitor at boot.`,
      );
    }

    const dropped = counterOf(second, 'dr') ?? 0;
    if (dropped > 0) {
      return new AppError(
        'ELEVATOR_QUEUE_FULL',
        `The controller's command queue overflowed and has dropped ${dropped} write(s) (firmware ${build}), so ${cmdId} never reached the sketch. Retry, and stagger the two terminals if this keeps happening.`,
      );
    }

    const writes = counterOf(second, 'rx');
    if (writes === 0) {
      return new AppError(
        'ELEVATOR_WRITE_LOST',
        `The controller is running (firmware ${build}) but has not received a single command write, so the write is being dropped before it reaches the sketch. Forget the pairing in Bluetooth settings and reconnect.`,
      );
    }

    return new AppError(
      'ELEVATOR_NO_ACK',
      `The controller received ${writes ?? 'some'} command writes (firmware ${build}) but never acknowledged ${cmdId}. Check the serial monitor for a "[command] rx" line as you scan.`,
    );
  } catch {
    return new AppError(
      'ELEVATOR_TIMEOUT',
      'The elevator controller stopped answering mid-command. Move closer and retry.',
    );
  }
}

async function sendCommand(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cmdId = nextCommandId();
  await writeCommand(command, cmdId);

  for (let attempt = 0; attempt < ACK_ATTEMPTS; attempt++) {
    const status = await readStatusPayload();
    const ack = findAck(status, cmdId);
    if (ack) {
      if (!ack.ok) throw ackFailure(ack.error);
      return status;
    }
    await delay(ACK_INTERVAL_MS);
  }

  throw await unacknowledged(cmdId);
}

function readStateValue(value: unknown): ElevatorState {
  return value === 'door_open' || value === 'traveling' ? value : 'idle';
}

function readSessionResult(value: unknown): ElevatorSessionResult {
  return value === 'arrived' || value === 'timeout' || value === 'cancelled' ? value : 'none';
}

function readFloor(value: unknown): FloorKey | null {
  return typeof value === 'string' && isFloorKey(value) ? value : null;
}

function parseStatus(payload: Record<string, unknown>): ElevatorStatus {
  const remaining = Number(payload.remaining_ms);
  const clients = Number(payload.clients);
  const deniedSeq = Number(payload.denied_seq);
  return {
    state: readStateValue(payload.state),
    doorOpen: payload.door_open === true,
    currentFloor: readFloor(payload.current_floor),
    selectedFloor: readFloor(payload.selected_floor),
    sessionResult: readSessionResult(payload.session_result),
    remainingMs: Number.isFinite(remaining) ? Math.max(0, remaining) : 0,
    deniedFloor: readFloor(payload.denied_floor),
    // Firmware before this build omits "denied_seq"; treat that as "no denials yet".
    deniedSeq: Number.isFinite(deniedSeq) ? Math.max(0, Math.trunc(deniedSeq)) : 0,
    // Firmware before the multi-client build omits "clients"; treat that as
    // "just this link".
    connectedClients: Number.isFinite(clients) ? Math.max(0, Math.trunc(clients)) : 1,
    firmware: typeof payload.fw === 'string' && payload.fw ? payload.fw : null,
  };
}

function readRidePhase(value: unknown): RidePhase {
  return value === 'boarding' || value === 'counting' || value === 'cleared' ? value : 'idle';
}

function readRideFault(value: unknown): RideFault {
  return value === 'mismatch' ||
    value === 'offline' ||
    value === 'cancelled' ||
    value === 'no_floor' ||
    value === 'hold_expired'
    ? value
    : 'none';
}

function countOf(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function parseBoarding(payload: Record<string, unknown>): BoardingStatus {
  return {
    phase: readRidePhase(payload.s),
    expected: countOf(payload.e, 0),
    observed: countOf(payload.o, 0),
    attempt: countOf(payload.a, 0),
    maxAttempts: countOf(payload.m, 3),
    deadlineMs: countOf(payload.t, 0),
    doorOpen: payload.d === true,
    emergency: payload.g === true,
    fault: readRideFault(payload.f),
    faultSeq: countOf(payload.q, 0),
  };
}

function assertConfigured(): void {
  if (!IS_ELEVATOR_CONFIGURED) {
    throw new AppError(
      'ELEVATOR_NOT_CONFIGURED',
      'This terminal has no elevator device key configured.',
    );
  }
}

export async function openDoorForStaff(
  _sessionToken: string,
  floors: FloorKey[],
  staffName: string,
): Promise<ElevatorStatus> {
  assertConfigured();
  if (floors.length === 0) {
    throw new AppError(
      'ELEVATOR_NO_FLOORS',
      'This staff member is not authorized for any floor, so the door stays closed.',
    );
  }

  const status = await sendCommand({
    action: 'grant',
    floors,
    staff: staffName.slice(0, STAFF_NAME_MAX),
  });
  return parseStatus(status);
}

export async function reportOccupancy(count: number): Promise<void> {
  assertConfigured();
  const cmdId = nextCommandId();
  await writeCommand({ action: 'occupancy', count: Math.max(0, Math.trunc(count)) }, cmdId);
}

async function readBoardingFromChar(): Promise<BoardingStatus> {
  try {
    const device = await getLink();
    const characteristic = await device.readCharacteristicForService(
      SERVICE_UUID,
      BOARDING_CHAR_UUID,
    );
    if (!characteristic.value) {
      throw new AppError('ELEVATOR_BAD_RESPONSE', 'The elevator controller sent an empty reply.');
    }
    return parseBoarding(decodePayload(characteristic.value));
  } catch (error) {
    throw unreachable(error);
  }
}

export async function readBoardingStatus(): Promise<BoardingStatus> {
  assertConfigured();
  const status = await readStatusPayload();
  const ride = status.ride;
  if (typeof ride === 'object' && ride !== null) {
    return parseBoarding(ride as Record<string, unknown>);
  }
  return readBoardingFromChar();
}

export function watchBoarding(
  listener: (status: BoardingStatus) => void,
  onError?: (error: AppError) => void,
): () => void {
  let cancelled = false;
  let inFlight = false;

  const tick = async () => {
    if (cancelled || inFlight) return;
    inFlight = true;
    try {
      const status = await readBoardingStatus();
      if (!cancelled) listener(status);
    } catch (error) {
      if (!cancelled) onError?.(unreachable(error));
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => void tick(), BOARDING_WATCH_MS);
  void tick();

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

export async function readElevatorStatus(): Promise<ElevatorStatus> {
  assertConfigured();
  return parseStatus(await readStatusPayload());
}

/**
 * How many scanner terminals are on the controller's Bluetooth link right now.
 *
 * The controller counts every connected BLE client, and reading its status
 * makes this admin device one of them, so the monitoring link is subtracted
 * back out. Scanners are never registered anywhere — a phone that is connected
 * is counted, a phone that walks away stops being counted.
 */
export async function readConnectedScannerCount(): Promise<number> {
  const status = await readElevatorStatus();
  return Math.max(0, status.connectedClients - 1);
}

export async function cancelElevatorSession(): Promise<void> {
  try {
    await sendCommand({ action: 'reset' });
  } catch {
    return;
  }
}
