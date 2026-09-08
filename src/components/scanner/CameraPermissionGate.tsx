import { type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';

import { Screen } from '@/components/layout/Screen';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { HintRow } from '@/components/HintRow';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Loading } from '@/components/common/Loading';
import { colors, radius, spacing, typography } from '@/constants/themeColor';

export type CameraPermissionGateProps = {
  title: string;
  reason: string;
  icon?: IconName;
  children: ReactNode;
};

export function CameraPermissionGate({
  title,
  reason,
  icon = 'camera',
  children,
}: CameraPermissionGateProps) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return (
      <Screen scroll={false} bottomClearance={false}>
        <Loading label="Preparing camera…" style={styles.loading} />
      </Screen>
    );
  }

  if (permission.granted) {
    return <>{children}</>;
  }

  const blocked = !permission.canAskAgain;

  return (
    <Screen scroll={false} bottomClearance={false} contentStyle={styles.gate}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.reason}>{reason}</Text>

      <HintRow tone="info" title="Why we ask" style={styles.hint}>
        The camera feed stays on this device and is only used for the verification step. Nothing is
        recorded or uploaded in this build.
      </HintRow>

      {blocked ? (
        <>
          <HintRow tone="warning" title="Camera access is turned off" style={styles.hint}>
            Enable the camera for Elevator System in your device settings, then come back.
          </HintRow>
          <GeneralButton
            label="Open settings"
            icon="settings"
            fullWidth
            onPress={() => Linking.openSettings()}
          />
        </>
      ) : (
        <GeneralButton
          label="Allow camera access"
          icon="camera"
          fullWidth
          onPress={requestPermission}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
  },
  gate: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    ...typography.title,
  },
  reason: {
    color: colors.textSecondary,
    ...typography.body,
  },
  hint: {
    marginTop: spacing.xs,
  },
});

export default CameraPermissionGate;
