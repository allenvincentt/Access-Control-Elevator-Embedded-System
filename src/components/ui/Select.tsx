import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/modals/Modal';
import { colors, radius, spacing, typography } from '@/constants/themeColor';

export type SelectOption = {
  label: string;
  value: string;
  description?: string;
};

type BaseProps = {
  label: string;
  options: SelectOption[];
  icon?: IconName;
  error?: string | null;
  helperText?: string;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
  sheetTitle?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

export type SelectProps = SingleProps | MultiProps;

export function Select(props: SelectProps) {
  const {
    label,
    options,
    icon,
    error,
    helperText,
    placeholder = 'Select an option',
    containerStyle,
    sheetTitle,
  } = props;
  const [open, setOpen] = useState(false);
  const hasError = Boolean(error);

  const selectedValues = useMemo(
    () => (props.multiple ? props.value : props.value ? [props.value] : []),
    [props],
  );

  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const isFilled = selectedOptions.length > 0;

  const toggle = (value: string) => {
    if (props.multiple) {
      const next = props.value.includes(value)
        ? props.value.filter((item) => item !== value)
        : [...props.value, value];
      props.onChange(next);
    } else {
      props.onChange(value);
      setOpen(false);
    }
  };

  return (
    <View style={containerStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.field, hasError && styles.fieldError]}
      >
        {icon ? (
          <Icon
            name={icon}
            size={20}
            color={hasError ? colors.danger : colors.textMuted}
            style={styles.leadingIcon}
          />
        ) : null}
        <View style={styles.body}>
          <Text style={[styles.label, hasError && styles.labelError]}>{label}</Text>
          {isFilled ? (
            props.multiple ? (
              <View style={styles.chips}>
                {selectedOptions.map((option) => (
                  <Chip key={option.value} label={option.label} size="sm" tone="brand" />
                ))}
              </View>
            ) : (
              <Text style={styles.value}>{selectedOptions[0]?.label}</Text>
            )
          ) : (
            <Text style={styles.placeholder}>{placeholder}</Text>
          )}
        </View>
        <Icon name="chevronDown" size={20} color={colors.textSecondary} />
      </Pressable>

      {hasError ? (
        <View style={styles.assist}>
          <Icon name="error" size={13} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}

      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label}
        subtitle={props.multiple ? 'Select all that apply' : undefined}
        icon={icon}
      >
        <View style={styles.optionList}>
          {options.map((option) => {
            const active = selectedValues.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityRole={props.multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: active }}
                onPress={() => toggle(option.value)}
                style={({ pressed }) => [
                  styles.option,
                  active && styles.optionActive,
                  pressed && styles.optionPressed,
                ]}
              >
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.tick,
                    props.multiple && styles.tickSquare,
                    active && styles.tickActive,
                  ]}
                >
                  {active ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerTint,
  },
  leadingIcon: {
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  label: {
    ...typography.overline,
    letterSpacing: 0.4,
    color: colors.textSecondary,
  },
  labelError: {
    color: colors.danger,
  },
  value: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  placeholder: {
    ...typography.body,
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.hair,
  },
  assist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    ...typography.caption,
  },
  helperText: {
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
    color: colors.textSecondary,
    ...typography.caption,
  },
  optionList: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  optionLabelActive: {
    color: colors.primaryDeep,
  },
  optionDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickSquare: {
    borderRadius: radius.xs,
  },
  tickActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});

export default Select;
