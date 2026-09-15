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

const SCAN_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 8000;
const ACK_ATTEMPTS = 20;
const ACK_INTERVAL_MS = 70;

export type ElevatorState = 'idle' | 'door_open' | 'traveling';
export type ElevatorSessionResult = 'none' | 'arrived' | 'timeout' | 'cancelled';

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

/** Bluetooth is a native-only capability; the web build reports false. */
export const SCANNER_LINK_SUPPORTED = true;

const ACK_FAILURES: Record<string, string> = {
  unauthorized: 'The elevator controller rejected this terminal. Check EXPO_PUBLIC_ELEVATOR_KEY.',
  busy: 'The elevator is still finishing another trip. Wait for the door to close and retry.',
  no_authorized_floors:
    'The elevator controller rejected the unlock: no authorized floors were sent.',
  unknown_action: 'The elevator controller did not understand the request.',
};

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

function unreachable(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(
    'ELEVATOR_UNREACHABLE',
    'The elevator controller could not be reached over Bluetooth. Check that it is powered on and this phone is paired.',
  );
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
    const timer = setTimeout(() => {
      ble.stopDeviceScan();
      reject(
        new AppError(
          'ELEVATOR_NOT_FOUND',
          'The elevator controller was not found nearby. Check that it is powered on.',
        ),
      );
    }, SCAN_TIMEOUT_MS);

    ble.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        clearTimeout(timer);
        ble.stopDeviceScan();
        reject(unreachable(error));
        return;
      }
      if (device && (device.name === ELEVATOR_DEVICE_NAME || device.localName === ELEVATOR_DEVICE_NAME || !device.name)) {
        clearTimeout(timer);
        ble.stopDeviceScan();
        resolve(device);
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

async function sendCommand(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cmdId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

  for (let attempt = 0; attempt < ACK_ATTEMPTS; attempt++) {
    const status = await readStatusPayload();
    if (status.ack_id === cmdId) {
      return status;
    }
    await delay(ACK_INTERVAL_MS);
  }

  throw new AppError(
    'ELEVATOR_TIMEOUT',
    'The elevator controller did not confirm the request. Move closer and retry.',
  );
}

function assertAck(status: Record<string, unknown>): void {
  if (status.ack_ok === true) return;
  const reason = typeof status.ack_error === 'string' ? status.ack_error : 'error';
  throw new AppError(
    `ELEVATOR_${reason.toUpperCase()}`,
    ACK_FAILURES[reason] ?? `The elevator controller refused the request (${reason}).`,
  );
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
  sessionToken: string,
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
    token: sessionToken,
    floors,
    staff: staffName,
  });
  assertAck(status);
  return parseStatus(status);
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
