import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, spacing, typography } from '@/constants/themeColor';
import {
  PERSON_CLIP_MAX_COUNT,
  PERSON_CLIP_TAGS,
  type ClipLabel,
  type PersonClipTag,
} from '@/services/person/constants';

export type ClipLabelEditorProps = {
  label: ClipLabel;
  onChange: (label: ClipLabel) => void;
  disabled?: boolean;
};

export function ClipLabelEditor({ label, onChange, disabled = false }: ClipLabelEditorProps) {
  const setCount = (count: number) =>
    onChange({ ...label, count: Math.max(0, Math.min(PERSON_CLIP_MAX_COUNT, count)) });

  const toggle = (tag: PersonClipTag) =>
    onChange({
      ...label,
      tags: label.tags.includes(tag)
        ? label.tags.filter((entry) => entry !== tag)
        : [...label.tags, tag],
    });

  return (
    <View style={[styles.root, disabled && styles.disabled]} pointerEvents={disabled ? 'none' : 'auto'}>
      <View style={styles.stepperRow}>
        <Text style={styles.caption}>People really in view</Text>
        <View style={styles.stepper}>
          <StepButton
            icon="remove"
            label="One fewer person"
            onPress={() => setCount(label.count - 1)}
            disabled={label.count <= 0}
          />
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {label.count}
          </Text>
          <StepButton
            icon="add"
            label="One more person"
            onPress={() => setCount(label.count + 1)}
            disabled={label.count >= PERSON_CLIP_MAX_COUNT}
          />
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tags}
      >
        {PERSON_CLIP_TAGS.map(({ key, label: text }) => {
          const selected = label.tags.includes(key);
          return (
            <Chip
              key={key}
              label={text}
              size="sm"
              tone={selected ? 'brand' : 'neutral'}
              icon={selected ? 'check' : undefined}
              onPress={() => toggle(key)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        pressed && styles.stepButtonPressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon name={icon} size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.5,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  caption: {
    flex: 1,
    color: colors.textSecondary,
    ...typography.label,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  stepButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  count: {
    minWidth: 28,
    textAlign: 'center',
    color: colors.text,
    ...typography.subheading,
    fontVariant: ['tabular-nums'],
  },
  tags: {
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
});

export default ClipLabelEditor;
