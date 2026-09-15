import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { VerificationSession } from '@/app/auth/scanner-screens/ScannerFlow';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { ScannerScaffold } from '@/components/scanner/ScannerScaffold';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon, type IconName } from '@/components/ui/Icon';
import { floorLabel, floorShortLabel } from '@/constants/floors';
import { colors, spacing, typography } from '@/constants/themeColor';
import { getDeviceId } from '@/lib/deviceId';
import { DENIAL_MESSAGES, errorMessage } from '@/lib/errors';
import { announceAccessDenied } from '@/lib/speech';
import {
  cancelElevatorSession,
  openDoorForStaff,
  readElevatorStatus,
} from '@/services/elevatorService';
import { commitFloorAccess } from '@/services/verificationService';
import type { FloorKey } from '@/types/database';

export type DoorReleaseScreenProps = {
  session: VerificationSession;
  floors: FloorKey[];
  onFinished: () => void;
  onCancel: () => void;
};

type Phase = 'opening' | 'waiting' | 'moving' | 'arrived' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 700;
const DONE_HOLD_MS = 2600;

/**
 * The controller's radio shares a supply rail with the lift motor, and the
 * motor kicks at full duty the instant a floor is chosen. That is enough to
 * drop a status read that happens to be in flight even though the trip itself
 * is running perfectly, so ride out a short run of failures rather than tearing
 * down a session the car is still executing.
 */
const POLL_FAILURE_GRACE = 6;

/**
 * An idle controller reporting no session result means it was reset or power
 * cycled out from under us. Confirm that across several reads before giving up,
 * so one odd snapshot cannot end a live session.
 */
const LOST_SESSION_GRACE = 4;

