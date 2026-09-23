import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';

import { useSnackbar } from '@/components/common/Snackbar';
import { HintRow } from '@/components/HintRow';
import { CameraPermissionGate } from '@/components/scanner/CameraPermissionGate';
import { ScannerOverlay, type ScannerStatus } from '@/components/scanner/ScannerOverlay';
import { ScannerScaffold } from '@/components/scanner/ScannerScaffold';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon } from '@/components/ui/Icon';
import { colors, palette, radius, spacing, typography } from '@/constants/themeColor';
import { AppError, errorMessage } from '@/lib/errors';
import {
  ENROLLMENT_SAMPLE_COUNT,
  FACE_MODEL_FAILURE_MESSAGES,
} from '@/services/face/constants';
import {
  cosineSimilarity,
  meanEmbedding,
  warmUpFaceModel,
  type FaceModelState,
} from '@/services/face/embedder';
import { captureFaceFromPhoto, type FaceCapture } from '@/services/face/pipeline';
import type { FaceSamplePayload } from '@/types/database';

const CONSISTENCY_MIN = 0.62;

export type FaceEnrollmentResult = {
  samples: FaceSamplePayload[];
};

export type FaceEnrollmentScreenProps = {
  personName: string;
  onComplete: (result: FaceEnrollmentResult) => void;
  onCancel: () => void;
  submitting?: boolean;
};

export function FaceEnrollmentScreen({
  personName,
  onComplete,
  onCancel,
  submitting = false,
}: FaceEnrollmentScreenProps) {
  const snackbar = useSnackbar();
  const cameraRef = useRef<CameraView>(null);
  const mounted = useRef(true);

  const [captures, setCaptures] = useState<FaceCapture[]>([]);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [issue, setIssue] = useState<string | null>(null);
  const [model, setModel] = useState<FaceModelState | null>(null);

  useEffect(() => {
    mounted.current = true;
    warmUpFaceModel().then((state) => {
      if (mounted.current) setModel(state);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const remaining = ENROLLMENT_SAMPLE_COUNT - captures.length;
  const busy = status === 'verifying' || submitting;
  const modelFailure = model && !model.ready ? model : null;

  const capture = useCallback(async () => {
    if (busy || !cameraRef.current) return;

    setStatus('verifying');
    setIssue(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
        shutterSound: false,
        exif: false,
      });

      if (!photo?.uri) {
        setStatus('error');
        setIssue('The camera did not return an image. Try again.');
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
        setIssue(outcome.message);
        return;
      }

      const template = meanEmbedding(captures.map((existing) => existing.embedding));
      const similarity = template
        ? cosineSimilarity(template, outcome.capture.embedding)
        : 1;

      if (similarity < CONSISTENCY_MIN) {
        setStatus('error');
        setIssue(
          `That capture did not match the earlier ones (${similarity.toFixed(2)}). Make sure the same person is in frame and try again — the captures already accepted are kept.`,
        );
        return;
      }

      const next = [...captures, outcome.capture];
      setCaptures(next);
      setStatus('success');

      if (next.length >= ENROLLMENT_SAMPLE_COUNT) {
        onComplete({
          samples: next.map((item) => ({ embedding: item.embedding, quality: item.quality })),
        });
      } else {
        setTimeout(() => {
          if (mounted.current) setStatus('idle');
        }, 500);
      }
    } catch (error) {
      if (!mounted.current) return;
      setStatus('error');
      const message = errorMessage(error, 'The capture failed. Try again.');
      setIssue(message);
      if (error instanceof AppError && error.code.startsWith('FACE_MODEL')) {
        snackbar.show(message, { variant: 'error', duration: 6000 });
      }
    }
  }, [busy, captures, onComplete, snackbar]);

  const caption =
    status === 'verifying'
      ? 'Analysing the capture…'
      : status === 'error'
        ? 'Capture rejected'
        : status === 'success'
          ? `Capture ${captures.length} of ${ENROLLMENT_SAMPLE_COUNT} accepted`
          : 'Centre the face in the oval';

  return (
    <CameraPermissionGate
      icon="face"
      title="Camera access needed"
      reason="Face enrollment needs the camera to build the staff member's facial template."
    >
      <ScannerScaffold
        step={`Capture ${Math.min(captures.length + 1, ENROLLMENT_SAMPLE_COUNT)} of ${ENROLLMENT_SAMPLE_COUNT}`}
        title="Register face"
        subtitle={personName ? `Enrolling ${personName}` : 'Enrolling new staff member'}
        onExit={onCancel}
        exitIcon="close"
        exitLabel="Cancel enrollment"
        camera={
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              animateShutter={false}
            />
            <ScannerOverlay shape="portrait" status={status} caption={caption} />
          </>
        }
        panel={
          <>
            <View style={styles.panelHead}>
              <Icon
                name={status === 'error' ? 'error' : 'face'}
                size={20}
                color={status === 'error' ? colors.danger : colors.primary}
              />
              <Text style={styles.panelTitle}>
                {status === 'error' ? 'Capture rejected' : `${remaining} capture${remaining === 1 ? '' : 's'} to go`}
              </Text>
            </View>

            <View style={styles.pips}>
              {Array.from({ length: ENROLLMENT_SAMPLE_COUNT }).map((_, index) => (
                <View
                  key={index}
                  style={[styles.pip, index < captures.length && styles.pipFilled]}
                />
              ))}
            </View>

            {modelFailure ? (
              <HintRow tone="danger" title={FACE_MODEL_FAILURE_MESSAGES[modelFailure.failure].title}>
                {FACE_MODEL_FAILURE_MESSAGES[modelFailure.failure].admin}
                {modelFailure.detail ? `\n\nTFLite reported: ${modelFailure.detail}` : ''}
              </HintRow>
            ) : null}

            {issue ? (
              <HintRow tone="warning" title="Adjust and retry">
                {issue}
              </HintRow>
            ) : (
              <Text style={styles.panelBody}>
                Look straight at the camera in even light. Three slightly different captures make
                verification far more reliable.
              </Text>
            )}

            <GeneralButton
              label={busy ? 'Working…' : 'Capture'}
              icon="camera"
              fullWidth
              loading={busy}
              disabled={busy || modelFailure !== null}
              onPress={capture}
            />
            <GeneralButton
              label="Cancel"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onPress={onCancel}
            />
          </>
        }
      />
    </CameraPermissionGate>
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
  pips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pip: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  pipFilled: {
    backgroundColor: palette.gold,
  },
});

export default FaceEnrollmentScreen;
