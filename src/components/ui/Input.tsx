import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, fontFamily, radius, spacing, typography } from '@/constants/themeColor';
import { useShake } from '@/hooks/useShake';

const LABEL_TIMING = { duration: 160, easing: Easing.out(Easing.cubic) };

type FieldType = 'text' | 'email' | 'password' | 'phone' | 'number';

export type InputProps = Omit<TextInputProps, 'style' | 'placeholder'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  type?: FieldType;
  icon?: IconName;
  error?: string | null;
  errorSignal?: number | string;
  helperText?: string;
  optional?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  placeholder?: string;
};

const KEYBOARD_BY_TYPE: Record<FieldType, TextInputProps['keyboardType']> = {
  text: 'default',
  email: 'email-address',
  password: 'default',
  phone: 'phone-pad',
  number: 'number-pad',
};

const AUTOCOMPLETE_BY_TYPE: Record<FieldType, TextInputProps['autoComplete']> = {
  text: 'off',
  email: 'email',
  password: 'current-password',
  phone: 'tel',
  number: 'off',
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    value,
    onChangeText,
    type = 'text',
    icon,
    error,
    errorSignal,
    helperText,
    optional = false,
    containerStyle,
    placeholder,
    onFocus,
    onBlur,
    editable = true,
    multiline = false,
    autoCapitalize,
    autoCorrect,
    ...rest
  },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput, []);

  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const floating = focused || value.length > 0;
  const hasError = Boolean(error);
  const shakeStyle = useShake(hasError ? `${errorSignal ?? ''}|${error}` : null);

  const float = useSharedValue(floating ? 1 : 0);
  const focus = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    float.value = withTiming(floating ? 1 : 0, LABEL_TIMING);
  }, [floating, float]);
  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, LABEL_TIMING);
  }, [focused, focus]);

  const labelAnimStyle = useAnimatedStyle(() => ({
    top: interpolate(float.value, [0, 1], [11, 0]),
    fontSize: interpolate(float.value, [0, 1], [15, 11]),
    letterSpacing: interpolate(float.value, [0, 1], [0, 0.4]),
    color: hasError
      ? colors.danger
      : interpolateColor(focus.value, [0, 1], [colors.textMuted, colors.primary]),
  }));

  const fieldAnimStyle = useAnimatedStyle(() => ({
    borderColor: hasError
      ? colors.danger
      : interpolateColor(focus.value, [0, 1], [colors.border, colors.primary]),
    shadowColor: colors.primary,
    shadowOpacity: hasError ? 0 : focus.value * 0.18,
    shadowRadius: focus.value * 10,
    shadowOffset: { width: 0, height: 0 },
  }));

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };
  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  return (
    <View style={containerStyle}>
      <Pressable onPress={() => inputRef.current?.focus()}>
        <Animated.View
          style={[
            styles.field,
            multiline && styles.fieldMultiline,
            focused && styles.fieldFocused,
            hasError && styles.fieldError,
            !editable && styles.fieldDisabled,
            fieldAnimStyle,
            shakeStyle,
          ]}
        >
        {icon ? (
          <Icon
            name={icon}
            size={20}
            color={hasError ? colors.danger : focused ? colors.primary : colors.textMuted}
            style={styles.leadingIcon}
          />
        ) : null}

        <View style={[styles.body, multiline && styles.bodyMultiline]}>
          <Animated.Text
            style={[styles.label, styles.labelBase, labelAnimStyle]}
            numberOfLines={1}
          >
            {label}
            {optional ? '  ·  Optional' : ''}
          </Animated.Text>
          <TextInput
            {...rest}
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            editable={editable}
            multiline={multiline}
            placeholder={floating ? placeholder : undefined}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={isPassword && !reveal}
            keyboardType={KEYBOARD_BY_TYPE[type]}
            autoCapitalize={type === 'email' || type === 'password' ? 'none' : autoCapitalize}
            autoComplete={rest.autoComplete ?? AUTOCOMPLETE_BY_TYPE[type]}
            autoCorrect={type === 'email' || type === 'password' ? false : autoCorrect}
            accessibilityLabel={label}
            cursorColor={colors.primary}
            selectionColor={colors.focusRing}
            style={[styles.input, floating ? styles.inputVisible : styles.inputHidden, multiline && styles.inputMultiline]}
          />
        </View>

        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setReveal((current) => !current)}
            style={({ pressed }) => [styles.trailing, pressed && styles.trailingPressed]}
          >
            <Icon name={reveal ? 'hidden' : 'visible'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        </Animated.View>
      </Pressable>

      {hasError ? (
        <View style={styles.assist}>
          <Icon name="error" size={13} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  fieldFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerTint,
  },
  fieldDisabled: {
    opacity: 0.55,
  },
  leadingIcon: {
    marginTop: 1,
  },
  body: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  bodyMultiline: {
    height: undefined,
    minHeight: 96,
    paddingTop: 18,
  },
  label: {
    position: 'absolute',
    left: 0,
  },
  labelBase: {
    fontFamily: fontFamily.semibold,
    fontWeight: '600',
  },
  input: {
    color: colors.text,
    padding: 0,
    margin: 0,
    ...typography.bodyStrong,
  },
  inputHidden: {
    opacity: 0,
    height: 20,
  },
  inputVisible: {
    opacity: 1,
    marginTop: 16,
    minHeight: 22,
  },
  inputMultiline: {
    marginTop: 0,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  trailing: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  trailingPressed: {
    backgroundColor: colors.surfaceSunken,
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
});

export default Input;
