import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { VerificationSession } from '@/app/auth/scanner-screens/ScannerFlow';
import { HintRow } from '@/components/HintRow';
import { ScannerScaffold } from '@/components/scanner/ScannerScaffold';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon, type IconName } from '@/components/ui/Icon';
import { floorShortLabel } from '@/constants/floors';
import { colors, spacing, typography } from '@/constants/themeColor';
import { errorMessage } from '@/lib/errors';
import { announceBoardingHold } from '@/lib/speech';
import { getRideState, joinRide } from '@/services/rideSession';
import { cancelVerificationSession } from '@/services/verificationService';
import type { FloorKey } from '@/types/database';

export type DoorReleaseScreenProps = {
  session: VerificationSession;
  floors: FloorKey[];
  onReleased: () => void;
  onCancel: () => void;
};

type Phase = 'releasing' | 'released' | 'error';

const RETURN_HOLD_MS = 2000;

export function DoorReleaseScreen({
  session,
  floors,
  onReleased,
  onCancel,
}: DoorReleaseScreenProps) {
  const mounted = useRef(true);
  const hasReleased = useRef(false);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<Phase>('releasing');
  const [riders, setRiders] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);

  const clearReturnTimer = useCallback(() => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = null;
  }, []);

  const release = useCallback(async () => {
    clearReturnTimer();
    setPhase('releasing');
    setDetail(null);

    try {
      await joinRide({
        token: session.token,
        name: session.staffName,
        companyId: session.companyId,
        role: session.role,
        floors,
      });
      if (!mounted.current) return;

      const count = getRideState().riders.length;
      setRiders(count);
      setPhase('released');
      announceBoardingHold(count);
      returnTimer.current = setTimeout(() => {
        if (mounted.current) onReleased();
      }, RETURN_HOLD_MS);
    } catch (error) {
      if (!mounted.current) return;
      setDetail(
        errorMessage(error, 'The elevator controller could not be reached over Bluetooth.'),
      );
      setPhase('error');
    }
  }, [
    clearReturnTimer,
    floors,
    onReleased,
    session.companyId,
    session.role,
    session.staffName,
    session.token,
  ]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearReturnTimer();
    };
  }, [clearReturnTimer]);

  useEffect(() => {
    if (hasReleased.current) return;
    hasReleased.current = true;
    void release();
  }, [release]);

  const handleExit = useCallback(() => {
    clearReturnTimer();
    if (phase === 'error') {
      void cancelVerificationSession(session.token);
    }
    onCancel();
  }, [clearReturnTimer, onCancel, phase, session.token]);

  const handleContinue = useCallback(() => {
    clearReturnTimer();
    onReleased();
  }, [clearReturnTimer, onReleased]);

  const first = riders <= 1;

  return (
    <ScannerScaffold
      step="Step 3 of 3"
      title="Door release"
      subtitle={`${session.staffName} · ${session.companyId}`}
      onExit={handleExit}
      exitIcon="back"
      exitLabel="Back to barcode"
      camera={null}
      panel={
        phase === 'released' ? (
          <>
            <PanelHead
              icon="checkCircle"
              color={colors.success}
              title={first ? 'Door opening' : `Rider ${riders} added`}
            />
            <Text style={styles.body}>
              {first
                ? 'The controller confirmed this rider and is opening the door.'
                : 'The controller confirmed this rider. The door is already open and still held.'}
            </Text>
            <HintRow tone="success" title="Cleared floors">
              {floors.map((floor) => floorShortLabel(floor)).join(' · ')}
            </HintRow>
            <GeneralButton
              label="Scan next badge"
              icon="qr"
              fullWidth
              onPress={handleContinue}
            />
          </>
        ) : phase === 'error' ? (
          <>
            <PanelHead icon="error" color={colors.danger} title="Controller not reached" />
            <HintRow tone="danger" title="Why">
              {detail ?? 'The elevator controller could not be reached over Bluetooth.'}
            </HintRow>
            <HintRow tone="neutral" title="What to check">
              Bluetooth is on, the controller is powered on, and this phone is close to the car.
            </HintRow>
            <View style={styles.row}>
              <GeneralButton
                label="Back"
                variant="outline"
                icon="back"
                onPress={handleExit}
                style={styles.rowBtn}
              />
              <GeneralButton
                label="Try again"
                icon="refresh"
                onPress={() => void release()}
                style={styles.rowBtn}
              />
            </View>
          </>
        ) : (
          <>
            <PanelHead icon="bluetooth" color={colors.primary} title="Releasing the door…" />
            <Text style={styles.body}>
              Telling the elevator controller that {session.staffName} passed verification.
            </Text>
            <HintRow tone="info" title="Stay near the car">
              The controller has to acknowledge this rider before the next badge can be scanned.
            </HintRow>
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
