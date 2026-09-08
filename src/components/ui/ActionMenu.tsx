import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/modals/Modal';
import { colors, radius, spacing, typography } from '@/constants/themeColor';

export type ActionMenuItem = {
  key: string;
  label: string;
  icon: IconName;
  tone?: 'default' | 'danger';
  onPress: () => void;
};

export type ActionMenuProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: ActionMenuItem[];
};

export function ActionMenu({ visible, onClose, title = 'Actions', subtitle, items }: ActionMenuProps) {
  return (
    <Modal visible={visible} onClose={onClose} title={title} subtitle={subtitle} scroll={false}>
      <View style={styles.list}>
        {items.map((item) => {
          const danger = item.tone === 'danger';
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
                <Icon name={item.icon} size={18} color={danger ? colors.danger : colors.primary} />
              </View>
              <Text style={[styles.label, danger && styles.labelDanger]}>{item.label}</Text>
              <Icon name="chevronRight" size={18} color={colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  itemPressed: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  iconWrapDanger: {
    backgroundColor: colors.dangerTint,
  },
  label: {
    flex: 1,
    color: colors.text,
    ...typography.bodyStrong,
  },
  labelDanger: {
    color: colors.danger,
  },
});

export default ActionMenu;
