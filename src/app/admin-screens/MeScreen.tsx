import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSnackbar } from '@/components/common/Snackbar';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DetailRow } from '@/components/ui/DetailRow';
import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon } from '@/components/ui/Icon';
import { MessageBoxModal } from '@/components/ui/modals/MessageBoxModal';
import { colors, radius, spacing, typography } from '@/constants/themeColor';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/errors';
import { sendPasswordReset } from '@/services/authService';
import type { UserRoleKey } from '@/types/database';

const ROLE_COPY: Record<UserRoleKey, { label: string; blurb: string }> = {
  Admin: {
    label: 'Administrator',
    blurb: 'Full control over staff records, authorized floors, face enrollment, and access logs.',
  },
};

export function MeScreen() {
  const { profile, signOut } = useAuth();
  const snackbar = useSnackbar();
  const [confirmOut, setConfirmOut] = useState(false);

  if (!profile) return null;
  const role = ROLE_COPY[profile.user_role];

  const handlePasswordReset = async () => {
    try {
      await sendPasswordReset(profile.email);
      snackbar.show('Password reset link sent to your email', { variant: 'info' });
    } catch (error) {
      snackbar.show(errorMessage(error, 'Could not send a reset link.'), { variant: 'error' });
    }
  };

  return (
    <Screen header={<ScreenHeader overline="Account" title="Me" />}>
      <Card padding="lg" elevated>
        <View style={styles.profile}>
          <Avatar name={profile.full_name} size={72} tone="brand" />
          <Text style={styles.name}>{profile.full_name}</Text>
          <Chip label={role.label} tone="brand" icon="adminRole" />
        </View>
      </Card>

      <Card padding="base">
        <Text style={styles.sectionLabel}>Profile</Text>
        <View style={styles.details}>
          <DetailRow icon="mail" label="Email" value={profile.email} />
          <DetailRow icon="shield" label="User role" value={role.label} />
        </View>
      </Card>

      <View style={styles.roleNote}>
        <Icon name="info" size={16} color={colors.info} />
        <Text style={styles.roleNoteText}>{role.blurb}</Text>
      </View>

      <GeneralButton
        label="Send password reset email"
        icon="key"
        variant="outline"
        fullWidth
        onPress={() => void handlePasswordReset()}
      />

      <GeneralButton
        label="Log out"
        icon="logout"
        variant="danger"
        fullWidth
        onPress={() => setConfirmOut(true)}
      />

      <Text style={styles.version}>Elevator System · v1.0.0</Text>

      <MessageBoxModal
        visible={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={() => {
          setConfirmOut(false);
          void signOut();
        }}
        tone="warning"
        icon="logout"
        title="Log out of Elevator System?"
        message="You’ll need your email and password to sign back in."
        confirmLabel="Log out"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    ...typography.title,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    color: colors.textMuted,
    ...typography.overline,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  details: {
    gap: spacing.hair,
  },
  roleNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoTint,
  },
  roleNoteText: {
    flex: 1,
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 17,
  },
  version: {
    textAlign: 'center',
    color: colors.textMuted,
    ...typography.caption,
    marginTop: spacing.sm,
  },
});

export default MeScreen;
