import { StyleSheet, Text, View } from 'react-native';

import { GeneralButton } from '@/components/ui/buttons/GeneralButton';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/modals/Modal';
import { colors, radius, spacing, typography } from '@/constants/themeColor';

export type MessageBoxTone = 'default' | 'danger' | 'success' | 'warning';

export type MessageBoxModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  tone?: MessageBoxTone;
  icon?: IconName;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
  loading?: boolean;
};

const TONE_META: Record<MessageBoxTone, { icon: IconName; fg: string; bg: string }> = {
  default: { icon: 'info', fg: colors.primary, bg: colors.primaryTint },
  danger: { icon: 'delete', fg: colors.danger, bg: colors.dangerTint },
  success: { icon: 'checkCircle', fg: colors.success, bg: colors.successTint },
  warning: { icon: 'warning', fg: colors.warning, bg: colors.warningTint },
};

export function MessageBoxModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  tone = 'default',
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  hideCancel = false,
  loading = false,
}: MessageBoxModalProps) {
  const meta = TONE_META[tone];

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      variant="center"
      showClose={false}
      scroll={false}
      dismissOnBackdropPress={!loading}
    >
      <View style={styles.container}>
        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
          <Icon name={icon ?? meta.icon} size={26} color={meta.fg} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          {hideCancel ? null : (
            <GeneralButton
              label={cancelLabel}
              variant="outline"
              onPress={onClose}
              disabled={loading}
              style={styles.action}
            />
          )}
          <GeneralButton
            label={confirmLabel}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onPress={onConfirm}
            loading={loading}
            style={styles.action}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    ...typography.heading,
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  action: {
    flex: 1,
  },
});

export default MessageBoxModal;
