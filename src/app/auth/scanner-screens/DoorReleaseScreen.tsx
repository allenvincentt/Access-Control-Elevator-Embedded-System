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

type Phase = 'opening' | 'waiting' | 'arrived' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 700;
const DONE_HOLD_MS = 2600;

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

  const [phase, setPhase] = useState<Phase>('opening');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [arrivedFloor, setArrivedFloor] = useState<FloorKey | null>(null);
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

      setSecondsLeft(Math.ceil(status.remainingMs / 1000));

      if (status.sessionResult === 'arrived' && status.selectedFloor) {
        setArrivedFloor(status.selectedFloor);
        setPhase('arrived');
        snackbar.show(`${session.staffName} · ${floorLabel(status.selectedFloor)}`, {
          variant: 'success',
          duration: 4000,
        });
        void recordTrip(status.selectedFloor);
        finishAfterHold();
        return;
      }

      if (status.sessionResult === 'timeout') {
        setPhase('timeout');
        snackbar.show('The door closed before a floor was chosen.', { variant: 'info' });
        finishAfterHold();
      }
    } catch (error) {
      fail(errorMessage(error, 'The elevator controller stopped responding.'));
    } finally {
      inFlight.current = false;
    }
  }, [fail, finishAfterHold, recordTrip, session.staffName, snackbar]);

  const open = useCallback(async () => {
    setPhase('opening');
    setDetail(null);
    try {
      const status = await openDoorForStaff(session.token, floors, session.staffName);
      if (!mounted.current) return;
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
    if (phase !== 'waiting') return;
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
              {arrivedFloor ? floorLabel(arrivedFloor) : 'Your floor'} reached. The door is closed.
            </Text>
          </>
        ) : phase === 'timeout' ? (
          <>
            <PanelHead icon="warning" color={colors.warning} title="Door closed" />
            <HintRow tone="warning" title="What happened">
              No authorized floor button was pressed within 30 seconds. Scan your badge again to
              reopen the door.
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
