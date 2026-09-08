import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { VerificationSession } from '@/app/auth/scanner-screens/ScannerFlow';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { ScannerScaffold } from '@/components/scanner/ScannerScaffold';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon } from '@/components/ui/Icon';
import { floorLabel, floorShortLabel } from '@/constants/floors';
import { colors, spacing, typography } from '@/constants/themeColor';
import { getDeviceId } from '@/lib/deviceId';
import { DENIAL_MESSAGES, errorMessage } from '@/lib/errors';
import { commitFloorAccess } from '@/services/verificationService';
import type { FloorKey } from '@/types/database';

export type FloorSelectScreenProps = {
  session: VerificationSession;
  floors: FloorKey[];
  onFinished: () => void;
  onCancel: () => void;
};

type Status = 'choosing' | 'submitting' | 'granted' | 'error';

export function FloorSelectScreen({
  session,
  floors,
  onFinished,
  onCancel,
}: FloorSelectScreenProps) {
  const snackbar = useSnackbar();
  const mounted = useRef(true);

  const [status, setStatus] = useState<Status>('choosing');
  const [detail, setDetail] = useState<string | null>(null);
  const [grantedFloor, setGrantedFloor] = useState<FloorKey | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const choose = useCallback(
    async (floor: FloorKey) => {
      if (status === 'submitting') return;
      setStatus('submitting');
      setDetail(null);

      try {
        const deviceId = await getDeviceId();
        const result = await commitFloorAccess(session.token, floor, deviceId);
        if (!mounted.current) return;

        if (result.ok) {
          setGrantedFloor(result.floor);
          setStatus('granted');
          snackbar.show(
            `Access granted — ${result.staff.full_name} · ${floorLabel(result.floor)}`,
            { variant: 'success', duration: 4000 },
          );
          setTimeout(() => {
            if (mounted.current) onFinished();
          }, 1800);
          return;
        }

        setStatus('error');
        setDetail(DENIAL_MESSAGES[result.reason]);
        snackbar.show(DENIAL_MESSAGES[result.reason], { variant: 'error' });
        if (result.reason === 'SessionExpired') {
          setTimeout(() => {
            if (mounted.current) onCancel();
          }, 2200);
        }
      } catch (error) {
        if (!mounted.current) return;
        setStatus('error');
        const message = errorMessage(error, 'The floor could not be unlocked.');
        setDetail(message);
        snackbar.show(message, { variant: 'error' });
      }
    },
    [onCancel, onFinished, session.token, snackbar, status],
  );

  return (
    <ScannerScaffold
      step="Step 3 of 3"
      title="Choose your floor"
      subtitle={`${session.staffName} · ${session.companyId}`}
      onExit={onCancel}
      exitIcon="back"
      exitLabel="Back to barcode"
      camera={null}
      panel={
        status === 'granted' ? (
          <>
            <View style={styles.panelHead}>
              <Icon name="checkCircle" size={20} color={colors.success} />
              <Text style={styles.panelTitle}>Access granted</Text>
            </View>
            <Text style={styles.panelBody}>
              {grantedFloor ? floorLabel(grantedFloor) : 'Your floor'} unlocked for{' '}
              {session.staffName}.
            </Text>
          </>
        ) : status === 'error' ? (
          <>
            <View style={styles.panelHead}>
              <Icon name="error" size={20} color={colors.danger} />
              <Text style={styles.panelTitle}>Not granted</Text>
            </View>
            <HintRow tone="danger" title="Why">
              {detail ?? 'That floor could not be unlocked.'}
            </HintRow>
            <View style={styles.row}>
              <GeneralButton
                label="Back"
                variant="outline"
                icon="back"
                onPress={onCancel}
                style={styles.rowBtn}
              />
              <GeneralButton
                label="Try again"
                icon="refresh"
                onPress={() => setStatus('choosing')}
                style={styles.rowBtn}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.panelHead}>
              <Icon name="floors" size={20} color={colors.primary} />
              <Text style={styles.panelTitle}>
                {status === 'submitting' ? 'Unlocking…' : 'Where are you headed?'}
              </Text>
            </View>
            <Text style={styles.panelBody}>Pick the floor you need access to.</Text>
            <View style={styles.floorList}>
              {floors.map((floor) => (
                <GeneralButton
                  key={floor}
                  label={floorShortLabel(floor)}
                  icon="elevator"
                  fullWidth
                  disabled={status === 'submitting'}
                  onPress={() => void choose(floor)}
                />
              ))}
            </View>
          </>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  panelTitle: {
    color: colors.text,
    ...typography.subheading,
  },
  panelBody: {
    color: colors.textSecondary,
    ...typography.body,
  },
  floorList: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowBtn: {
    flex: 1,
  },
});

export default FloorSelectScreen;
