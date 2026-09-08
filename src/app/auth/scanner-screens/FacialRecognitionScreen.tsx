import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';

import type { VerificationSession } from '@/app/auth/scanner-screens/ScannerFlow';
import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { CameraPermissionGate } from '@/components/scanner/CameraPermissionGate';
import { ScannerOverlay, type ScannerStatus } from '@/components/scanner/ScannerOverlay';
import { ScannerScaffold } from '@/components/scanner/ScannerScaffold';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, typography } from '@/constants/themeColor';
import { getDeviceId } from '@/lib/deviceId';
import { DENIAL_MESSAGES, errorMessage } from '@/lib/errors';
import { FACE_MODEL_FAILURE_MESSAGES } from '@/services/face/constants';
import { warmUpFaceModel, type FaceModelState } from '@/services/face/embedder';
import { captureFaceFromPhoto } from '@/services/face/pipeline';
import { verifyFace } from '@/services/verificationService';
import type { FloorKey } from '@/types/database';

export type FacialRecognitionScreenProps = {
  session: VerificationSession;
  onFacePassed: (floors: FloorKey[]) => void;
  onCancel: () => void;
};

const CAPTIONS: Record<ScannerStatus, string> = {
  idle: 'Centre your face in the oval',
  scanning: 'Hold still…',
  verifying: 'Matching your face…',
  error: 'Face not matched',
  success: 'Identity confirmed',
};

const HINTS = [
  'Face the camera straight on in even lighting and hold still for a moment.',
  'Remove hats, sunglasses, or masks and keep your whole face inside the oval.',
  'If it keeps failing, ask facilities to re-enrol your face from the admin app.',
];

export function FacialRecognitionScreen({
  session,
  onFacePassed,
  onCancel,
}: FacialRecognitionScreenProps) {
  const snackbar = useSnackbar();
  const cameraRef = useRef<CameraView>(null);
  const mounted = useRef(true);

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [attempts, setAttempts] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [model, setModel] = useState<FaceModelState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(session.expiresAt));

  const modelFailure = model && !model.ready ? model : null;

  useEffect(() => {
    mounted.current = true;
    warmUpFaceModel().then((state) => {
      if (mounted.current) setModel(state);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = remainingSeconds(session.expiresAt);
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [session.expiresAt]);

  const run = useCallback(async () => {
    if (status === 'verifying' || !cameraRef.current) return;

    setStatus('verifying');
    setDetail(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
        shutterSound: false,
        exif: false,
      });

      if (!photo?.uri) {
        setStatus('error');
        setDetail('The camera did not return an image. Try again.');
        return;
      }

      const outcome = await captureFaceFromPhoto({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      });

      if (!mounted.current) return;

      if (!outcome.ok) {
        setStatus('error');
        setAttempts((count) => count + 1);
        setDetail(outcome.message);
        return;
      }

      const deviceId = await getDeviceId();
      const result = await verifyFace(
        session.token,
        outcome.capture.embedding,
        outcome.capture.quality,
        deviceId,
      );

      if (!mounted.current) return;

      if (result.ok) {
        setStatus('success');
        snackbar.show(`Identity confirmed — ${result.staff.full_name}`, {
          variant: 'success',
        });
        setTimeout(() => {
          if (mounted.current) onFacePassed(result.authorized_floors);
        }, 900);
        return;
      }

      setStatus('error');
      setAttempts((count) => count + 1);
      setAttemptsLeft(result.attempts_left ?? null);
      setDetail(DENIAL_MESSAGES[result.reason]);
      snackbar.show(DENIAL_MESSAGES[result.reason], { variant: 'error' });

      if (result.reason === 'SessionExpired' || result.reason === 'TooManyAttempts') {
        setTimeout(() => {
          if (mounted.current) onCancel();
        }, 2200);
      }
    } catch (error) {
      if (!mounted.current) return;
      setStatus('error');
      setAttempts((count) => count + 1);
      const message = errorMessage(error, 'Face verification failed. Try again.');
      setDetail(message);
      snackbar.show(message, { variant: 'error' });
    }
  }, [onCancel, onFacePassed, session.token, snackbar, status]);

  const hint = HINTS[Math.min(attempts, HINTS.length - 1)];
  const busy = status === 'verifying';
  const expired = secondsLeft <= 0;

  return (
    <CameraPermissionGate
      icon="face"
      title="Camera access needed"
      reason="Face verification needs the front camera to match you against your enrolled profile."
    >
      <ScannerScaffold
        step="Step 2 of 3"
        title="Face verification"
        subtitle={`${session.staffName} · ${session.companyId}`}
        onExit={onCancel}
        exitIcon="back"
        exitLabel="Back to barcode"
        camera={
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              animateShutter={false}
            />
            <ScannerOverlay shape="portrait" status={status} caption={CAPTIONS[status]} />
          </>
        }
        panel={
          status === 'success' ? (
            <>
              <View style={styles.panelHead}>
                <Icon name="checkCircle" size={20} color={colors.success} />
                <Text style={styles.panelTitle}>Identity confirmed</Text>
              </View>
              <Text style={styles.panelBody}>Choose your floor to finish…</Text>
            </>
          ) : status === 'error' ? (
            <>
              <View style={styles.panelHead}>
                <Icon name="error" size={20} color={colors.danger} />
                <Text style={styles.panelTitle}>Not verified</Text>
              </View>
              <HintRow tone="danger" title="Why">
                {detail ?? 'The face could not be verified.'}
              </HintRow>
              <HintRow tone="warning" title="Helpful hint">
                {hint}
              </HintRow>
              {attemptsLeft != null ? (
                <Text style={styles.meta}>
                  {attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} left on this badge scan.
                </Text>
              ) : null}
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
                  onPress={() => void run()}
                  disabled={expired || attemptsLeft === 0}
                  style={styles.rowBtn}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.panelHead}>
                <Icon name="face" size={20} color={colors.primary} />
                <Text style={styles.panelTitle}>{busy ? 'Verifying…' : 'Ready when you are'}</Text>
              </View>
              <Text style={styles.panelBody}>
                Keep your face centred in the oval and look straight at the camera.
              </Text>

              {modelFailure ? (
                <HintRow
                  tone="danger"
                  title={FACE_MODEL_FAILURE_MESSAGES[modelFailure.failure].title}
                >
                  {FACE_MODEL_FAILURE_MESSAGES[modelFailure.failure].user}
                </HintRow>
              ) : null}

              {expired ? (
                <HintRow tone="warning" title="Badge scan expired">
                  Go back and scan the badge again.
                </HintRow>
              ) : (
                <Text style={styles.meta}>Badge scan valid for {secondsLeft}s.</Text>
              )}

              <GeneralButton
                label={busy ? 'Scanning…' : 'Start face scan'}
                icon="face"
                fullWidth
                loading={busy}
                disabled={busy || expired || modelFailure !== null}
                onPress={() => void run()}
              />
              <GeneralButton
                label="Back to barcode"
                variant="ghost"
                size="sm"
                onPress={onCancel}
                disabled={busy}
              />
            </>
          )
        }
      />
    </CameraPermissionGate>
  );
}

function remainingSeconds(expiresAt: string) {
  const millis = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(millis / 1000));
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
  meta: {
    color: colors.textMuted,
    ...typography.caption,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowBtn: {
    flex: 1,
  },
});

export default FacialRecognitionScreen;