export function DoorReleaseScreen({
  session,
  floors,
  onFinished,
  onCancel,
}: DoorReleaseScreenProps) {
  const snackbar = useSnackbar();
  const mounted = useRef(true);
  const hasOpened = useRef(false);
  const inFlight = useRef(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailures = useRef(0);
  const lostReads = useRef(0);
  const lastDeniedSeq = useRef(0);
  /** Mirrors `chosen` for the polling closure, which must not read stale state. */
  const chosenRef = useRef<FloorKey | null>(null);

  const [phase, setPhase] = useState<Phase>('opening');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [chosen, setChosen] = useState<FloorKey | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const clearTimers = useCallback(() => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = null;
  }, []);

  const fail = useCallback(
    (message: string) => {
      if (!mounted.current) return;
      clearTimers();
      setDetail(message);
      setPhase('error');
      snackbar.show(message, { variant: 'error' });
    },
    [clearTimers, snackbar],
  );

  /**
   * The controller reports the chosen floor from the moment the button is
   * pressed, so hold on to it: the read that finally carries `arrived` is the
   * one most likely to be disturbed by the motor, and the trip still has to be
   * logged.
   */
  const rememberChosen = useCallback((floor: FloorKey) => {
    if (chosenRef.current === floor) return;
    chosenRef.current = floor;
    setChosen(floor);
  }, []);

  const recordTrip = useCallback(
    async (floor: FloorKey) => {
      try {
        const deviceId = await getDeviceId();
        const result = await commitFloorAccess(session.token, floor, deviceId);
        if (!mounted.current) return;
        if (!result.ok) {
          snackbar.show(DENIAL_MESSAGES[result.reason], { variant: 'info' });
        }
      } catch (error) {
        if (!mounted.current) return;
        snackbar.show(errorMessage(error, 'The trip could not be logged.'), { variant: 'info' });
      }
    },
    [session.token, snackbar],
  );

  const finishAfterHold = useCallback(() => {
    doneTimer.current = setTimeout(() => {
      if (mounted.current) onFinished();
    }, DONE_HOLD_MS);
  }, [onFinished]);

  const pollOnce = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const status = await readElevatorStatus();
      if (!mounted.current) return;
      pollFailures.current = 0;

      if (status.selectedFloor) rememberChosen(status.selectedFloor);
      setSecondsLeft(Math.ceil(status.remainingMs / 1000));

      if (status.deniedSeq > lastDeniedSeq.current) {
        lastDeniedSeq.current = status.deniedSeq;
        announceAccessDenied();
        if (status.deniedFloor) {
          snackbar.show(`${floorLabel(status.deniedFloor)} is not on this badge.`, {
            variant: 'info',
          });
        }
      }

      if (status.sessionResult === 'arrived') {
        const floor = status.selectedFloor ?? chosenRef.current;
        setPhase('arrived');
        snackbar.show(
          floor ? `${session.staffName} · ${floorLabel(floor)}` : `${session.staffName} · arrived`,
          { variant: 'success', duration: 4000 },
        );
        if (floor) void recordTrip(floor);
        finishAfterHold();
        return;
      }

      if (status.sessionResult === 'timeout') {
        setPhase('timeout');
        snackbar.show('The door closed before a floor was chosen.', { variant: 'info' });
        finishAfterHold();
        return;
      }

      if (status.sessionResult === 'cancelled') {
        fail('The elevator session was cancelled at the controller.');
        return;
      }

      // The car took the floor and is running the trip: the door has shut and
      // the selection window is spent, so stop offering a countdown that no
      // longer describes anything.
      if (status.state === 'traveling') {
        lostReads.current = 0;
        setPhase('moving');
        return;
      }

      if (status.state === 'door_open') {
        lostReads.current = 0;
        setPhase('waiting');
        return;
      }

      // Idle with nothing to report: the controller restarted or another
      // terminal reset it. Nothing further is coming, so stop rather than poll
      // a session that no longer exists.
      lostReads.current += 1;
      if (lostReads.current >= LOST_SESSION_GRACE) {
        fail('The elevator controller restarted and lost this session. Scan the badge again.');
      }
    } catch (error) {
      if (!mounted.current) return;
      pollFailures.current += 1;
      if (pollFailures.current >= POLL_FAILURE_GRACE) {
        fail(errorMessage(error, 'The elevator controller stopped responding.'));
      }
    } finally {
      inFlight.current = false;
    }
  }, [fail, finishAfterHold, recordTrip, rememberChosen, session.staffName, snackbar]);

  const open = useCallback(async () => {
    setPhase('opening');
    setDetail(null);
    setChosen(null);
    chosenRef.current = null;
    pollFailures.current = 0;
    lostReads.current = 0;
    try {
      const status = await openDoorForStaff(session.token, floors, session.staffName);
      if (!mounted.current) return;
      lastDeniedSeq.current = status.deniedSeq;
      setSecondsLeft(Math.ceil(status.remainingMs / 1000));
      setPhase('waiting');
    } catch (error) {
      fail(errorMessage(error, 'The door could not be opened.'));
    }
  }, [fail, floors, session.staffName, session.token]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (hasOpened.current) return;
    hasOpened.current = true;
    void open();
  }, [open]);

  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'moving') return;
    const ticker = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    return () => clearInterval(ticker);
  }, [phase, pollOnce]);

  const handleCancel = useCallback(() => {
    clearTimers();
    void cancelElevatorSession();
    onCancel();
  }, [clearTimers, onCancel]);

  return (
    <ScannerScaffold
      step="Step 3 of 3"
      title="Door released"
      subtitle={`${session.staffName} · ${session.companyId}`}
      onExit={handleCancel}
      exitIcon="back"
      exitLabel="Back to barcode"
      camera={null}
      panel={
        phase === 'arrived' ? (
          <>
            <PanelHead icon="checkCircle" color={colors.success} title="Arrived" />
            <Text style={styles.body}>
              {chosen ? floorLabel(chosen) : 'Your floor'} reached. The door is closed.
            </Text>
          </>
        ) : phase === 'moving' ? (
          <>
            <PanelHead icon="elevator" color={colors.primary} title="On the way" />
            <Text style={styles.body}>
              {chosen
                ? `${floorLabel(chosen)} selected. The door is closed and the car is moving.`
                : 'The door is closed and the car is moving.'}
            </Text>
          </>
        ) : phase === 'timeout' ? (
          <>
            <PanelHead icon="warning" color={colors.warning} title="Door closed" />
            <HintRow tone="warning" title="What happened">
              No authorized floor button was pressed before the door closed. Scan your badge again
              to reopen it.
            </HintRow>
          </>
        ) : phase === 'error' ? (
          <>
            <PanelHead icon="error" color={colors.danger} title="Door not released" />
            <HintRow tone="danger" title="Why">
              {detail ?? 'The elevator controller could not be reached.'}
            </HintRow>
            <View style={styles.row}>
              <GeneralButton
                label="Back"
                variant="outline"
                icon="back"
                onPress={handleCancel}
                style={styles.rowBtn}
              />
              <GeneralButton
                label="Retry"
                icon="refresh"
                onPress={() => void open()}
                style={styles.rowBtn}
              />
            </View>
          </>
        ) : (
          <>
            <PanelHead
              icon="elevator"
              color={colors.primary}
              title={phase === 'opening' ? 'Opening the door…' : 'Press your floor button'}
            />
            <Text style={styles.body}>
              {phase === 'opening'
                ? 'Releasing the elevator door.'
                : `Use the floor buttons in the car. ${secondsLeft}s left before the door closes.`}
            </Text>
            {phase === 'waiting' ? (
              <HintRow tone="info" title="Your floors">
                {floors.map((floor) => floorShortLabel(floor)).join(' · ')}
              </HintRow>
            ) : null}
          </>
        )
      }
    />
  );
}

function PanelHead({ icon, color, title }: { icon: IconName; color: string; title: string }) {
  return (
    <View style={styles.head}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    ...typography.subheading,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowBtn: {
    flex: 1,
  },
});

export default DoorReleaseScreen;
